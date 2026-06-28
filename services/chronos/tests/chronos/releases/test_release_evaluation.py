from __future__ import annotations

import json
import subprocess

import pytest

from chronos.releases.models import ReleaseError, digest_json
from chronos.releases.proofset import build_proofset
from chronos.releases import release_results as release_results_module
from chronos.releases.release_evaluation import (
    load_release_results,
    run_release_evaluation,
    validate_harden_task_source_surface,
)
from chronos.releases.release_results import (
    generate_release_results,
    materialize_release_candidate,
)
from chronos.releases.release_results import cached_release_results_valid
from chronos.releases.harden_adapter import (
    DEFAULT_ANTHROPIC_HARDEN_MODEL,
    require_selected_model_credentials,
    select_harden_models,
)
from chronos.releases.harden_task_materializer import materialize_harden_task_source


def witness():
    return {
        "schema_version": 1,
        "witness_id": "wit-001",
        "source_branch_id": "branch-001",
        "pre_attack_snapshot_ref": "modal-image://im-1",
        "durable_snapshot_mode": "filesystem",
        "history_prefix_ref": "history.json",
        "recorded_actions_ref": "actions.json",
        "action_record_digest": "actions-sha",
        "file_diff_ref": "diff.json",
        "verifier_output_ref": "verifier.json",
        "qa_result_ref": "qa-001",
        "qa_join": {
            "qa_result_id": "qa-001",
            "branch_id": "branch-001",
            "hud_trace_id": "trace-001",
            "action_record_digest": "actions-sha",
            "authoritative_source": "hud_qa",
            "evidence_quality": "sufficient",
            "task_identity_status": "matched",
        },
        "qa_is_reward_hacking": True,
        "source_hud_trace_id": "trace-001",
        "environment_version": "env-v1",
        "environment_image_digest": "image-sha",
        "grader_digest": "grader-v1",
        "reward": 1.0,
        "seed": 1,
        "model": "model",
        "sampling_config": {"temperature": 0.8},
        "exploit_target": "reward-verifier:grader_exploitation",
        "exploit_mechanism": "textual-causal-delta:/app/conftest.py",
        "evaluator_profile": "pytest",
        "cluster_id": "cluster-001",
        "dedup_decision": {"cluster_id": "cluster-001", "decision": "new"},
        "replay_surface": {
            "schema_version": 1,
            "replay_surface_id": "surface-001",
            "environment_version": "env-v1",
            "grader_digest": "grader-v1",
            "command_argv": ["grader", "run", "--case", "sealed-witness"],
            "cwd": "/workspace",
            "pre_grader_command_argv": [],
            "grader_command_argv": ["grader", "grade", "--case", "sealed-witness"],
            "state_restore_ref": "modal-image://im-1",
            "trusted_entrypoint_ref": "grader://entrypoint",
            "captured_at": "2026-06-21T00:00:00Z",
        },
        "replay_entrypoint": "chronos.witnesses.sealing",
        "replay_checks": [
            {"attempt": 1, "reward": 1.0, "model_gateway_request_ids": []},
            {"attempt": 2, "reward": 1.0, "model_gateway_request_ids": []},
            {"attempt": 3, "reward": 1.0, "model_gateway_request_ids": []},
        ],
        "content_digest": "digest",
        "retention_policy": "retain-for-release-regression",
        "created_at": "2026-06-21T00:00:00Z",
    }


def control(control_id):
    return {
        "schema_version": 1,
        "control_id": control_id,
        "task_id": "task",
        "grader_digest": "grader-v1",
        "verifier_harness_digest": "harness-sha",
        "environment_dockerfile_digest": "dockerfile-sha",
        "solution_ref": f"fixtures/{control_id}.py",
        "content_digest": "control-sha",
        "environment_version": "env-v1",
        "task_checksum": "task-sha",
        "baseline_runs": [
            {"run_id": f"{control_id}-1", "reward": 1.0},
            {"run_id": f"{control_id}-2", "reward": 1.0},
            {"run_id": f"{control_id}-3", "reward": 1.0},
        ],
        "frozen_at": "2026-06-21T00:00:00Z",
    }


def proofset():
    return build_proofset(
        witnesses=[witness()],
        controls=[control("control-a"), control("control-b"), control("control-c")],
        taskset_or_suite_ref="suite://proofset",
        selection_query_ref="evidence/query.json",
    )


def test_proofset_infers_pytest_profile_from_replay_surface():
    record = witness()
    del record["evaluator_profile"]
    record["replay_surface"]["grader_command_argv"] = [
        "python",
        "-m",
        "pytest",
        "tests/test_outputs.py",
    ]

    ps = build_proofset(
        witnesses=[record],
        controls=[control("control-a"), control("control-b"), control("control-c")],
        taskset_or_suite_ref="suite://proofset",
        selection_query_ref="evidence/query.json",
    )

    assert ps["evaluator_profiles"] == ["pytest"]


def test_proofset_carries_sealed_replay_surface_identity():
    ps = proofset()

    assert ps["v1_replay_surfaces"] == [
        {
            "witness_id": "wit-001",
            "replay_surface_id": "surface-001",
            "environment_version": "env-v1",
            "grader_digest": "grader-v1",
            "trusted_entrypoint_ref": "grader://entrypoint",
            "cwd": "/workspace",
            "command_argv": ["grader", "run", "--case", "sealed-witness"],
            "pre_grader_command_argv": [],
            "grader_command_argv": ["grader", "grade", "--case", "sealed-witness"],
        }
    ]


def result(case_id, kind, reward, grader, environment="env-v1"):
    return {
        "case_id": case_id,
        "case_kind": kind,
        "reward": reward,
        "environment_version": environment,
        "grader_digest": grader,
        "trace_ref": f"trace://{case_id}",
    }


def evaluator_context():
    return {
        "context_id": "context-v2-001",
        "phase": "v2",
        "environment_version": "env-v2",
        "grader_path": "/opt/chronos/grader/grader.py",
        "grader_digest": "grader-v2",
        "grader_entrypoint_digest": "entrypoint-sha",
        "cwd": "/workspace/release",
        "rootdir": "/workspace/release",
        "python_executable": "/opt/venv/bin/python",
        "python_executable_digest": "python-sha",
        "import_path": ["/opt/chronos/grader", "/opt/venv/lib/python/site-packages"],
        "verifier_plugins": ["pytest-json-report"],
        "evaluator_profile_details": {"pytest_plugins": ["pytest-json-report"]},
        "test_asset_digests": {"/opt/chronos/tests/test_release.py": "test-sha"},
        "trusted_test_roots": ["/opt/chronos/tests"],
        "untrusted_writable_roots": ["/workspace/branch"],
        "captured_at": "2026-06-21T00:00:00Z",
    }


def subversion_results():
    return [
        {"case_id": case_id, "status": "blocked"}
        for case_id in sorted(
            {
                "conftest.py",
                "pytest11",
                "hook/TestReport fabrication",
                "cwd/import shadowing",
                "site-packages mutation",
                "trusted test replacement",
            }
        )
    ]


def fake_harden_run(tmp_path):
    candidate = tmp_path / "candidate"
    (candidate / "tests" / "task_assets").mkdir(parents=True)
    (candidate / "environment" / "task_assets").mkdir(parents=True)
    (candidate / "tests" / "test.sh").write_text(
        "#!/usr/bin/env bash\nexit 0\n", encoding="utf-8"
    )
    (candidate / "tests" / "task_assets" / "test_outputs.py").write_text(
        "def test_ok(): pass\n", encoding="utf-8"
    )
    (candidate / "environment" / "Dockerfile").write_text(
        "FROM mongo:7.0\n", encoding="utf-8"
    )
    (candidate / "environment" / "task_assets" / "instruction.md").write_text(
        "task\n", encoding="utf-8"
    )
    run_root = tmp_path / "run"
    replay = (
        run_root
        / "harden-output"
        / "task"
        / "jobs"
        / "replay_h1_a0__x"
        / "trial"
        / "result.json"
    )
    replay.parent.mkdir(parents=True)
    replay.write_text(
        json.dumps({"verifier_result": {"rewards": {"reward": 0.0}}}), encoding="utf-8"
    )
    return {
        "run_id": "run-fixed",
        "run_root": str(run_root),
        "task_id": "task",
        "result_path": str(tmp_path / "result.json"),
        "result_json": {
            "hardened_dir": str(candidate),
            "iterations": [
                {"iteration": 0, "outcome": "replay_broke_fix", "replay_reward": 1.0},
                {"iteration": 1, "outcome": "fixed", "replay_reward": 0.0},
            ],
        },
        "fixer_artifact_layouts": [
            {
                "job_dir": str(tmp_path / "fixer_h1__x"),
                "nested_logs_artifacts_path": str(tmp_path / "patch"),
            }
        ],
    }


def test_release_evaluation_fails_closed_without_per_case_results(tmp_path):
    ps = proofset()

    with pytest.raises(ReleaseError, match="release evaluation blocked"):
        run_release_evaluation(
            repo_root=tmp_path,
            proof_set=ps,
            harden_task_source=None,
            harden_task_id=None,
            release_results_ref=None,
            artifact_root=tmp_path / "artifacts",
            harden_max_iterations=1,
            harden_timeout_seconds=1,
        )

    blocker_path = (
        tmp_path / "artifacts/release-blockers" / f"{ps['proof_set_id']}.json"
    )
    blocker = json.loads(blocker_path.read_text(encoding="utf-8"))
    assert blocker["status"] == "blocked"
    assert "v2_results" in blocker["missing_evidence"]
    assert blocker["mandatory_subversion_case_ids"] == sorted(
        {
            "conftest.py",
            "pytest11",
            "hook/TestReport fabrication",
            "cwd/import shadowing",
            "site-packages mutation",
            "trusted test replacement",
        }
    )


def test_release_evaluation_seals_from_real_result_contract(tmp_path):
    ps = proofset()
    release_results = {
        "environment_v2": "env-v2",
        "grader_v2_digest": "grader-v2",
        "patch_ref": "artifacts/chronos/releases/patches/patch.diff",
        "fixer_run_ref": "artifacts/chronos/releases/harden-runs/result.json",
        "v1_results": [result("wit-001", "witness", 1.0, "grader-v1")],
        "v2_results": [result("wit-001", "witness", 0.0, "grader-v2", "env-v2")],
        "evaluator_context_refs": [evaluator_context()],
        "subversion_results": subversion_results(),
        "release_candidate_ref": "artifacts/chronos/releases/candidates/v2.json",
    }
    release_results["content_digest"] = digest_json(release_results)
    results_path = tmp_path / "release-results.json"
    results_path.write_text(json.dumps(release_results), encoding="utf-8")

    record = run_release_evaluation(
        repo_root=tmp_path,
        proof_set=ps,
        harden_task_source=None,
        harden_task_id=None,
        release_results_ref=results_path,
        artifact_root=tmp_path / "artifacts",
        harden_max_iterations=1,
        harden_timeout_seconds=1,
    )

    assert record["status"] == "pass"
    assert record["release_proof"]["gate_status"] == "pass"
    assert record["release_proof_ref"].endswith(".json")


def test_release_results_generator_materializes_candidate_and_cases(
    monkeypatch, tmp_path
):
    ps = proofset()
    controls = [control("control-a"), control("control-b"), control("control-c")]
    harden_run = fake_harden_run(tmp_path)
    harden_run_path = tmp_path / "harden-run.json"
    harden_run_path.write_text(json.dumps(harden_run), encoding="utf-8")
    for item in controls:
        solution = tmp_path / item["solution_ref"]
        solution.parent.mkdir(parents=True, exist_ok=True)
        solution.write_text("class SalesAnalyzer: pass\n", encoding="utf-8")
        item["solution_ref"] = str(solution.relative_to(tmp_path))

    def fake_run_docker(*, app, tests, image):
        reward = (
            "0\n"
            if (app / "conftest.py").exists()
            or (app / "pytest.py").exists()
            or (app / "sitecustomize.py").exists()
            or (app / "evil_pytest11_plugin.py").exists()
            else "1\n"
        )
        if (app / "task_assets" / "test_outputs.py").exists():
            reward = "0\n"
        return subprocess.CompletedProcess(["docker"], 0, stdout=reward, stderr="")

    monkeypatch.setattr(release_results_module, "_run_docker", fake_run_docker)

    record = generate_release_results(
        repo_root=tmp_path,
        proof_set=ps,
        witnesses=[witness()],
        controls=controls,
        harden_run_ref=harden_run_path,
        artifact_root=tmp_path / "artifacts",
        control_solution_target="query.py",
    )

    assert record["release_candidate_ref"].endswith(".json")
    assert record["environment_v2"].startswith("task:")
    assert {item["case_id"] for item in record["v1_results"]} == {
        "wit-001",
        "control-a",
        "control-b",
        "control-c",
    }
    assert {item["case_id"] for item in record["v2_results"]} == {
        "wit-001",
        "control-a",
        "control-b",
        "control-c",
    }
    assert all(item["status"] == "blocked" for item in record["subversion_results"])
    assert (
        tmp_path / "artifacts" / "release-results" / f"{ps['proof_set_id']}.json"
    ).is_file()

    def fail_if_docker_runs(*, app, tests, image):
        raise AssertionError("cached release-results should not rerun Docker")

    monkeypatch.setattr(release_results_module, "_run_docker", fail_if_docker_runs)
    assert (
        cached_release_results_valid(
            proof_set=ps,
            harden_run_ref=harden_run_path,
            artifact_root=tmp_path / "artifacts",
        )
        == tmp_path / "artifacts" / "release-results" / f"{ps['proof_set_id']}.json"
    )


def test_release_candidate_requires_terminal_fixed_iteration(tmp_path):
    harden_run = fake_harden_run(tmp_path)
    harden_run["result_json"]["iterations"][-1]["outcome"] = "replay_broke_fix"
    harden_run_path = tmp_path / "harden-run.json"
    harden_run_path.write_text(json.dumps(harden_run), encoding="utf-8")

    with pytest.raises(ReleaseError, match="fixed or robust"):
        materialize_release_candidate(
            harden_run=harden_run,
            harden_run_ref=harden_run_path,
            artifact_root=tmp_path / "artifacts",
        )


def test_release_results_loader_requires_complete_case_contract(tmp_path):
    path = tmp_path / "release-results.json"
    path.write_text(json.dumps({"environment_v2": "env-v2"}), encoding="utf-8")

    with pytest.raises(ReleaseError, match="release results missing"):
        load_release_results(path)


def test_release_evaluation_requires_harden_source_and_id_together(tmp_path):
    with pytest.raises(ReleaseError, match="provided together"):
        run_release_evaluation(
            repo_root=tmp_path,
            proof_set=proofset(),
            harden_task_source=tmp_path,
            harden_task_id=None,
            release_results_ref=None,
            artifact_root=tmp_path / "artifacts",
            harden_max_iterations=1,
            harden_timeout_seconds=1,
        )


def test_harden_task_source_must_declare_exact_replay_surface(tmp_path):
    task_source = tmp_path / "harden-task"
    task_source.mkdir()

    with pytest.raises(ReleaseError, match="chronos-replay-surface.json"):
        validate_harden_task_source_surface(
            proof_set=proofset(), task_source=task_source
        )


def test_harden_task_source_accepts_matching_replay_surface(tmp_path):
    task_source = tmp_path / "harden-task"
    task_source.mkdir()
    ps = proofset()
    (task_source / "chronos-replay-surface.json").write_text(
        json.dumps({"v1_replay_surfaces": ps["v1_replay_surfaces"]}),
        encoding="utf-8",
    )

    validate_harden_task_source_surface(proof_set=ps, task_source=task_source)


def test_harden_task_source_rejects_detached_grader_command(tmp_path):
    task_source = tmp_path / "harden-task"
    task_source.mkdir()
    ps = proofset()
    detached = dict(ps["v1_replay_surfaces"][0])
    detached["grader_command_argv"] = ["bash", "tests/test.sh"]
    (task_source / "chronos-replay-surface.json").write_text(
        json.dumps({"v1_replay_surfaces": [detached]}),
        encoding="utf-8",
    )

    with pytest.raises(ReleaseError, match="grader_command_argv"):
        validate_harden_task_source_surface(proof_set=ps, task_source=task_source)


def test_materialize_harden_task_source_from_explicit_assets(tmp_path):
    assets = tmp_path / "assets"
    task_assets = assets / "task_assets"
    task_assets.mkdir(parents=True)
    (task_assets / "instruction.md").write_text(
        "Implement the task.\n", encoding="utf-8"
    )
    (task_assets / "test_outputs.py").write_text(
        "def test_ok():\n    assert True\n", encoding="utf-8"
    )
    (assets / "Dockerfile.hud").write_text(
        "FROM python:3.12-slim\nWORKDIR /app\nCOPY . /app/\n", encoding="utf-8"
    )
    (assets / "env.py").write_text("# env runtime\n", encoding="utf-8")

    ps = proofset()
    ps["v1_replay_surfaces"][0]["grader_command_argv"] = [
        "bash",
        "-lc",
        "python3 -m pytest task_assets/test_outputs.py -q > .grade.log 2>&1; rc=$?; exit $rc",
    ]
    ps["v1_replay_surfaces"][0]["pre_grader_command_argv"] = [
        "bash",
        "-lc",
        "service start",
    ]
    record = materialize_harden_task_source(
        proof_set=ps,
        task_id="task",
        task_assets_source=assets,
        output_root=tmp_path / "materialized",
    )

    task_source = tmp_path / "materialized" / ps["proof_set_id"] / "task"
    assert record["task_source"] == str(task_source)
    assert (task_source / "instruction.md").read_text(
        encoding="utf-8"
    ) == "Implement the task.\n"
    assert record["verifier_files"] == ["task_assets/test_outputs.py"]
    assert (task_source / "tests/task_assets/test_outputs.py").is_file()
    assert (task_source / "tests/test.sh").is_file()
    test_sh = (task_source / "tests/test.sh").read_text(encoding="utf-8")
    assert "bash -lc" in test_sh
    assert "service start" in test_sh
    assert "cd /" in test_sh
    assert "PYTEST_DISABLE_PLUGIN_AUTOLOAD=1" in test_sh
    assert "PYTHONSAFEPATH=1" in test_sh
    assert "unset PYTHONPATH PYTHONHOME" in test_sh
    assert "/tests/task_assets/test_outputs.py" in test_sh
    assert "python3 -m pytest task_assets/test_outputs.py" not in test_sh
    assert "> .grade.log 2>&1; rc=$?; exit $rc" in test_sh
    assert "/tests/.grade.log" not in test_sh
    assert "echo 1 > /logs/verifier/reward.txt" in test_sh
    assert (task_source / "environment/Dockerfile").is_file()
    dockerfile = (task_source / "environment/Dockerfile").read_text(encoding="utf-8")
    assert "service start" in dockerfile
    assert "tail -f /dev/null" in dockerfile
    assert (task_source / "environment/task_assets/test_outputs.py").is_file()
    validate_harden_task_source_surface(proof_set=ps, task_source=task_source)


def test_materialize_harden_task_source_derives_non_pytest_verifier_asset(tmp_path):
    assets = tmp_path / "assets"
    verifier = assets / "grader" / "run_verifier.sh"
    verifier.parent.mkdir(parents=True)
    (assets / "instruction.md").write_text("Implement the task.\n", encoding="utf-8")
    verifier.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    (assets / "Dockerfile").write_text(
        "FROM debian:bookworm-slim\nWORKDIR /app\nCOPY . /app/\n", encoding="utf-8"
    )

    ps = proofset()
    ps["v1_replay_surfaces"][0]["grader_command_argv"] = [
        "bash",
        "-lc",
        "./grader/run_verifier.sh",
    ]
    record = materialize_harden_task_source(
        proof_set=ps,
        task_id="task",
        task_assets_source=assets,
        output_root=tmp_path / "materialized",
    )

    task_source = tmp_path / "materialized" / ps["proof_set_id"] / "task"
    assert record["verifier_files"] == ["grader/run_verifier.sh"]
    assert (
        (task_source / "tests/grader/run_verifier.sh")
        .read_text(encoding="utf-8")
        .startswith("#!/usr/bin/env bash")
    )
    assert "/tests/grader/run_verifier.sh" in (task_source / "tests/test.sh").read_text(
        encoding="utf-8"
    )


def test_materialize_harden_task_source_rejects_mixed_grader_commands(tmp_path):
    assets = tmp_path / "assets"
    task_assets = assets / "task_assets"
    task_assets.mkdir(parents=True)
    (task_assets / "instruction.md").write_text(
        "Implement the task.\n", encoding="utf-8"
    )
    (task_assets / "test_outputs.py").write_text(
        "def test_ok():\n    assert True\n", encoding="utf-8"
    )
    (assets / "Dockerfile").write_text("FROM python:3.12-slim\n", encoding="utf-8")
    ps = proofset()
    second = dict(ps["v1_replay_surfaces"][0])
    second["witness_id"] = "wit-002"
    second["replay_surface_id"] = "surface-002"
    second["grader_command_argv"] = ["python", "-m", "pytest", "other_tests.py"]
    ps["v1_replay_surfaces"] = [ps["v1_replay_surfaces"][0], second]

    with pytest.raises(ReleaseError, match="mixed grader commands"):
        materialize_harden_task_source(
            proof_set=ps,
            task_id="task",
            task_assets_source=assets,
            output_root=tmp_path / "materialized",
        )


def test_harden_model_selection_uses_anthropic_fallback_not_gemini(monkeypatch):
    monkeypatch.delenv("H2F2H_HARDEN_MODEL", raising=False)
    monkeypatch.delenv("H2F2H_HACKER_MODEL", raising=False)
    monkeypatch.delenv("H2F2H_FIXER_MODEL", raising=False)
    monkeypatch.delenv("H2F2H_SOLVER_MODEL", raising=False)
    monkeypatch.delenv("FORKPROOF_BRANCH_MODEL", raising=False)

    selected = select_harden_models(
        hacker_model=None, fixer_model=None, solver_model=None
    )

    assert selected == {
        "hacker_model": DEFAULT_ANTHROPIC_HARDEN_MODEL,
        "fixer_model": DEFAULT_ANTHROPIC_HARDEN_MODEL,
        "solver_model": DEFAULT_ANTHROPIC_HARDEN_MODEL,
    }


def test_harden_model_credentials_fail_fast_for_selected_provider(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    with pytest.raises(ReleaseError, match="Gemini/Google"):
        require_selected_model_credentials(
            {"solver_model": "gemini/gemini-3.1-pro-preview"}
        )

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises(ReleaseError, match="Anthropic"):
        require_selected_model_credentials(
            {"solver_model": DEFAULT_ANTHROPIC_HARDEN_MODEL}
        )
