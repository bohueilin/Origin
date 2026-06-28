from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from chronos.research.artifacts import (
    build_child_selection_artifact,
    build_conditional_research_report,
    build_depth_two_preflight_artifact,
)
from chronos.research.capability import CapabilityGateError, classify_capability_gate
from chronos.research.cli import integration
from chronos.research.models import (
    ChildCandidate,
    DepthTwoRunRecord,
    FlatComparisonReport,
    ResearchSkip,
    ResearchLineage,
    SchedulerConfig,
    TransferTrainingReport,
)
from chronos.research.reports import (
    ReportError,
    require_evidence_backed_skip,
    validate_flat_comparison,
    validate_transfer_training,
)
from chronos.research.scheduler import ResearchScheduler
from chronos.research.selection import ResearchError, select_promising_child


ROOT = Path(__file__).resolve().parents[3]
CHILD_SELECTION_ARTIFACT = (
    ROOT
    / "artifacts/chronos/research/child-selection-wit-run-20260621T075711-branch-08.json"
)
SOURCE_WITNESS = (
    ROOT
    / "docs/plans/evidence/003/artifacts/sealed/witnesses/wit-run-20260621T075711-branch-08.json"
)
SOURCE_CAUSAL_DELTA = (
    ROOT
    / "docs/plans/evidence/003/artifacts/sealed/causal-deltas/run-20260621T075711-branch-08.json"
)
CONDITIONAL_RESEARCH_REPORT = (
    ROOT / "artifacts/chronos/research/conditional-research-report.json"
)


def test_scheduler_stops_after_four_completed_no_new_cluster_branches():
    scheduler = ResearchScheduler(node_id="node-child")

    for _ in range(4):
        decision = scheduler.schedule_next()
        assert decision is not None
        scheduler.complete_branch(decision.branch_id or "", confirmed_cluster_id=None)

    assert scheduler.can_schedule() is False
    stop = scheduler.stop_event()
    assert stop is not None
    assert stop.reason == "adaptive-stop-four-no-new-cluster"
    assert stop.scheduled_count == 4
    assert scheduler.consecutive_no_new_cluster == 4


def test_scheduler_resets_on_new_cluster_and_respects_eight_branch_budget():
    scheduler = ResearchScheduler(node_id="node-child")

    for _ in range(3):
        branch = scheduler.schedule_next()
        assert branch is not None
        scheduler.complete_branch(branch.branch_id or "", confirmed_cluster_id=None)
    branch = scheduler.schedule_next()
    assert branch is not None
    scheduler.complete_branch(branch.branch_id or "", confirmed_cluster_id="cluster-a")

    assert scheduler.consecutive_no_new_cluster == 0
    while scheduler.can_schedule():
        branch = scheduler.schedule_next()
        assert branch is not None
        scheduler.complete_branch(branch.branch_id or "", confirmed_cluster_id=None)

    stop = scheduler.stop_event()
    assert stop is not None
    assert stop.reason == "budget-exhausted"
    assert stop.scheduled_count == 8


def test_scheduler_allows_in_flight_completion_and_late_new_cluster_reset():
    scheduler = ResearchScheduler(
        node_id="node-child", config=SchedulerConfig(concurrency=5)
    )
    branches = []
    for _ in range(5):
        decision = scheduler.schedule_next()
        assert decision is not None
        branches.append(decision.branch_id or "")

    for branch_id in branches[:4]:
        scheduler.complete_branch(branch_id, confirmed_cluster_id=None)
    assert scheduler.can_schedule() is False
    assert scheduler.stop_event() is None

    scheduler.complete_branch(branches[4], confirmed_cluster_id="late-cluster")
    assert scheduler.consecutive_no_new_cluster == 0
    assert scheduler.can_schedule() is True


def test_scheduler_never_counts_raw_reward_as_new_cluster():
    scheduler = ResearchScheduler(node_id="node-child")
    branch = scheduler.schedule_next()
    assert branch is not None
    scheduler.complete_branch(branch.branch_id or "", confirmed_cluster_id=None)

    assert scheduler.consecutive_no_new_cluster == 1
    assert all(decision.new_cluster_id is None for decision in scheduler.decisions)


def test_scheduler_only_expands_completed_depth_one_children():
    scheduler = ResearchScheduler(node_id="node-child", node_depth=1)
    decision = scheduler.schedule_next()
    assert decision is not None
    assert decision.branch_id == "node-child-depth2-00"

    with pytest.raises(ValueError, match="depth-one child"):
        ResearchScheduler(node_id="node-root", node_depth=0)
    with pytest.raises(ValueError, match="depth-one child"):
        ResearchScheduler(node_id="node-depth-two", node_depth=2)


def test_promising_child_requires_observable_signal_not_reasoning_only():
    reasoning_only = ChildCandidate(
        node_id="node-child",
        parent_node_id="node-root",
        depth=1,
        snapshot_ref="snapshot://child",
        branch_ref="branch.json",
        observable_signals=(),
        exposed_reasoning_refs=("reasoning.txt",),
    )

    with pytest.raises(ResearchError):
        select_promising_child([reasoning_only])


def test_promising_child_records_observable_fork_reason_and_alternatives():
    candidate = ChildCandidate(
        node_id="node-child",
        parent_node_id="node-root",
        depth=1,
        snapshot_ref="snapshot://child",
        branch_ref="branch.json",
        observable_signals=(
            {
                "kind": "file_change",
                "parent_value": "sha-parent",
                "child_value": "sha-child",
                "ref": "diff.json",
            },
        ),
        alternatives_considered=("node-other",),
    )

    record = select_promising_child([candidate])

    assert record["node_id"] == "node-child"
    assert record["observable_signal_count"] == 1
    assert "file_change" in str(record["fork_reason"])
    assert record["alternatives_considered"] == ["node-other"]


def test_research_lineage_requires_depth_one_child_and_snapshot_refs():
    lineage = ResearchLineage(
        root_fork_point_id="fp-001",
        parent_node_id="fp-001",
        child_node_id="node-child",
        child_depth=1,
        parent_snapshot_ref="modal-image://root",
        child_snapshot_ref="modal-image://child",
        source_branch_ref="branch.json",
        source_witness_ref="witness.json",
    )

    record = lineage.to_record()
    assert record["child_depth"] == 1
    assert record["source_witness_ref"] == "witness.json"

    with pytest.raises(ValueError):
        ResearchLineage(
            root_fork_point_id="fp-001",
            parent_node_id="fp-001",
            child_node_id="node-too-deep",
            child_depth=2,
            parent_snapshot_ref="modal-image://root",
            child_snapshot_ref="modal-image://child",
            source_branch_ref="branch.json",
        )


def test_depth_two_run_record_distinguishes_blocked_from_completed_runs():
    blocked = DepthTwoRunRecord(
        run_id="research-run-001",
        child_node_id="node-child",
        status="blocked",
        branch_budget=8,
        blocker="no mapped live executor",
    ).to_record()

    assert blocked["status"] == "blocked"
    assert blocked["completed_branch_refs"] == []
    assert blocked["content_digest"]

    completed = DepthTwoRunRecord(
        run_id="research-run-002",
        child_node_id="node-child",
        status="completed",
        branch_budget=8,
        scheduled_branch_refs=("branch-00.json",),
        completed_branch_refs=("branch-00.json",),
        measured_values={"completed_depth_two_branch_count": 1},
    ).to_record()
    assert completed["measured_values"]["completed_depth_two_branch_count"] == 1

    with pytest.raises(ValueError):
        DepthTwoRunRecord(
            run_id="research-run-003",
            child_node_id="node-child",
            status="completed",
            branch_budget=8,
        )
    with pytest.raises(ValueError, match="must have been scheduled"):
        DepthTwoRunRecord(
            run_id="research-run-004",
            child_node_id="node-child",
            status="completed",
            branch_budget=8,
            scheduled_branch_refs=("branch-00.json",),
            completed_branch_refs=("branch-01.json",),
        )
    with pytest.raises(ValueError, match="measured values"):
        DepthTwoRunRecord(
            run_id="research-run-005",
            child_node_id="node-child",
            status="completed",
            branch_budget=8,
            scheduled_branch_refs=("branch-00.json",),
            completed_branch_refs=("branch-00.json",),
        )


def test_committed_child_selection_artifact_matches_public_contracts():
    artifact = json.loads(CHILD_SELECTION_ARTIFACT.read_text(encoding="utf-8"))
    selection = artifact["selection_record"]
    lineage = artifact["lineage"]
    depth_two = artifact["depth_two_run"]

    candidate = ChildCandidate(
        node_id=selection["node_id"],
        parent_node_id=selection["parent_node_id"],
        depth=selection["depth"],
        snapshot_ref=selection["snapshot_ref"],
        branch_ref=selection["branch_ref"],
        observable_signals=tuple(selection["observable_signals"]),
        exposed_reasoning_refs=tuple(selection["exposed_reasoning_refs"]),
        alternatives_considered=tuple(selection["alternatives_considered"]),
    )

    selected = select_promising_child([candidate])
    assert selected["observable_signal_count"] == 3
    assert {signal["kind"] for signal in selected["observable_signals"]} == {
        "cluster_precursor",
        "file_change",
        "grader_visible_state",
    }
    assert artifact["status"] == "selected-not-resnapshotted"

    lineage_record = ResearchLineage(
        root_fork_point_id=lineage["root_fork_point_id"],
        parent_node_id=lineage["parent_node_id"],
        child_node_id=lineage["child_node_id"],
        child_depth=lineage["child_depth"],
        parent_snapshot_ref=lineage["parent_snapshot_ref"],
        child_snapshot_ref=lineage["child_snapshot_ref"],
        source_branch_ref=lineage["source_branch_ref"],
        source_witness_ref=lineage["source_witness_ref"],
    ).to_record()
    assert lineage_record["child_depth"] == 1
    assert lineage_record["source_witness_ref"] == artifact["source_witness_ref"]

    run_record = DepthTwoRunRecord(
        run_id=depth_two["run_id"],
        child_node_id=depth_two["child_node_id"],
        status=depth_two["status"],
        branch_budget=depth_two["branch_budget"],
        scheduled_branch_refs=tuple(depth_two["scheduled_branch_refs"]),
        completed_branch_refs=tuple(depth_two["completed_branch_refs"]),
        stop_event_ref=depth_two["stop_event_ref"],
        blocker=depth_two["blocker"],
        measured_values=depth_two["measured_values"],
    ).to_record()
    assert run_record["status"] == "blocked"
    assert run_record["completed_branch_refs"] == []
    assert run_record["measured_values"]["completed_depth_two_branch_count"] == 0


def test_child_selection_artifact_is_reproducible_from_sealed_witness():
    expected = json.loads(CHILD_SELECTION_ARTIFACT.read_text(encoding="utf-8"))
    witness = json.loads(SOURCE_WITNESS.read_text(encoding="utf-8"))
    causal_delta = json.loads(SOURCE_CAUSAL_DELTA.read_text(encoding="utf-8"))

    generated = build_child_selection_artifact(
        witness=witness,
        causal_delta=causal_delta,
        source_witness_ref=expected["source_witness_ref"],
        source_causal_delta_ref=expected["source_causal_delta_ref"],
        alternatives_considered=tuple(
            expected["selection_record"]["alternatives_considered"]
        ),
        recorded_at=expected["recorded_at"],
    )

    assert generated == expected


def test_depth_two_preflight_artifact_records_fail_closed_gate():
    manifest = json.loads(
        (ROOT / "docs/plans/evidence/003/MANIFEST.json").read_text(encoding="utf-8")
    )

    artifact = build_depth_two_preflight_artifact(
        plan003_manifest=manifest,
        child_selection_ref="artifacts/chronos/research/child-selection-wit-run-20260621T075711-branch-08.json",
        child_selection_exists=True,
        command_ref="uv run python -m chronos.research.cli integration",
        recorded_at="2026-06-21T11:43:19Z",
    )

    assert artifact["status"] == "blocked"
    assert artifact["plan003_gate"]["status"] == "pass"
    assert artifact["child_selection"]["status"] == "present"
    assert artifact["depth_two_execution"]["executor"] == "not-mapped"
    assert artifact["depth_two_execution"]["completed_branch_run_ref"] is None
    assert artifact["completion_claim"] == "not-complete"
    assert artifact["content_digest"]


def test_integration_cli_writes_preflight_artifact_and_fails_closed(tmp_path):
    output = tmp_path / "depth-two-preflight.json"

    # Absent child-snapshot/depth-two evidence always drives the fail-closed path.
    exit_code = integration(
        output_path=output,
        child_snapshot_path=tmp_path / "missing-child-snapshot.json",
        depth_two_run_path=tmp_path / "missing-depth-two-run.json",
    )

    assert exit_code == 2
    artifact = json.loads(output.read_text(encoding="utf-8"))
    assert artifact["artifact_id"] == "plan-007-depth-two-integration-preflight"
    assert artifact["status"] == "blocked"
    assert artifact["plan003_gate"]["status"] == "pass"
    assert artifact["depth_two_execution"]["status"] == "blocked"
    assert artifact["depth_two_execution"]["completed_branch_run_ref"] is None
    assert any(
        "completed depth-two BranchRun" in blocker for blocker in artifact["blockers"]
    )
    assert artifact["completion_claim"] == "not-complete"


def test_conditional_research_report_records_not_measured_packets():
    artifact = build_conditional_research_report(
        sealed_witness_ref="docs/plans/evidence/003/artifacts/sealed/witnesses/wit-run-20260621T075711-branch-08.json",
        child_selection_ref="artifacts/chronos/research/child-selection-wit-run-20260621T075711-branch-08.json",
        preflight_ref="artifacts/chronos/research/depth-two-integration-preflight.json",
        command_map_ref="docs/plans/repo-map/COMMANDS.json",
        recorded_at="2026-06-21T13:57:00Z",
    )

    assert artifact["status"] == "not-measured"
    assert artifact["flat_comparison"]["status"] == "not-measured"
    assert artifact["transfer_training"]["transfer_status"] == "not-measured"
    assert artifact["transfer_training"]["training_filter_status"] == "not-measured"
    assert {skip["packet"] for skip in artifact["skips"]} == {
        "WP4 flat restart comparison",
        "WP5 Memory Snapshot",
        "WP5 VM Sandbox",
        "WP6 transfer/training",
    }
    assert artifact["capability_profiles"]["memory"]["live_probe"] == "not-run"
    assert artifact["completion_claim"] == "not-complete"
    assert artifact["content_digest"]


def test_committed_conditional_research_report_is_reproducible():
    expected = json.loads(CONDITIONAL_RESEARCH_REPORT.read_text(encoding="utf-8"))

    generated = build_conditional_research_report(
        sealed_witness_ref=expected["evidence_refs"][0],
        child_selection_ref=expected["evidence_refs"][1],
        preflight_ref=expected["evidence_refs"][2],
        command_map_ref=expected["evidence_refs"][3],
        recorded_at=expected["recorded_at"],
    )

    assert generated == expected


def test_capability_gate_returns_exact_unavailable_outcome_without_scaffold_refs():
    record = classify_capability_gate(
        profile="memory",
        probe_succeeded=False,
        probe_ref="artifacts/probe.json",
    )

    assert record.outcome == "unavailable"
    assert record.consumed_path_ref is None
    assert record.durable_conversion_ref is None


def test_capability_gate_records_available_unneeded_with_task_evidence():
    record = classify_capability_gate(
        profile="vm",
        probe_succeeded=True,
        probe_ref="artifacts/vm-probe.json",
        task_need_ref="artifacts/task-need.json",
        task_need_unique=False,
        security_ref="artifacts/security.json",
    )

    assert record.outcome == "available-unneeded"
    assert record.task_need_ref == "artifacts/task-need.json"


def test_capability_gate_requires_consumed_path_and_memory_conversion_when_needed():
    with pytest.raises(CapabilityGateError):
        classify_capability_gate(
            profile="memory",
            probe_succeeded=True,
            probe_ref="artifacts/memory-probe.json",
            task_need_ref="artifacts/task-need.json",
            task_need_unique=True,
            security_ref="artifacts/security.json",
            security_sufficient=True,
            consumed_path_ref="artifacts/consumer.json",
        )

    record = classify_capability_gate(
        profile="memory",
        probe_succeeded=True,
        probe_ref="artifacts/memory-probe.json",
        task_need_ref="artifacts/task-need.json",
        task_need_unique=True,
        security_ref="artifacts/security.json",
        security_sufficient=True,
        consumed_path_ref="artifacts/consumer.json",
        durable_conversion_ref="artifacts/durable-conversion.json",
    )
    assert record.outcome == "available-needed"


def test_reports_require_measurements_or_explicit_not_measured_limits():
    with pytest.raises(ReportError):
        validate_flat_comparison(
            FlatComparisonReport(status="not-measured", protocol_ref=None)
        )

    flat = validate_flat_comparison(
        FlatComparisonReport(
            status="not-measured",
            protocol_ref=None,
            limitation="No sealed Witness exists, so no comparable depth-two budget can run.",
        )
    )
    assert flat["status"] == "not-measured"
    assert flat["content_digest"]

    transfer = validate_transfer_training(
        TransferTrainingReport(
            transfer_status="not-measured",
            training_filter_status="not-measured",
            real_task_refs=(),
            trajectory_refs=(),
            limitation="No additional real tasks and no sealed raw-vs-hardened trajectories exist.",
        )
    )
    assert transfer["transfer_status"] == "not-measured"


def test_skip_must_be_backed_by_evidence_refs():
    with pytest.raises(ReportError):
        require_evidence_backed_skip(
            ResearchSkip(packet="WP2", reason="blocked", evidence_refs=())
        )

    record = require_evidence_backed_skip(
        ResearchSkip(
            packet="WP2",
            reason="Plan 003 has candidates but no sealed Witness.",
            evidence_refs=("docs/plans/evidence/003/MANIFEST.json",),
        )
    )
    assert record["packet"] == "WP2"


def test_research_package_is_not_imported_by_core_feature_folders():
    # The invariant is that no other feature folder *imports* chronos.research,
    # so research/** stays deletable. Match real import statements only — a bare
    # substring check also flags docstring/comment mentions (e.g. another plan's
    # module that merely names a research symbol in its docs), which do not create
    # an import dependency.
    import_re = re.compile(r"^\s*(?:from|import)\s+chronos\.research\b", re.MULTILINE)
    offenders = []
    for path in (ROOT / "src/chronos").rglob("*.py"):
        relative = path.relative_to(ROOT)
        if relative.parts[:3] == ("src", "chronos", "research"):
            continue
        text = path.read_text(encoding="utf-8")
        if import_re.search(text):
            offenders.append(str(relative))

    assert offenders == []
