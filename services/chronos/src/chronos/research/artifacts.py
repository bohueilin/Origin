"""Plan 007 research artifact builders."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from chronos.research.models import (
    FlatComparisonReport,
    ResearchSkip,
    TransferTrainingReport,
)
from chronos.research.reports import (
    require_evidence_backed_skip,
    validate_flat_comparison,
    validate_transfer_training,
)
from chronos.witnesses.models import digest_json


def build_child_selection_artifact(
    *,
    witness: dict[str, Any],
    causal_delta: dict[str, Any],
    source_witness_ref: str,
    source_causal_delta_ref: str,
    alternatives_considered: tuple[str, ...],
    recorded_at: str,
) -> dict[str, Any]:
    """Build the Plan 007 child-selection artifact from sealed Witness evidence."""

    branch_id = str(witness["source_branch_id"])
    node_id = f"node-{branch_id}"
    parent_node_id = "fp-826ba545cf30870e67d42ddb"
    snapshot_ref = str(witness["pre_attack_snapshot_ref"])
    branch_ref = str(witness["file_diff_ref"]).replace("/file-diffs/", "/branches/")
    branch_ref = branch_ref.replace(f"{branch_id}.json", f"{branch_id}.json")
    if "file-diffs" in branch_ref:
        branch_ref = f"docs/plans/evidence/003/artifacts/branch-runs/run-20260621T075711/branches/{branch_id}.json"

    exploit_target = str(witness["exploit_target"])
    exploit_mechanism = str(witness["exploit_mechanism"])
    cluster_id = str(witness["cluster_id"])
    added_paths = sorted(causal_delta.get("added_text", {}).keys())
    selected_path = added_paths[0] if added_paths else "/app/conftest.py"

    return {
        "schema_version": 1,
        "artifact_id": f"child-selection-wit-{branch_id}",
        "status": "selected-not-resnapshotted",
        "recorded_at": recorded_at,
        "source_witness_ref": source_witness_ref,
        "source_causal_delta_ref": source_causal_delta_ref,
        "selection_record": {
            "schema_version": 1,
            "node_id": node_id,
            "parent_node_id": parent_node_id,
            "depth": 1,
            "snapshot_ref": snapshot_ref,
            "branch_ref": branch_ref,
            "fork_reason": (
                f"Selected sealed Witness branch {branch_id} as the Plan 007 promising child candidate "
                "because observable branch-local evidence differs from the root ForkPoint: "
                f"{selected_path} was added, QA classified the rewarded trace as reward hacking, "
                f"dedup created {cluster_id}, and three deterministic replays confirmed the verifier bypass."
            ),
            "observable_signals": [
                {
                    "kind": "file_change",
                    "path": selected_path,
                    "parent_value": "absent at root ForkPoint",
                    "child_value": "added pytest hook file in minimized causal delta",
                    "ref": source_causal_delta_ref,
                },
                {
                    "kind": "cluster_precursor",
                    "parent_value": "no exploit cluster at root ForkPoint",
                    "child_value": f"{cluster_id} / {exploit_target} / {exploit_mechanism}",
                    "ref": source_witness_ref,
                },
                {
                    "kind": "grader_visible_state",
                    "parent_value": "root ForkPoint has no branch verifier bypass",
                    "child_value": "reward=1, qa_is_reward_hacking=true, three semantic_success=true replay checks",
                    "ref": source_witness_ref,
                },
            ],
            "observable_signal_count": 3,
            "exposed_reasoning_refs": [],
            "alternatives_considered": list(alternatives_considered),
        },
        "lineage": {
            "schema_version": 1,
            "root_fork_point_id": parent_node_id,
            "parent_node_id": parent_node_id,
            "child_node_id": node_id,
            "child_depth": 1,
            "parent_snapshot_ref": snapshot_ref,
            "child_snapshot_ref": snapshot_ref,
            "source_branch_ref": branch_ref,
            "source_witness_ref": source_witness_ref,
        },
        "depth_two_run": {
            "schema_version": 1,
            "run_id": "research-depth-two-run-001",
            "child_node_id": node_id,
            "status": "blocked",
            "branch_budget": 8,
            "scheduled_branch_refs": [],
            "completed_branch_refs": [],
            "stop_event_ref": None,
            "blocker": (
                "No Plan 007 mapped live depth-two executor exists and no child re-snapshot has been captured. "
                "This artifact selects the child candidate only; it is not a depth-two BranchRun."
            ),
            "measured_values": {
                "completed_depth_two_branch_count": 0,
                "distinct_confirmed_depth_two_clusters": "not-measured",
                "setup_work_avoided": "not-measured",
                "flat_restart_comparison": "not-measured",
            },
        },
        "completion_claim": "not-complete",
    }


_STOP_EVENT_FIELDS = {"node_id", "scheduled_count", "completed_count", "reason"}


def _child_snapshot_ok(child_snapshot: dict[str, Any] | None) -> bool:
    """A captured filesystem-class child snapshot with depth-one lineage and a
    verified applied delta. Structural only (no live Modal call): the snapshot's
    authenticity is established at capture time by ``resnapshot`` provenance."""

    if (
        not isinstance(child_snapshot, dict)
        or child_snapshot.get("status") != "captured"
    ):
        return False
    snapshot = child_snapshot.get("child_snapshot")
    if not isinstance(snapshot, dict):
        return False
    if snapshot.get("snapshot_mode") != "filesystem" or not snapshot.get("snapshot_id"):
        return False
    lineage = child_snapshot.get("lineage")
    if not isinstance(lineage, dict) or lineage.get("child_depth") != 1:
        return False
    verification = snapshot.get("applied_delta_verification")
    included = snapshot.get("included_paths")
    if (
        not isinstance(verification, dict)
        or not isinstance(included, list)
        or not included
    ):
        return False
    return all(
        isinstance(verification.get(path), dict)
        and verification[path].get("status") == "present"
        for path in included
    )


def _depth_two_run_ok(
    depth_two_run: dict[str, Any] | None, root: Path | None = None
) -> bool:
    """A completed depth-two run whose recorded evidence is internally consistent
    and, when ``root`` is given, whose completed branch artifacts resolve to real
    files on disk (fail closed against partial/stale/fabricated runs)."""

    if (
        not isinstance(depth_two_run, dict)
        or depth_two_run.get("status") != "completed"
    ):
        return False
    run = depth_two_run.get("depth_two_run")
    if not isinstance(run, dict) or run.get("status") != "completed":
        return False
    scheduled = run.get("scheduled_branch_refs")
    completed = run.get("completed_branch_refs")
    if (
        not isinstance(scheduled, list)
        or not isinstance(completed, list)
        or not completed
    ):
        return False
    if not set(completed).issubset(set(scheduled)):
        return False
    if not run.get("measured_values"):
        return False
    stop_event = depth_two_run.get("stop_event")
    if not isinstance(stop_event, dict) or not _STOP_EVENT_FIELDS.issubset(stop_event):
        return False
    if root is not None and not all((root / str(ref)).is_file() for ref in completed):
        return False
    return True


def _snapshots_consistent(
    child_snapshot: dict[str, Any] | None, depth_two_run: dict[str, Any] | None
) -> bool:
    """The depth-two run must have executed from the captured child snapshot.

    Guards against a re-snapshot leaving the child-snapshot artifact and the
    depth-two run referencing different child images.
    """

    child_ref = ((child_snapshot or {}).get("child_snapshot") or {}).get("snapshot_ref")
    run_ref = (depth_two_run or {}).get("child_snapshot_ref")
    return bool(child_ref) and child_ref == run_ref


def build_depth_two_preflight_artifact(
    *,
    plan003_manifest: dict[str, Any],
    child_selection_ref: str,
    child_selection_exists: bool,
    command_ref: str,
    recorded_at: str,
    child_snapshot: dict[str, Any] | None = None,
    child_snapshot_ref: str | None = None,
    depth_two_run: dict[str, Any] | None = None,
    depth_two_run_ref: str | None = None,
    root: Path | None = None,
) -> dict[str, Any]:
    """Verify Plan 007 depth-two evidence; fail closed until it is real and complete.

    Returns a ``ready`` artifact only when Plan 003 is sealed, a filesystem-class
    child re-snapshot exists, and a completed depth-two BranchRun with measured
    values and an adaptive-stop event exists. When ``root`` is given, the run's
    completed branch artifacts must also resolve to real files. Otherwise it
    stays ``blocked``.
    """

    checks = plan003_manifest.get("checks", [])
    sealed = any(
        check.get("name") == "Promotion and replay seal"
        and check.get("status") == "pass"
        for check in checks
        if isinstance(check, dict)
    )
    plan003_complete = plan003_manifest.get("status") == "complete"
    plan003_gate_status = "pass" if sealed and plan003_complete else "blocked"

    child_snapshot_ok = _child_snapshot_ok(child_snapshot)
    depth_two_ok = _depth_two_run_ok(depth_two_run, root)

    blockers = []
    if plan003_gate_status != "pass":
        blockers.append(
            "Plan 003 does not have complete sealed Witness evidence on this stack."
        )
    if not child_selection_exists:
        blockers.append("Plan 007 child-selection artifact is missing.")
    if not child_snapshot_ok:
        blockers.append(
            "Plan 007 has no captured filesystem-class child re-snapshot artifact."
        )
    if not depth_two_ok:
        blockers.append(
            "Plan 007 has no mapped live depth-two executor result with a completed depth-two "
            "BranchRun artifact, measured values, and an adaptive-stop event."
        )
    if (
        child_snapshot_ok
        and depth_two_ok
        and not _snapshots_consistent(child_snapshot, depth_two_run)
    ):
        blockers.append(
            "Plan 007 child re-snapshot and depth-two run reference different child snapshots; "
            "re-run depth-two from the captured child snapshot."
        )

    status = "ready" if not blockers else "blocked"
    artifact: dict[str, Any] = {
        "schema_version": 1,
        "artifact_id": "plan-007-depth-two-integration-preflight",
        "status": status,
        "recorded_at": recorded_at,
        "command_ref": command_ref,
        "plan003_gate": {
            "status": plan003_gate_status,
            "manifest_ref": "docs/plans/evidence/003/MANIFEST.json",
            "sealed_witness_check": sealed,
            "manifest_status": plan003_manifest.get("status"),
        },
        "child_selection": {
            "status": "present" if child_selection_exists else "missing",
            "artifact_ref": child_selection_ref,
        },
        "child_snapshot": {
            "status": "captured" if child_snapshot_ok else "missing",
            "artifact_ref": child_snapshot_ref,
            "snapshot_ref": (child_snapshot or {})
            .get("child_snapshot", {})
            .get("snapshot_ref")
            if child_snapshot_ok
            else None,
        },
        "depth_two_execution": {
            "status": "completed" if depth_two_ok else "blocked",
            "executor": "mapped" if child_snapshot_ok else "not-mapped",
            "completed_branch_run_ref": depth_two_run_ref if depth_two_ok else None,
            "required_next_artifacts": []
            if depth_two_ok
            else [
                "independent child re-snapshot restore evidence",
                "completed depth-two BranchRun artifact",
                "adaptive-stop decision event from a real run",
            ],
        },
        "blockers": blockers,
        "completion_claim": "complete" if status == "ready" else "not-complete",
    }
    artifact["content_digest"] = digest_json(artifact)
    return artifact


def build_conditional_research_report(
    *,
    sealed_witness_ref: str,
    child_selection_ref: str,
    preflight_ref: str,
    command_map_ref: str,
    recorded_at: str,
) -> dict[str, Any]:
    """Build the measured/not-measured report for conditional Plan 007 packets."""

    flat = validate_flat_comparison(
        FlatComparisonReport(
            status="not-measured",
            protocol_ref=None,
            limitation=(
                "A comparable flat-restart batch under a normalized measured budget was not run; the "
                "completed depth-two run is recorded without a paired flat baseline, so no "
                "state-branch-versus-flat superiority is claimed."
            ),
        )
    )
    transfer_training = validate_transfer_training(
        TransferTrainingReport(
            transfer_status="not-measured",
            training_filter_status="not-measured",
            real_task_refs=(),
            trajectory_refs=(),
            limitation=(
                "No additional real task set or sealed raw-vs-hardened trajectory corpus is "
                "available on this stack."
            ),
        )
    )
    skips = [
        require_evidence_backed_skip(
            ResearchSkip(
                packet="WP4 flat restart comparison",
                reason="The completed depth-two run was not paired with a comparable normalized flat-restart batch in this session, so no state-branch-versus-flat superiority is claimed.",
                evidence_refs=(sealed_witness_ref, child_selection_ref, preflight_ref),
                recorded_at=recorded_at,
            )
        ),
        require_evidence_backed_skip(
            ResearchSkip(
                packet="WP5 Memory Snapshot",
                reason="The sealed Witness evidence does not establish process-resident state need; no Memory adapter scaffold was created.",
                evidence_refs=(sealed_witness_ref, child_selection_ref),
                recorded_at=recorded_at,
            )
        ),
        require_evidence_backed_skip(
            ResearchSkip(
                packet="WP5 VM Sandbox",
                reason="The sealed Witness evidence does not establish kernel-level task need; no VM adapter scaffold was created.",
                evidence_refs=(sealed_witness_ref, child_selection_ref),
                recorded_at=recorded_at,
            )
        ),
        require_evidence_backed_skip(
            ResearchSkip(
                packet="WP6 transfer/training",
                reason="No additional real tasks or sealed raw-vs-hardened trajectories are available for measured transfer or training analysis.",
                evidence_refs=(sealed_witness_ref, command_map_ref),
                recorded_at=recorded_at,
            )
        ),
    ]
    artifact: dict[str, Any] = {
        "schema_version": 1,
        "artifact_id": "plan-007-conditional-research-report",
        "status": "not-measured",
        "recorded_at": recorded_at,
        "flat_comparison": flat,
        "transfer_training": transfer_training,
        "skips": skips,
        "capability_profiles": {
            "memory": {
                "status": "skipped",
                "live_probe": "not-run",
                "reason": "No real process-resident task need was established; no adapter scaffold was created.",
            },
            "vm": {
                "status": "skipped",
                "live_probe": "not-run",
                "reason": "No real kernel-level task need was established; no adapter scaffold was created.",
            },
        },
        "evidence_refs": [
            sealed_witness_ref,
            child_selection_ref,
            preflight_ref,
            command_map_ref,
        ],
        "completion_claim": "not-complete",
    }
    artifact["content_digest"] = digest_json(artifact)
    return artifact
