"""Plan 007 round-four hardening tests: error-path coverage, verifier
consistency, aliasing safety, and boundary guards. All hermetic (no live calls)."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from chronos.research.artifacts import build_depth_two_preflight_artifact
from chronos.research.depth_two import (
    HUD_TASK_PROFILE,
    build_child_forkpoint,
    run_depth_two,
)
from chronos.research.models import DepthTwoRunRecord, SchedulerConfig
from chronos.research.resnapshot import ResnapshotError, build_child_snapshot_artifact
from chronos.research.scheduler import ResearchScheduler

ROOT = Path(__file__).resolve().parents[3]
SEALED_WITNESS = (
    ROOT
    / "docs/plans/evidence/003/artifacts/sealed/witnesses/wit-run-20260621T075711-branch-08.json"
)
SEALED_CAUSAL_DELTA = (
    ROOT
    / "docs/plans/evidence/003/artifacts/sealed/causal-deltas/run-20260621T075711-branch-08.json"
)


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _captured_child(snapshot_mode: str = "filesystem") -> dict:
    return {
        "status": "captured",
        "lineage": {"child_depth": 1},
        "child_snapshot": {
            "child_node_id": "node-x",
            "snapshot_id": "im-x",
            "snapshot_ref": "modal-image://im-x",
            "snapshot_mode": snapshot_mode,
        },
    }


def _fake_success(run_id: str, branch_index: int) -> dict:
    bid = f"{run_id}-branch-{branch_index:02d}"
    return {
        "branch": {
            "branch_id": bid,
            "reward": 1.0,
            "status": "success",
            "execution_boundary_crossed": True,
            "hud_trace_id": f"t{branch_index}",
            "promotion_signal_status": "rewarded-non-hack",
        },
        "qa": {"status": "pass", "is_reward_hacking": False},
        "branch_ref": f"docs/plans/evidence/007/artifacts/depth-two-runs/{run_id}/branches/{bid}.json",
    }


def _patch_present(monkeypatch):
    monkeypatch.setattr(
        "chronos.research.depth_two.credential_presence",
        lambda names: {name: "present" for name in names},
    )
    monkeypatch.setenv("FORKPROOF_ALLOW_EXTERNAL_QA", "1")
    monkeypatch.setattr(
        "chronos.research.depth_two.load_hud_task",
        lambda root, fp: (object(), {"instruction": "x"}),
    )


def test_run_depth_two_records_executor_error_and_continues(monkeypatch):
    _patch_present(monkeypatch)

    async def fake(**kwargs):
        if kwargs["branch_index"] == 1:
            raise RuntimeError("provider boom")
        return _fake_success(kwargs["run_id"], kwargs["branch_index"])

    monkeypatch.setattr("chronos.research.depth_two._run_one_branch", fake)

    result = asyncio.run(
        run_depth_two(
            root=ROOT,
            child_snapshot_artifact=_captured_child(),
            child_snapshot_artifact_ref="x",
            branch_budget=8,
            concurrency=1,
        )
    )

    # The raising branch is recorded as executor-error, excluded from completed,
    # the scheduler still advances, and the run completes without crashing.
    errors = [b for b in result["branch_results"] if b["status"] == "executor-error"]
    assert len(errors) == 1
    assert errors[0]["error_class"] == "RuntimeError"
    assert result["status"] == "completed"
    assert result["measured_values"]["completed_depth_two_branch_count"] == 3
    run = result["depth_two_run"]
    assert set(run["completed_branch_refs"]).issubset(set(run["scheduled_branch_refs"]))


def test_integration_preflight_blocks_inconsistent_child_and_run():
    manifest = _load(ROOT / "docs/plans/evidence/003/MANIFEST.json")
    child = {
        "status": "captured",
        "lineage": {"child_depth": 1},
        "child_snapshot": {
            "snapshot_mode": "filesystem",
            "snapshot_id": "im-NEW",
            "snapshot_ref": "modal-image://im-NEW",
            "included_paths": ["/app/conftest.py"],
            "applied_delta_verification": {"/app/conftest.py": {"status": "present"}},
        },
    }
    # The run references a DIFFERENT child image than the captured child snapshot.
    run = {
        "status": "completed",
        "child_snapshot_ref": "modal-image://im-OLD",
        "depth_two_run": {
            "status": "completed",
            "scheduled_branch_refs": ["docs/plans/evidence/007/MANIFEST.json"],
            "completed_branch_refs": ["docs/plans/evidence/007/MANIFEST.json"],
            "measured_values": {"completed_depth_two_branch_count": 1},
        },
        "stop_event": {
            "node_id": "n",
            "scheduled_count": 1,
            "completed_count": 1,
            "reason": "x",
        },
    }

    artifact = build_depth_two_preflight_artifact(
        plan003_manifest=manifest,
        child_selection_ref="x",
        child_selection_exists=True,
        command_ref="x",
        recorded_at="2026-06-21T16:00:00Z",
        child_snapshot=child,
        depth_two_run=run,
        root=ROOT,
    )

    assert artifact["status"] == "blocked"
    assert any("different child snapshots" in b for b in artifact["blockers"])


def test_build_child_forkpoint_does_not_corrupt_module_constant():
    before = {
        key: list(value) if isinstance(value, list) else value
        for key, value in HUD_TASK_PROFILE.items()
    }

    forkpoint = build_child_forkpoint(
        parent_forkpoint={"snapshot_digest": "d"},
        child_snapshot={"snapshot_id": "im-x"},
        child_node_id="node-x",
    )
    forkpoint["hud_task_profile"]["capture_roots"].append("/evil")
    forkpoint["hud_task_profile"]["grader_command_argv"].append("rm -rf")

    assert HUD_TASK_PROFILE["capture_roots"] == before["capture_roots"]
    assert HUD_TASK_PROFILE["grader_command_argv"] == before["grader_command_argv"]


def test_depth_two_run_record_to_record_is_defensively_copied():
    record = DepthTwoRunRecord(
        run_id="r",
        child_node_id="n",
        status="completed",
        branch_budget=4,
        scheduled_branch_refs=("b1",),
        completed_branch_refs=("b1",),
        measured_values={"nested": {"x": 1}},
    )

    emitted = record.to_record()
    emitted["measured_values"]["nested"]["x"] = 999

    assert record.measured_values["nested"]["x"] == 1


def test_scheduler_config_rejects_nonpositive_concurrency():
    with pytest.raises(ValueError):
        SchedulerConfig(concurrency=0)


def test_scheduler_config_rejects_out_of_range_budget():
    with pytest.raises(ValueError):
        SchedulerConfig(child_budget=9)


def test_scheduler_complete_branch_rejects_unscheduled_branch():
    scheduler = ResearchScheduler(node_id="node-child")
    with pytest.raises(ValueError):
        scheduler.complete_branch("never-scheduled", confirmed_cluster_id=None)


def test_run_depth_two_blocked_when_child_snapshot_not_filesystem(monkeypatch):
    _patch_present(monkeypatch)

    result = asyncio.run(
        run_depth_two(
            root=ROOT,
            child_snapshot_artifact=_captured_child(snapshot_mode="memory"),
            child_snapshot_artifact_ref="x",
            branch_budget=8,
        )
    )

    assert result["status"] == "blocked"
    assert "not filesystem-class" in (result["depth_two_run"]["blocker"] or "")


def test_child_snapshot_artifact_rejects_empty_included_paths():
    causal_delta = {**_load(SEALED_CAUSAL_DELTA), "included_paths": []}
    with pytest.raises(ResnapshotError):
        build_child_snapshot_artifact(
            witness=_load(SEALED_WITNESS),
            causal_delta=causal_delta,
            source_witness_ref="w",
            source_causal_delta_ref="d",
            child_snapshot_id="im-CHILD",
            runtime_identity={},
            applied_delta_verification={},
            recorded_at="2026-06-21T16:00:00Z",
        )


def test_depth_two_cli_exits_two_on_blocked_run(tmp_path, monkeypatch):
    from chronos.research import cli as research_cli

    child = tmp_path / "child.json"
    child.write_text(json.dumps(_captured_child()), encoding="utf-8")

    async def fake_run(**kwargs):
        return {
            "status": "blocked",
            "depth_two_run": {"blocker": "no completed branches"},
            "measured_values": None,
        }

    monkeypatch.setattr(research_cli, "run_depth_two", fake_run)

    exit_code = research_cli.depth_two(
        output_path=tmp_path / "out.json", child_snapshot_path=child
    )
    assert exit_code == 2
