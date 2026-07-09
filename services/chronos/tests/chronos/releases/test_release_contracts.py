from __future__ import annotations

from pathlib import Path

import pytest

from chronos.releases.artifact_store import ReleaseArtifactStore
from chronos.releases.gate import bounded_failure_proof, evaluate_gate
from chronos.releases.harden_adapter import inspect_harden_config
from chronos.releases.models import ReleaseError
from chronos.releases.proofset import build_proofset
from chronos.releases.release_proof import seal_release_proof
from chronos.releases.subversion import (
    GENERIC_VERIFIER_SUBVERSION_CHECKS,
    PYTEST_SUBVERSION_CHECKS,
)


def witness(**overrides):
    record = {
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
        "exploit_mechanism": "textual-causal-delta:/task/hook.py",
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
    record.update(overrides)
    return record


def control(control_id="control-001", **overrides):
    record = {
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
    record.update(overrides)
    return record


def proofset():
    return build_proofset(
        witnesses=[witness()],
        controls=[control("control-a"), control("control-b"), control("control-c")],
        taskset_or_suite_ref="suite://proofset",
        selection_query_ref="evidence/query.json",
    )


def test_proofset_accepts_semantic_success_replay_checks_for_existing_witnesses():
    legacy_replays = [
        {"attempt": 1, "semantic_success": True, "model_gateway_request_ids": []},
        {"attempt": 2, "semantic_success": True, "model_gateway_request_ids": []},
        {"attempt": 3, "semantic_success": True, "model_gateway_request_ids": []},
    ]

    record = build_proofset(
        witnesses=[witness(replay_checks=legacy_replays)],
        controls=[control("control-a"), control("control-b"), control("control-c")],
        taskset_or_suite_ref="suite://proofset",
        selection_query_ref="evidence/query.json",
    )

    assert record["exploit_witness_ids"] == ["wit-001"]


def result(case_id, kind, reward, grader, environment="env-v1"):
    return {
        "case_id": case_id,
        "case_kind": kind,
        "reward": reward,
        "environment_version": environment,
        "grader_digest": grader,
        "trace_ref": f"trace://{case_id}",
    }


def evaluator_context(**overrides):
    record = {
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
    record.update(overrides)
    return record


def subversion_results(**overrides):
    records = [
        {"case_id": case_id, "status": "blocked"}
        for case_id in sorted(PYTEST_SUBVERSION_CHECKS)
    ]
    for record in records:
        record.update(overrides.get(record["case_id"], {}))
    return records


def generic_subversion_results(**overrides):
    records = [
        {"case_id": case_id, "status": "blocked"}
        for case_id in sorted(GENERIC_VERIFIER_SUBVERSION_CHECKS)
    ]
    for record in records:
        record.update(overrides.get(record["case_id"], {}))
    return records


def test_proofset_requires_non_empty_sealed_witness_membership():
    with pytest.raises(ReleaseError, match="at least one"):
        build_proofset(
            witnesses=[],
            controls=[control("a"), control("b"), control("c")],
            taskset_or_suite_ref="suite",
            selection_query_ref="query",
        )


def test_proofset_rejects_branchrun_candidate_shape():
    with pytest.raises(ReleaseError, match="Witness missing"):
        build_proofset(
            witnesses=[{"branch_id": "candidate-only", "reward": 1.0}],
            controls=[control("a"), control("b"), control("c")],
            taskset_or_suite_ref="suite",
            selection_query_ref="query",
        )


def test_release_gate_all_pass_seals_releaseproof():
    ps = proofset()
    v1 = [
        result("wit-001", "witness", 1.0, "grader-v1"),
        result("control-a", "control", 1.0, "grader-v1"),
    ]
    v2 = [
        result("wit-001", "witness", 0.0, "grader-v2", "env-v2"),
        result("control-a", "control", 1.0, "grader-v2", "env-v2"),
    ]

    proof = evaluate_gate(
        proof_set=ps,
        environment_v2="env-v2",
        grader_v2_digest="grader-v2",
        patch_ref="patch.diff",
        fixer_run_ref="harden/result.json",
        v1_results=v1,
        v2_results=v2,
        evaluator_context_refs=[evaluator_context()],
        subversion_results=subversion_results(),
        release_candidate_ref="release-candidate.json",
    )

    assert proof["gate_status"] == "pass"
    assert proof["witnesses_killed"] == 1
    assert proof["controls_preserved"] == 1
    assert proof["rejection_history"] == []
    assert proof["family_variant_results"] == []


def test_release_gate_accepts_generic_non_pytest_evaluator_profile():
    ps = build_proofset(
        witnesses=[
            witness(witness_id="wit-generic", evaluator_profile="generic-verifier")
        ],
        controls=[control("control-a"), control("control-b"), control("control-c")],
        taskset_or_suite_ref="suite://proofset",
        selection_query_ref="evidence/query.json",
    )
    proof = evaluate_gate(
        proof_set=ps,
        environment_v2="env-v2",
        grader_v2_digest="grader-v2",
        patch_ref="patch.diff",
        fixer_run_ref="harden/result.json",
        v1_results=[result("wit-generic", "witness", 1.0, "grader-v1")],
        v2_results=[result("wit-generic", "witness", 0.0, "grader-v2", "env-v2")],
        evaluator_context_refs=[evaluator_context(verifier_plugins=["custom-runner"])],
        subversion_results=generic_subversion_results(),
        release_candidate_ref="release-candidate.json",
    )

    assert proof["gate_status"] == "pass"
    assert ps["evaluator_profiles"] == ["generic-verifier"]


def test_release_gate_rejects_surviving_witness_and_broken_control():
    ps = proofset()
    v1 = [
        result("wit-001", "witness", 1.0, "grader-v1"),
        result("control-a", "control", 1.0, "grader-v1"),
    ]
    v2 = [
        result("wit-001", "witness", 1.0, "grader-v2", "env-v2"),
        result("control-a", "control", 0.0, "grader-v2", "env-v2"),
    ]

    proof = evaluate_gate(
        proof_set=ps,
        environment_v2="env-v2",
        grader_v2_digest="grader-v2",
        patch_ref="patch.diff",
        fixer_run_ref="harden/result.json",
        v1_results=v1,
        v2_results=v2,
        evaluator_context_refs=[evaluator_context()],
        subversion_results=subversion_results(),
        release_candidate_ref="release-candidate.json",
    )

    assert proof["gate_status"] == "reject"
    assert proof["surviving_witness_ids"] == ["wit-001"]
    assert proof["broken_control_ids"] == ["control-a"]
    assert proof["rejection_history"][0]["gate_decision"] == "reject"
    assert proof["rejection_history"][0]["surviving_witness_ids"] == ["wit-001"]
    assert proof["rejection_history"][0]["broken_control_ids"] == ["control-a"]
    assert proof["rejection_history"][0]["per_case_results"][0]["case_id"] == "wit-001"


def test_release_gate_rejects_mixed_digests_and_v1_failure():
    ps = proofset()
    with pytest.raises(ReleaseError, match="v1 case did not reproduce"):
        evaluate_gate(
            proof_set=ps,
            environment_v2="env-v2",
            grader_v2_digest="grader-v2",
            patch_ref="patch.diff",
            fixer_run_ref="harden/result.json",
            v1_results=[result("wit-001", "witness", 0.0, "grader-v1")],
            v2_results=[result("wit-001", "witness", 0.0, "grader-v2", "env-v2")],
            evaluator_context_refs=[evaluator_context()],
            subversion_results=subversion_results(),
            release_candidate_ref="release-candidate.json",
        )
    with pytest.raises(ReleaseError, match="mixed grader"):
        evaluate_gate(
            proof_set=ps,
            environment_v2="env-v2",
            grader_v2_digest="grader-v2",
            patch_ref="patch.diff",
            fixer_run_ref="harden/result.json",
            v1_results=[result("wit-001", "witness", 1.0, "wrong")],
            v2_results=[result("wit-001", "witness", 0.0, "grader-v2", "env-v2")],
            evaluator_context_refs=[evaluator_context()],
            subversion_results=subversion_results(),
            release_candidate_ref="release-candidate.json",
        )


def test_subversion_survival_and_missing_context_reject():
    ps = proofset()
    v1 = [result("wit-001", "witness", 1.0, "grader-v1")]
    v2 = [result("wit-001", "witness", 0.0, "grader-v2", "env-v2")]
    with pytest.raises(ReleaseError, match="context"):
        evaluate_gate(
            proof_set=ps,
            environment_v2="env-v2",
            grader_v2_digest="grader-v2",
            patch_ref="patch.diff",
            fixer_run_ref="harden/result.json",
            v1_results=v1,
            v2_results=v2,
            evaluator_context_refs=[],
            subversion_results=subversion_results(),
            release_candidate_ref="release-candidate.json",
        )
    with pytest.raises(ReleaseError, match="subversion"):
        evaluate_gate(
            proof_set=ps,
            environment_v2="env-v2",
            grader_v2_digest="grader-v2",
            patch_ref="patch.diff",
            fixer_run_ref="harden/result.json",
            v1_results=v1,
            v2_results=v2,
            evaluator_context_refs=[evaluator_context()],
            subversion_results=subversion_results(pytest11={"status": "survived"}),
            release_candidate_ref="release-candidate.json",
        )

    with pytest.raises(ReleaseError, match="missing mandatory"):
        evaluate_gate(
            proof_set=ps,
            environment_v2="env-v2",
            grader_v2_digest="grader-v2",
            patch_ref="patch.diff",
            fixer_run_ref="harden/result.json",
            v1_results=v1,
            v2_results=v2,
            evaluator_context_refs=[evaluator_context()],
            subversion_results=[{"case_id": "conftest.py", "status": "blocked"}],
            release_candidate_ref="release-candidate.json",
        )


def test_release_gate_rejects_missing_or_mixed_environment_identity():
    ps = proofset()
    missing_identity = result("wit-001", "witness", 1.0, "grader-v1")
    del missing_identity["environment_version"]
    with pytest.raises(ReleaseError, match="missing"):
        evaluate_gate(
            proof_set=ps,
            environment_v2="env-v2",
            grader_v2_digest="grader-v2",
            patch_ref="patch.diff",
            fixer_run_ref="harden/result.json",
            v1_results=[missing_identity],
            v2_results=[result("wit-001", "witness", 0.0, "grader-v2", "env-v2")],
            evaluator_context_refs=[evaluator_context()],
            subversion_results=subversion_results(),
            release_candidate_ref="release-candidate.json",
        )

    with pytest.raises(ReleaseError, match="mixed environment"):
        evaluate_gate(
            proof_set=ps,
            environment_v2="env-v2",
            grader_v2_digest="grader-v2",
            patch_ref="patch.diff",
            fixer_run_ref="harden/result.json",
            v1_results=[result("wit-001", "witness", 1.0, "grader-v1", "wrong-env")],
            v2_results=[result("wit-001", "witness", 0.0, "grader-v2", "env-v2")],
            evaluator_context_refs=[evaluator_context()],
            subversion_results=subversion_results(),
            release_candidate_ref="release-candidate.json",
        )


def test_release_gate_rejects_branch_writable_evaluator_surface():
    ps = proofset()
    v1 = [result("wit-001", "witness", 1.0, "grader-v1")]
    v2 = [result("wit-001", "witness", 0.0, "grader-v2", "env-v2")]

    for unsafe_context in [
        evaluator_context(grader_path="/workspace/branch/grader.py"),
        evaluator_context(
            import_path=["/workspace/branch", "/opt/venv/lib/python/site-packages"]
        ),
        evaluator_context(trusted_test_roots=["/workspace/branch/tests"]),
    ]:
        with pytest.raises(ReleaseError, match="untrusted writable root"):
            evaluate_gate(
                proof_set=ps,
                environment_v2="env-v2",
                grader_v2_digest="grader-v2",
                patch_ref="patch.diff",
                fixer_run_ref="harden/result.json",
                v1_results=v1,
                v2_results=v2,
                evaluator_context_refs=[unsafe_context],
                subversion_results=subversion_results(),
                release_candidate_ref="release-candidate.json",
            )


def test_release_artifact_store_round_trip(tmp_path):
    store = ReleaseArtifactStore(tmp_path)
    path = store.create(
        "proofsets",
        "proofset-001",
        {"schema_version": 1, "proof_set_id": "proofset-001"},
    )
    assert path.exists()
    record = store.read("proofsets", "proofset-001")
    assert record["proof_set_id"] == "proofset-001"
    with pytest.raises(ReleaseError, match="already exists"):
        store.create("proofsets", "proofset-001", {"schema_version": 1})


def test_releaseproof_seals_through_append_only_store(tmp_path):
    ps = proofset()
    proof = evaluate_gate(
        proof_set=ps,
        environment_v2="env-v2",
        grader_v2_digest="grader-v2",
        patch_ref="patch.diff",
        fixer_run_ref="harden/result.json",
        v1_results=[result("wit-001", "witness", 1.0, "grader-v1")],
        v2_results=[result("wit-001", "witness", 0.0, "grader-v2", "env-v2")],
        evaluator_context_refs=[evaluator_context()],
        subversion_results=subversion_results(),
        release_candidate_ref="release-candidate.json",
    )
    store = ReleaseArtifactStore(tmp_path)

    sealed = seal_release_proof(store=store, release_proof=proof)

    assert sealed["release_proof_id"] == proof["release_proof_id"]
    assert (
        seal_release_proof(store=store, release_proof=proof)["content_digest"]
        == sealed["content_digest"]
    )


def test_bounded_failure_requires_rejection_history_and_seals():
    ps = proofset()
    with pytest.raises(ReleaseError, match="rejection history"):
        bounded_failure_proof(
            proof_set=ps,
            environment_v2="env-v2",
            grader_v2_digest="grader-v2",
            patch_ref="patch.diff",
            fixer_run_ref="harden/result.json",
            rejection_history=[],
            evaluator_context_refs=[evaluator_context()],
            release_candidate_ref="release-candidate.json",
        )

    proof = bounded_failure_proof(
        proof_set=ps,
        environment_v2="env-v2",
        grader_v2_digest="grader-v2",
        patch_ref="patch.diff",
        fixer_run_ref="harden/result.json",
        rejection_history=[
            {
                "iteration": 9,
                "fixer_run_ref": "harden/result.json",
                "patch_ref": "patch.diff",
                "per_case_results": [{"case_id": "wit-001", "reward": 1.0}],
                "surviving_witness_ids": ["wit-001"],
                "broken_control_ids": [],
                "gate_decision": "reject",
            }
        ],
        evaluator_context_refs=[evaluator_context()],
        release_candidate_ref="release-candidate.json",
    )

    assert proof["gate_status"] == "bounded_failure"
    assert proof["rejection_history"][0]["iteration"] == 9


@pytest.mark.skipif(
    not Path(".external/harden-v0/harden/config.py").exists(),
    reason="harden-v0 external dep not bootstrapped "
    "(.external/harden-v0 — see scripts/bootstrap_external_deps.sh)",
)
def test_harden_config_inspection_reads_real_schema():
    config = Path(".external/harden-v0/harden/config.py")
    schema = inspect_harden_config(config)
    assert schema["iteration_bounds"]["max_iterations"] == 10
    assert schema["iteration_bounds"]["hacker_retries"] == 3
    assert schema["iteration_bounds"]["replay_retries"] == 1
    result_schema = schema["result_json_schema"]
    assert {"task_id", "status", "iterations", "oracle", "kernelbench_mode"} <= set(
        result_schema["implementation_fields"]
    )
    assert {"robust", "max_iterations", "solver_failed_precheck", "unknown"} <= set(
        result_schema["status_values"]
    )
    assert "result.json" in " ".join(result_schema["output_paths"])
