"""Plan 007 depth-two contracts: fail-closed gates and real-artifact validation.

The fail-closed and builder tests always run. The committed-artifact tests skip
until a live run has produced the child snapshot and completed depth-two run
artifacts, then validate those real artifacts through the public contracts.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from pathlib import Path

import pytest

from chronos.research.artifacts import build_depth_two_preflight_artifact
from chronos.research.depth_two import build_child_forkpoint, run_depth_two
from chronos.research.models import DepthTwoRunRecord
from chronos.research.resnapshot import (
    ResnapshotError,
    build_child_snapshot_artifact,
    capture_child_snapshot,
)
from chronos.research.scheduler import ResearchScheduler
from chronos.witnesses.branch_task_profile import hud_task_profile

ROOT = Path(__file__).resolve().parents[3]
SEALED_WITNESS = (
    ROOT
    / "docs/plans/evidence/003/artifacts/sealed/witnesses/wit-run-20260621T075711-branch-08.json"
)
SEALED_CAUSAL_DELTA = (
    ROOT
    / "docs/plans/evidence/003/artifacts/sealed/causal-deltas/run-20260621T075711-branch-08.json"
)
PARENT_FORKPOINT = ROOT / "docs/plans/evidence/002/artifacts/forkpoint-record.json"
CHILD_SNAPSHOT_ARTIFACT = (
    ROOT / "artifacts/chronos/research/depth-two-child-snapshot.json"
)
DEPTH_TWO_RUN_ARTIFACT = ROOT / "artifacts/chronos/research/depth-two-run.json"


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _witness() -> dict:
    return _load(SEALED_WITNESS)


def _causal_delta() -> dict:
    return _load(SEALED_CAUSAL_DELTA)


def _good_verification(causal_delta: dict) -> dict:
    verification = {}
    for path, text in (causal_delta.get("added_text") or {}).items():
        verification[path] = {
            "status": "present",
            "sha256": hashlib.sha256(str(text).encode("utf-8")).hexdigest(),
            "size": len(str(text).encode("utf-8")),
        }
    return verification


def _build_valid_child_snapshot(
    child_snapshot_id: str = "im-CHILDTEST0000000000000000",
):
    causal_delta = _causal_delta()
    return build_child_snapshot_artifact(
        witness=_witness(),
        causal_delta=causal_delta,
        source_witness_ref="docs/plans/evidence/003/artifacts/sealed/witnesses/wit-run-20260621T075711-branch-08.json",
        source_causal_delta_ref="docs/plans/evidence/003/artifacts/sealed/causal-deltas/run-20260621T075711-branch-08.json",
        child_snapshot_id=child_snapshot_id,
        runtime_identity={
            "provider": "modal",
            "base_image_id": "im-01KVKYBWZYVZSD79CX5P9SNPXR",
        },
        applied_delta_verification=_good_verification(causal_delta),
        recorded_at="2026-06-21T16:00:00Z",
    )


def test_child_snapshot_artifact_records_filesystem_lineage_from_sealed_witness():
    artifact = _build_valid_child_snapshot()

    assert artifact["status"] == "captured"
    assert artifact["child_snapshot"]["snapshot_mode"] == "filesystem"
    assert (
        artifact["child_snapshot"]["snapshot_ref"]
        == "modal-image://im-CHILDTEST0000000000000000"
    )
    assert (
        artifact["child_snapshot"]["source_pre_attack_snapshot_ref"]
        == "modal-image://im-01KVKYBWZYVZSD79CX5P9SNPXR"
    )
    lineage = artifact["lineage"]
    assert lineage["child_depth"] == 1
    assert (
        lineage["parent_snapshot_ref"] == "modal-image://im-01KVKYBWZYVZSD79CX5P9SNPXR"
    )
    assert lineage["child_snapshot_ref"] == "modal-image://im-CHILDTEST0000000000000000"
    assert artifact["completion_claim"] == "child-snapshot-captured"
    assert artifact["content_digest"]


def test_child_snapshot_artifact_requires_filesystem_durable_snapshot():
    witness = _witness()
    witness["durable_snapshot_mode"] = "memory"
    with pytest.raises(ResnapshotError):
        build_child_snapshot_artifact(
            witness=witness,
            causal_delta=_causal_delta(),
            source_witness_ref="w",
            source_causal_delta_ref="d",
            child_snapshot_id="im-CHILD",
            runtime_identity={},
            applied_delta_verification=_good_verification(_causal_delta()),
            recorded_at="2026-06-21T16:00:00Z",
        )


def test_child_snapshot_artifact_requires_grader_identity():
    witness = _witness()
    witness.pop("grader_digest", None)
    with pytest.raises(ResnapshotError):
        build_child_snapshot_artifact(
            witness=witness,
            causal_delta=_causal_delta(),
            source_witness_ref="w",
            source_causal_delta_ref="d",
            child_snapshot_id="im-CHILD",
            runtime_identity={},
            applied_delta_verification=_good_verification(_causal_delta()),
            recorded_at="2026-06-21T16:00:00Z",
        )


def test_child_snapshot_artifact_requires_verified_applied_delta():
    causal_delta = _causal_delta()
    bad_verification = {
        path: {"status": "present", "sha256": "deadbeef"}
        for path in causal_delta["included_paths"]
    }
    with pytest.raises(ResnapshotError):
        build_child_snapshot_artifact(
            witness=_witness(),
            causal_delta=causal_delta,
            source_witness_ref="w",
            source_causal_delta_ref="d",
            child_snapshot_id="im-CHILD",
            runtime_identity={},
            applied_delta_verification=bad_verification,
            recorded_at="2026-06-21T16:00:00Z",
        )


def test_capture_child_snapshot_fails_closed_without_credentials(monkeypatch):
    monkeypatch.setattr(
        "chronos.research.resnapshot.credential_presence",
        lambda names: {name: "absent" for name in names},
    )
    result = capture_child_snapshot(
        root=ROOT,
        witness=_witness(),
        causal_delta=_causal_delta(),
        source_witness_ref="w",
        source_causal_delta_ref="d",
    )
    assert result["status"] == "blocked"
    assert result["completion_claim"] == "not-complete"
    assert "child_snapshot" not in result


def test_build_child_forkpoint_mirrors_parent_and_swaps_snapshot():
    parent = _load(PARENT_FORKPOINT)
    child_snapshot = {
        "snapshot_id": "im-CHILD",
        "child_node_id": "node-x",
        "snapshot_mode": "filesystem",
    }

    forkpoint = build_child_forkpoint(
        parent_forkpoint=parent, child_snapshot=child_snapshot, child_node_id="node-x"
    )

    assert forkpoint["snapshot_id"] == "im-CHILD"
    assert forkpoint["snapshot_restore_ref"] == "modal-image://im-CHILD"
    assert forkpoint["snapshot_mode"] == "filesystem"
    assert forkpoint["node_id"] == "node-x"
    assert forkpoint["parent_node_id"] == "node-x"
    # grader and environment identity are preserved verbatim from the accepted ForkPoint.
    assert forkpoint["grader_digest"] == parent["grader_digest"]
    assert forkpoint["environment_version"] == parent["environment_version"]
    # The mirrored forkpoint is executable by the proven task loader.
    profile = hud_task_profile(forkpoint)
    assert profile["trusted_entrypoint_ref"] == "env:env"
    assert profile["task_factory"] == "implement_sales_analyzer"


def test_run_depth_two_fails_closed_without_external_qa_approval(monkeypatch):
    monkeypatch.setattr(
        "chronos.research.depth_two.credential_presence",
        lambda names: {name: "present" for name in names},
    )
    monkeypatch.delenv("FORKPROOF_ALLOW_EXTERNAL_QA", raising=False)
    child_snapshot_artifact = {
        "status": "captured",
        "lineage": {"child_depth": 1},
        "child_snapshot": {
            "child_node_id": "node-run-20260621T075711-branch-08",
            "snapshot_id": "im-CHILD",
            "snapshot_ref": "modal-image://im-CHILD",
            "snapshot_mode": "filesystem",
        },
    }

    result = asyncio.run(
        run_depth_two(
            root=ROOT,
            child_snapshot_artifact=child_snapshot_artifact,
            child_snapshot_artifact_ref="artifacts/chronos/research/depth-two-child-snapshot.json",
            branch_budget=8,
        )
    )

    assert result["status"] == "blocked"
    assert result["depth_two_run"]["status"] == "blocked"
    assert "external QA" in (result["depth_two_run"]["blocker"] or "")
    assert result["branch_results"] == []
    assert result["completion_claim"] == "not-complete"


def _captured_child_artifact() -> dict:
    return {
        "status": "captured",
        "lineage": {"child_depth": 1},
        "child_snapshot": {
            "child_node_id": "node-run-20260621T075711-branch-08",
            "snapshot_id": "im-CHILD",
            "snapshot_ref": "modal-image://im-CHILD",
            "snapshot_mode": "filesystem",
        },
    }


def _fake_run_one_branch(
    *, root, forkpoint, task, prompt_packet, run_id, branch_index, artifact_root
):
    bid = f"{run_id}-branch-{branch_index:02d}"
    return {
        "branch": {
            "branch_id": bid,
            "reward": 1.0,
            "status": "success",
            "execution_boundary_crossed": True,
            "hud_trace_id": f"trace-{branch_index}",
            "promotion_signal_status": "rewarded-non-hack",
        },
        "qa": {"status": "pass", "is_reward_hacking": False},
        "branch_ref": f"docs/plans/evidence/007/artifacts/depth-two-runs/{run_id}/branches/{bid}.json",
    }


def _patch_live_branch_execution(monkeypatch):
    monkeypatch.setattr(
        "chronos.research.depth_two.credential_presence",
        lambda names: {name: "present" for name in names},
    )
    monkeypatch.setenv("FORKPROOF_ALLOW_EXTERNAL_QA", "1")
    monkeypatch.setattr(
        "chronos.research.depth_two.load_hud_task",
        lambda root, fp: (object(), {"instruction": "x"}),
    )

    async def fake(**kwargs):
        return _fake_run_one_branch(**kwargs)

    monkeypatch.setattr("chronos.research.depth_two._run_one_branch", fake)


def test_run_depth_two_fails_closed_when_task_load_raises(monkeypatch):
    monkeypatch.setattr(
        "chronos.research.depth_two.credential_presence",
        lambda names: {name: "present" for name in names},
    )
    monkeypatch.setenv("FORKPROOF_ALLOW_EXTERNAL_QA", "1")

    def boom(root, fp):
        raise ImportError("cannot load HUD env module")

    monkeypatch.setattr("chronos.research.depth_two.load_hud_task", boom)

    result = asyncio.run(
        run_depth_two(
            root=ROOT,
            child_snapshot_artifact=_captured_child_artifact(),
            child_snapshot_artifact_ref="x",
            branch_budget=8,
        )
    )

    assert result["status"] == "blocked"
    assert "setup failed" in (result["depth_two_run"]["blocker"] or "")
    assert result["branch_results"] == []
    assert result["completion_claim"] == "not-complete"


def test_run_depth_two_honors_concurrency_and_stops_adaptively(monkeypatch):
    _patch_live_branch_execution(monkeypatch)

    result = asyncio.run(
        run_depth_two(
            root=ROOT,
            child_snapshot_artifact=_captured_child_artifact(),
            child_snapshot_artifact_ref="x",
            branch_budget=8,
            concurrency=2,
        )
    )

    # Two branches are genuinely in flight at once (not a silent sequential no-op).
    assert max(d["in_flight_count"] for d in result["scheduler_decisions"]) == 2
    measured = result["measured_values"]
    assert measured["adaptive_stop_reason"] == "adaptive-stop-four-no-new-cluster"
    assert measured["completed_depth_two_branch_count"] == 4
    run = result["depth_two_run"]
    assert set(run["completed_branch_refs"]).issubset(set(run["scheduled_branch_refs"]))
    assert result["status"] == "completed"


def test_run_depth_two_sequential_keeps_single_in_flight(monkeypatch):
    _patch_live_branch_execution(monkeypatch)

    result = asyncio.run(
        run_depth_two(
            root=ROOT,
            child_snapshot_artifact=_captured_child_artifact(),
            child_snapshot_artifact_ref="x",
            branch_budget=8,
            concurrency=1,
        )
    )

    assert max(d["in_flight_count"] for d in result["scheduler_decisions"]) == 1
    assert result["measured_values"]["completed_depth_two_branch_count"] == 4
    assert result["status"] == "completed"


def test_run_depth_two_fails_closed_on_invalid_scheduler_config(monkeypatch):
    _patch_live_branch_execution(monkeypatch)

    result = asyncio.run(
        run_depth_two(
            root=ROOT,
            child_snapshot_artifact=_captured_child_artifact(),
            child_snapshot_artifact_ref="x",
            branch_budget=0,
        )
    )

    assert result["status"] == "blocked"
    assert "invalid scheduler configuration" in (
        result["depth_two_run"]["blocker"] or ""
    )
    assert result["branch_results"] == []


def test_depth_two_run_record_rejects_duplicate_branch_refs():
    with pytest.raises(ValueError):
        DepthTwoRunRecord(
            run_id="r",
            child_node_id="n",
            status="completed",
            branch_budget=4,
            scheduled_branch_refs=("b1", "b2", "b1"),
            completed_branch_refs=("b1",),
            measured_values={"x": 1},
        )


def test_scheduler_rejects_empty_node_id():
    with pytest.raises(ValueError):
        ResearchScheduler(node_id="", node_depth=1)


def test_integration_preflight_blocks_run_whose_branch_files_are_missing():
    manifest = _load(ROOT / "docs/plans/evidence/003/MANIFEST.json")
    fabricated_child = {
        "status": "captured",
        "lineage": {"child_depth": 1},
        "child_snapshot": {
            "snapshot_mode": "filesystem",
            "snapshot_id": "im-x",
            "included_paths": ["/app/conftest.py"],
            "applied_delta_verification": {"/app/conftest.py": {"status": "present"}},
        },
    }
    fabricated_run = {
        "status": "completed",
        "depth_two_run": {
            "status": "completed",
            "scheduled_branch_refs": ["does/not/exist/branch-00.json"],
            "completed_branch_refs": ["does/not/exist/branch-00.json"],
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
        child_snapshot=fabricated_child,
        depth_two_run=fabricated_run,
        root=ROOT,
    )

    # The recorded completed branch artifacts do not exist on disk, so the
    # verifier must stay blocked rather than report a fabricated run as ready.
    assert artifact["status"] == "blocked"
    assert artifact["depth_two_execution"]["status"] == "blocked"


def test_depth_two_cli_fails_closed_on_unreadable_child_snapshot(tmp_path):
    from chronos.research.cli import depth_two as depth_two_cli

    corrupt = tmp_path / "child.json"
    corrupt.write_text("{ not valid json", encoding="utf-8")

    exit_code = depth_two_cli(
        output_path=tmp_path / "out.json", child_snapshot_path=corrupt
    )
    assert exit_code == 2


def test_integration_cli_fails_closed_when_plan003_manifest_missing(
    tmp_path, monkeypatch
):
    from chronos.research import cli as research_cli

    monkeypatch.setattr(
        research_cli, "PLAN003_MANIFEST", tmp_path / "missing-manifest.json"
    )

    exit_code = research_cli.integration(output_path=tmp_path / "preflight.json")
    assert exit_code == 2


# --- Real committed-artifact contracts (skip until the live run has produced them) ---


def test_committed_child_snapshot_artifact_is_durable_and_reprovable():
    if not CHILD_SNAPSHOT_ARTIFACT.exists():
        pytest.skip("child re-snapshot artifact not yet produced by a live run")
    artifact = _load(CHILD_SNAPSHOT_ARTIFACT)

    assert artifact["status"] == "captured"
    child = artifact["child_snapshot"]
    assert child["snapshot_mode"] == "filesystem"
    assert child["snapshot_ref"].startswith("modal-image://")
    assert child["grader_digest"]
    assert artifact["lineage"]["child_depth"] == 1

    # The committed provenance still passes the fail-closed builder gate.
    reproven = build_child_snapshot_artifact(
        witness=_witness(),
        causal_delta=_causal_delta(),
        source_witness_ref=artifact["source_witness_ref"],
        source_causal_delta_ref=artifact["source_causal_delta_ref"],
        child_snapshot_id=child["snapshot_id"],
        runtime_identity=artifact["runtime_identity"],
        applied_delta_verification=child["applied_delta_verification"],
        recorded_at=artifact["recorded_at"],
    )
    assert reproven["child_snapshot"]["snapshot_ref"] == child["snapshot_ref"]
    assert reproven["lineage"] == artifact["lineage"]


def test_committed_depth_two_run_is_completed_with_measured_values_and_stop_event():
    if not DEPTH_TWO_RUN_ARTIFACT.exists():
        pytest.skip("depth-two run artifact not yet produced by a live run")
    artifact = _load(DEPTH_TWO_RUN_ARTIFACT)

    assert artifact["status"] == "completed"
    run = artifact["depth_two_run"]
    assert run["status"] == "completed"
    assert run["completed_branch_refs"], (
        "completed run must record completed branch refs"
    )
    assert set(run["completed_branch_refs"]).issubset(set(run["scheduled_branch_refs"]))
    assert run["measured_values"], "completed run must record measured values"
    assert artifact["stop_event"], "a completed adaptive run records a real stop event"
    assert artifact["scheduler_decisions"], (
        "a real run records scheduler decision events"
    )

    # Branch sub-artifacts live under Plan 007-owned evidence, never Plan 003's.
    assert artifact["branch_artifact_root"].startswith("docs/plans/evidence/007/")

    # The committed run still satisfies the public depth-two record invariants.
    rebuilt = DepthTwoRunRecord(
        run_id=run["run_id"],
        child_node_id=run["child_node_id"],
        status="completed",
        branch_budget=run["branch_budget"],
        scheduled_branch_refs=tuple(run["scheduled_branch_refs"]),
        completed_branch_refs=tuple(run["completed_branch_refs"]),
        stop_event_ref=run["stop_event_ref"],
        measured_values=run["measured_values"],
        recorded_at=run["recorded_at"],
    ).to_record()
    assert rebuilt["status"] == "completed"
