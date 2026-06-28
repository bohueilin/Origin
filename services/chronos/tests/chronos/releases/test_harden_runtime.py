from __future__ import annotations

import json
import subprocess

import pytest

from chronos.releases import harden_runtime_patch
from chronos.releases.harden_adapter import (
    DEFAULT_ANTHROPIC_HARDEN_MODEL,
    harden_result_blocker,
    inspect_fixer_artifact_layouts,
    inspect_hacker_refusal_loops,
    run_harden_v0,
)
from chronos.releases.harden_runtime_patch import (
    build_authorized_hacker_instruction,
    extract_fixer_artifacts,
    resolve_fixer_artifacts,
)
from chronos.releases.models import ReleaseError


def test_harden_release_adapter_disables_legitimate_marker(monkeypatch, tmp_path):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    task_source = tmp_path / "source"
    (task_source / "tests").mkdir(parents=True)
    (task_source / "environment").mkdir()
    (task_source / "instruction.md").write_text("task", encoding="utf-8")
    captured = {}

    def fake_run(command, *, cwd, text, capture_output, timeout, check):
        captured["command"] = command
        output_dir = command[command.index("--output-dir") + 1]
        task_id = command[command.index("--task-id") + 1]
        result_dir = tmp_path / output_dir / task_id
        result_dir.mkdir(parents=True)
        (result_dir / "result.json").write_text(
            json.dumps(
                {"task_id": task_id, "status": "max_iterations", "iterations": []}
            ),
            encoding="utf-8",
        )
        return subprocess.CompletedProcess(command, returncode=0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)

    record = run_harden_v0(
        repo_root=tmp_path,
        harden_root=tmp_path / "harden-v0",
        task_id="task-001",
        task_source=task_source,
        output_root=tmp_path / "release-artifacts",
        max_iterations=1,
        timeout_seconds=1,
        hacker_max_turns=80,
        hacker_model=DEFAULT_ANTHROPIC_HARDEN_MODEL,
        fixer_model=DEFAULT_ANTHROPIC_HARDEN_MODEL,
        solver_model=DEFAULT_ANTHROPIC_HARDEN_MODEL,
    )

    assert "--no-legitimate-marker" in captured["command"]
    assert "--replay-enabled" in captured["command"]
    output_dir = captured["command"][captured["command"].index("--output-dir") + 1]
    assert "/run-" in output_dir
    assert output_dir.endswith("/harden-output")
    assert captured["command"][captured["command"].index("--hacker-retries") + 1] == "1"
    assert (
        captured["command"][captured["command"].index("--solver-precheck-retries") + 1]
        == "1"
    )
    assert captured["command"][captured["command"].index("--replay-retries") + 1] == "1"
    assert (
        captured["command"][captured["command"].index("--hacker-max-turns") + 1] == "80"
    )
    command_source = captured["command"][captured["command"].index("-c") + 1]
    assert "_install_harden_patch()" in command_source
    assert record["result_json"]["status"] == "max_iterations"
    assert record["run_id"].startswith("run-")


def test_harden_adapter_rejects_zero_attempt_retry_flags(tmp_path):
    task_source = tmp_path / "task-source"
    (task_source / "tests").mkdir(parents=True)
    (task_source / "environment").mkdir()
    (task_source / "instruction.md").write_text("task", encoding="utf-8")

    with pytest.raises(ReleaseError) as exc:
        run_harden_v0(
            repo_root=tmp_path,
            harden_root=tmp_path / "harden-v0",
            task_id="task-001",
            task_source=task_source,
            output_root=tmp_path / "release-artifacts",
            max_iterations=1,
            timeout_seconds=1,
            hacker_retries=0,
            hacker_model=DEFAULT_ANTHROPIC_HARDEN_MODEL,
            fixer_model=DEFAULT_ANTHROPIC_HARDEN_MODEL,
            solver_model=DEFAULT_ANTHROPIC_HARDEN_MODEL,
        )

    assert exc.value.error_class == "harden_attempts_disabled"
    assert "use 1 for one attempt with zero retry attempts" in str(exc.value)


def test_harden_adapter_reports_nested_fixer_artifact_layout(tmp_path):
    repo = (
        tmp_path
        / "harden-output"
        / "task-001"
        / "jobs"
        / "fixer_h0__20260621_000000__abcdef12"
        / "task-001__trial"
        / "artifacts"
        / "logs"
        / "artifacts"
    )
    (repo / "tests").mkdir(parents=True)
    (repo / "tests" / "test_outputs.py").write_text(
        "def test_old(): pass\n", encoding="utf-8"
    )
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    subprocess.run(
        ["git", "config", "user.email", "test@example.test"], cwd=repo, check=True
    )
    subprocess.run(["git", "config", "user.name", "Test User"], cwd=repo, check=True)
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "initial"], cwd=repo, check=True)
    subprocess.run(["git", "tag", "initial"], cwd=repo, check=True)
    (repo / "tests" / "test_outputs.py").write_text(
        "def test_new(): pass\n", encoding="utf-8"
    )
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "fix"], cwd=repo, check=True)

    layouts = inspect_fixer_artifact_layouts(tmp_path / "harden-output", "task-001")

    assert layouts[0]["layout_status"] == "nested_logs_artifacts"
    assert layouts[0]["expected_artifacts_git"] == {
        "is_git_repo": False,
        "has_initial_ref": False,
    }
    assert layouts[0]["nested_logs_artifacts_git"] == {
        "is_git_repo": True,
        "has_initial_ref": True,
    }
    assert layouts[0]["changed_files"] == ["tests/test_outputs.py"]
    assert layouts[0]["patch_digest"]

    blocker = harden_result_blocker(
        {"iterations": [{"outcome": "fix_failed"}]}, layouts, []
    )
    assert blocker["code"] == "harden_fixer_artifact_layout_drift"
    assert blocker["changed_files"] == ["tests/test_outputs.py"]

    blocker = harden_result_blocker(
        {"iterations": [{"outcome": "fix_failed"}]},
        layouts,
        [{"reward": 0.0, "trial_dir": "solver-trial"}],
    )
    assert blocker["code"] == "harden_candidate_broke_solver_validation"
    assert blocker["solver_validation_results"] == [
        {"reward": 0.0, "trial_dir": "solver-trial"}
    ]

    blocker = harden_result_blocker(
        {
            "iterations": [
                {"iteration": 0, "outcome": "fix_failed"},
                {"iteration": 1, "outcome": "replay_broke_fix", "replay_reward": 1.0},
            ]
        },
        layouts,
        [{"reward": 0.0, "trial_dir": "older-solver-trial"}],
    )
    assert blocker["code"] == "harden_replay_broke_candidate_fix"
    assert blocker["replay_failures"] == [
        {"iteration": 1, "outcome": "replay_broke_fix", "replay_reward": 1.0}
    ]

    blocker = harden_result_blocker(
        {
            "iterations": [
                {"iteration": 0, "outcome": "replay_broke_fix", "replay_reward": 1.0},
                {"iteration": 1, "outcome": "fixed", "replay_reward": 0.0},
            ]
        },
        layouts,
        [{"reward": 1.0, "trial_dir": "latest-solver-trial"}],
    )
    assert blocker is None


def test_harden_adapter_reports_hacker_refusal_loop(tmp_path):
    trajectory_path = (
        tmp_path
        / "harden-output"
        / "task-001"
        / "jobs"
        / "hacker_h0_a0__20260621_000000__abcdef12"
        / "task-001__trial"
        / "agent"
        / "trajectory.json"
    )
    trajectory_path.parent.mkdir(parents=True)
    trajectory_path.write_text(
        json.dumps(
            {
                "steps": [
                    {
                        "step_id": 1,
                        "timestamp": "2026-06-21T10:00:00Z",
                        "model_name": "model-a",
                        "message": "Analysis: Declined\nPlan: Cannot proceed",
                    },
                    {
                        "step_id": 2,
                        "timestamp": "2026-06-21T10:00:01Z",
                        "model_name": "model-a",
                        "message": "I will not continue this task.",
                    },
                    {
                        "step_id": 3,
                        "timestamp": "2026-06-21T10:00:02Z",
                        "model_name": "model-a",
                        "message": "I refuse to engage further.",
                    },
                ],
                "final_metrics": {"total_prompt_tokens": 123},
            }
        ),
        encoding="utf-8",
    )

    refusal_loops = inspect_hacker_refusal_loops(tmp_path / "harden-output", "task-001")

    assert refusal_loops == [
        {
            "schema_version": 1,
            "trajectory_ref": str(trajectory_path),
            "trial_dir": str(trajectory_path.parents[1]),
            "job_dir": str(trajectory_path.parents[2]),
            "step_count": 3,
            "decline_step_count": 3,
            "last_decline_step_id": 3,
            "last_decline_timestamp": "2026-06-21T10:00:02Z",
            "last_model_name": "model-a",
            "last_message_excerpt": "I refuse to engage further.",
            "final_metrics": {"total_prompt_tokens": 123},
        }
    ]
    blocker = harden_result_blocker(None, [], [], refusal_loops)
    assert blocker["code"] == "harden_hacker_model_refusal_loop"


def test_harden_runtime_patch_applies_nested_fixer_artifacts(tmp_path):
    trial_dir = tmp_path / "trial"
    repo = trial_dir / "artifacts" / "logs" / "artifacts"
    (repo / "tests").mkdir(parents=True)
    (repo / "environment").mkdir()
    (repo / "tests" / "test_outputs.py").write_text(
        "def test_old():\n    assert True\n", encoding="utf-8"
    )
    (repo / "environment" / "Dockerfile").write_text("FROM scratch\n", encoding="utf-8")
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    subprocess.run(
        ["git", "config", "user.email", "test@example.test"], cwd=repo, check=True
    )
    subprocess.run(["git", "config", "user.name", "Test User"], cwd=repo, check=True)
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "initial"], cwd=repo, check=True)
    subprocess.run(["git", "tag", "initial"], cwd=repo, check=True)
    (repo / "tests" / "test_outputs.py").write_text(
        "def test_new():\n    assert True\n", encoding="utf-8"
    )
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "fix"], cwd=repo, check=True)

    working_copy = tmp_path / "working"
    task_dir = working_copy / "task-001"
    (task_dir / "tests").mkdir(parents=True)
    (task_dir / "environment").mkdir()
    (task_dir / "tests" / "test_outputs.py").write_text(
        "def test_old():\n    assert True\n", encoding="utf-8"
    )

    assert resolve_fixer_artifacts(trial_dir) == repo
    assert extract_fixer_artifacts(trial_dir, working_copy, "task-001") == "applied"
    assert (task_dir / "tests" / "test_outputs.py").read_text(encoding="utf-8") == (
        "def test_new():\n    assert True\n"
    )


def test_harden_runtime_patch_uses_authorized_audit_prompt_for_generic_tasks(
    monkeypatch,
):
    monkeypatch.setattr(
        harden_runtime_patch,
        "_UPSTREAM_BUILD_HACKER_INSTRUCTION",
        lambda original_instruction, kernelbench_mode=False, journal_text=None: (
            "upstream"
        ),
    )

    prompt = build_authorized_hacker_instruction(
        "Task text\n\n## Your Goal\nSolve normally."
    )

    assert "authorized benchmark-integrity audit" in prompt
    assert "exploit the verification system" not in prompt
    assert "A normal correct implementation is not counted" in prompt


def test_harden_runtime_patch_preserves_kernelbench_hacker_prompt(monkeypatch):
    calls = []

    def fake_upstream(original_instruction, kernelbench_mode=False, journal_text=None):
        calls.append((original_instruction, kernelbench_mode, journal_text))
        return "kernelbench-upstream"

    monkeypatch.setattr(
        harden_runtime_patch, "_UPSTREAM_BUILD_HACKER_INSTRUCTION", fake_upstream
    )

    assert (
        build_authorized_hacker_instruction(
            "KB task",
            kernelbench_mode=True,
            journal_text="prior",
        )
        == "kernelbench-upstream"
    )
    assert calls == [("KB task", True, "prior")]
