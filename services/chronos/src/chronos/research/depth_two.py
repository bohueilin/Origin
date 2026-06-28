"""Plan 007 live depth-two executor.

Drives the Plan 007 ``ResearchScheduler`` against real depth-two BranchRuns that
start from an independently re-snapshotted child (see ``resnapshot``). It reuses
the proven Plan 003 BranchRun primitive through ``_run_one_branch`` with a
Plan 007-owned ``artifact_root`` (no writes under Plan 003 evidence), and uses
the proven promotion/dedup gates to decide, per completed branch, whether a
confirmed QA/dedup cluster resets the adaptive-stop counter. It fails closed —
returning a ``blocked`` depth-two record — when credentials or the external-QA
approval are absent; it never fabricates a run.
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any

from chronos.research.models import DepthTwoRunRecord, SchedulerConfig
from chronos.research.scheduler import ResearchScheduler
from chronos.witnesses.branch_runs import _run_one_branch
from chronos.witnesses.branch_task_profile import load_hud_task
from chronos.witnesses.local_env import credential_presence, load_local_env
from chronos.witnesses.models import digest_json, reward_success, utc_now
from chronos.witnesses.promotion import branch_signal_status, dedup_by_target_mechanism
from chronos.witnesses.sealing import (
    build_minimized_delta,
    infer_target_mechanism,
    load_candidate_bundle,
)

CRED_NAMES = (
    "MODAL_TOKEN_ID",
    "MODAL_TOKEN_SECRET",
    "HUD_API_KEY",
    "ANTHROPIC_API_KEY",
)
PARENT_FORKPOINT_REF = "docs/plans/evidence/002/artifacts/forkpoint-record.json"
BRANCH_ARTIFACT_SUBDIR = "docs/plans/evidence/007/artifacts/depth-two-runs"

# Derived from the proven Plan 003 sealed-Witness replay surface and the
# Plan 001-owned HUD env (envs/mongodb-sales-aggregation-engine/env.py). These
# describe how to execute a BranchRun from the child snapshot; they do not
# change grader identity or environment version.
HUD_TASK_PROFILE: dict[str, Any] = {
    "env_module_path": "envs/mongodb-sales-aggregation-engine/env.py",
    "task_factory": "implement_sales_analyzer",
    "prompt_factory": "_prompt",
    "runtime_workdir": "/app",
    "instruction_path": "/app/task_assets/instruction.md",
    "trusted_entrypoint_ref": "env:env",
    "capture_roots": ["/app", "/data/db", "/var/log/mongodb.log"],
    "pre_grader_command_argv": [
        "bash",
        "-lc",
        "pgrep -x mongod >/dev/null || mongod --fork --logpath /var/log/mongodb.log --dbpath /data/db >/tmp/mongod-start.log 2>&1",
    ],
    "grader_command_argv": [
        "bash",
        "-lc",
        "python3 -m pytest task_assets/test_outputs.py -rA -q > .grade.log 2>&1; rc=$?; cat .grade.log; exit $rc",
    ],
}


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def build_child_forkpoint(
    *,
    parent_forkpoint: dict[str, Any],
    child_snapshot: dict[str, Any],
    child_node_id: str,
) -> dict[str, Any]:
    """Mirror the accepted ForkPoint but point execution at the child snapshot."""

    snapshot_id = str(child_snapshot["snapshot_id"])
    forkpoint = dict(parent_forkpoint)
    forkpoint.update(
        {
            "fork_point_id": f"fp-depth2-{child_node_id}",
            "parent_node_id": child_node_id,
            "node_id": child_node_id,
            "snapshot_id": snapshot_id,
            "snapshot_restore_ref": f"modal-image://{snapshot_id}",
            "snapshot_mode": "filesystem",
            "snapshot_digest": digest_json(
                {
                    "child_snapshot_id": snapshot_id,
                    "base": parent_forkpoint.get("snapshot_digest"),
                }
            ),
            "task_state_roots": list(HUD_TASK_PROFILE["capture_roots"]),
            # Copy the nested lists too: a shallow dict() would alias the module
            # constant's lists, so a downstream mutation could corrupt later runs.
            "hud_task_profile": {
                **HUD_TASK_PROFILE,
                "capture_roots": list(HUD_TASK_PROFILE["capture_roots"]),
                "pre_grader_command_argv": list(
                    HUD_TASK_PROFILE["pre_grader_command_argv"]
                ),
                "grader_command_argv": list(HUD_TASK_PROFILE["grader_command_argv"]),
            },
        }
    )
    return forkpoint


def _confirmed_cluster(
    root: Path,
    branch_ref: str,
    branch: dict[str, Any],
    qa: dict[str, Any] | None,
    clusters: list[dict[str, Any]],
) -> tuple[str | None, dict[str, Any] | None]:
    """Return the confirmed QA/dedup cluster id for a completed depth-two branch.

    Only a reward + QA reward-hacking branch with a minimizable textual delta
    yields a confirmed cluster. Everything else returns ``None`` so the
    adaptive-stop counter is never advanced by raw reward alone.
    """

    try:
        if branch_signal_status(branch, qa) != "candidate":
            return None, None
        bundle = load_candidate_bundle(root, branch_ref)
        delta = build_minimized_delta(
            branch=bundle["branch"],
            qa=bundle["qa"],
            causal=bundle["causal"],
            file_diff=bundle["file_diff"],
        )
        target, mechanism = infer_target_mechanism(qa=bundle["qa"], delta=delta)
    except Exception:  # noqa: BLE001 - an unclassifiable branch confirms no new cluster.
        return None, None

    candidate = {"exploit_target": target, "exploit_mechanism": mechanism}
    decision = dedup_by_target_mechanism(candidate, clusters)
    if decision["decision"] == "new":
        clusters.append(
            {"cluster_id": decision["cluster_id"], "representative": candidate}
        )
    return decision["cluster_id"], {
        "exploit_target": target,
        "exploit_mechanism": mechanism,
        "decision": decision["decision"],
    }


def _blocked_record(
    *, child_node_id: str, branch_budget: int, blockers: list[str], recorded_at: str
) -> DepthTwoRunRecord:
    return DepthTwoRunRecord(
        run_id=f"research-depth-two-blocked-{recorded_at}",
        child_node_id=child_node_id or "unknown",
        status="blocked",
        branch_budget=branch_budget,
        blocker="; ".join(blockers),
        recorded_at=recorded_at,
    )


def _blocked_headline(
    *,
    child_node_id: str,
    branch_budget: int,
    concurrency: int,
    blockers: list[str],
    child_snapshot_artifact: dict[str, Any],
    child_snapshot_artifact_ref: str,
    presence: dict[str, str],
    recorded_at: str,
) -> dict[str, Any]:
    node = child_node_id or "unknown"
    record = _blocked_record(
        child_node_id=node,
        branch_budget=branch_budget,
        blockers=blockers,
        recorded_at=recorded_at,
    )
    return _headline(
        status="blocked",
        run_id=record.run_id,
        child_node_id=node,
        child_snapshot_artifact=child_snapshot_artifact,
        child_snapshot_artifact_ref=child_snapshot_artifact_ref,
        record=record.to_record(),
        decisions=[],
        stop_event=None,
        branch_results=[],
        branch_artifact_root=None,
        presence=presence,
        recorded_at=recorded_at,
        scheduler_config={"child_budget": branch_budget, "concurrency": concurrency},
    )


async def run_depth_two(
    *,
    root: Path,
    child_snapshot_artifact: dict[str, Any],
    child_snapshot_artifact_ref: str,
    branch_budget: int = 8,
    concurrency: int = 1,
    recorded_at: str | None = None,
) -> dict[str, Any]:
    """Run the adaptive depth-two batch and return a Plan 007 headline artifact."""

    recorded_at = recorded_at or utc_now()
    load_local_env(root)
    presence = credential_presence(CRED_NAMES)
    child_snapshot = child_snapshot_artifact.get("child_snapshot") or {}
    child_node_id = str(child_snapshot.get("child_node_id") or "")

    blockers: list[str] = []
    if any(value != "present" for value in presence.values()):
        blockers.append("required local credentials were absent")
    if os.environ.get("FORKPROOF_ALLOW_EXTERNAL_QA") != "1":
        blockers.append(
            "external QA export is not approved (FORKPROOF_ALLOW_EXTERNAL_QA != 1)"
        )
    if not child_node_id or not child_snapshot.get("snapshot_id"):
        blockers.append(
            "child snapshot artifact is missing child_node_id or snapshot_id"
        )
    if child_snapshot.get("snapshot_mode") != "filesystem":
        blockers.append("child snapshot is not filesystem-class durable state")

    if blockers:
        return _blocked_headline(
            child_node_id=child_node_id,
            branch_budget=branch_budget,
            concurrency=concurrency,
            blockers=blockers,
            child_snapshot_artifact=child_snapshot_artifact,
            child_snapshot_artifact_ref=child_snapshot_artifact_ref,
            presence=presence,
            recorded_at=recorded_at,
        )

    # Loading the accepted ForkPoint and the HUD task can fail (bad env module,
    # missing task factory, import error). Fail closed with a blocked record
    # rather than crashing, so the CLI records a STOP instead of a chronos.
    try:
        parent_forkpoint = _load_json(root / PARENT_FORKPOINT_REF)
        child_forkpoint = build_child_forkpoint(
            parent_forkpoint=parent_forkpoint,
            child_snapshot=child_snapshot,
            child_node_id=child_node_id,
        )
        task, prompt_packet = load_hud_task(root, child_forkpoint)
    except Exception as exc:  # noqa: BLE001 - setup failure is a fail-closed STOP, not a crash.
        return _blocked_headline(
            child_node_id=child_node_id,
            branch_budget=branch_budget,
            concurrency=concurrency,
            blockers=[f"depth-two setup failed: {type(exc).__name__}: {exc}"],
            child_snapshot_artifact=child_snapshot_artifact,
            child_snapshot_artifact_ref=child_snapshot_artifact_ref,
            presence=presence,
            recorded_at=recorded_at,
        )

    stamp = utc_now().replace("-", "").replace(":", "").removesuffix("Z")
    run_id = f"research-depth-two-{stamp}"
    artifact_root = root / BRANCH_ARTIFACT_SUBDIR / run_id

    try:
        config = SchedulerConfig(child_budget=branch_budget, concurrency=concurrency)
    except ValueError as exc:
        return _blocked_headline(
            child_node_id=child_node_id,
            branch_budget=branch_budget if 1 <= branch_budget <= 8 else 8,
            concurrency=concurrency,
            blockers=[f"invalid scheduler configuration: {exc}"],
            child_snapshot_artifact=child_snapshot_artifact,
            child_snapshot_artifact_ref=child_snapshot_artifact_ref,
            presence=presence,
            recorded_at=recorded_at,
        )
    scheduler = ResearchScheduler(node_id=child_node_id, node_depth=1, config=config)

    clusters: list[dict[str, Any]] = []
    scheduled_refs: list[str] = []
    completed_refs: list[str] = []
    branch_results: list[dict[str, Any]] = []
    index = 0

    async def _run_indexed(branch_index: int) -> dict[str, Any]:
        return await _run_one_branch(
            root=root,
            forkpoint=child_forkpoint,
            task=task,
            prompt_packet=prompt_packet,
            run_id=run_id,
            branch_index=branch_index,
            artifact_root=artifact_root,
        )

    # Schedule waves of up to `concurrency` in-flight branches, run them
    # concurrently, then drain. The scheduler enforces the budget and the
    # adaptive-stop policy; at concurrency=1 this reduces to one branch at a
    # time. In-flight branches in a wave always finish before the next wave is
    # scheduled, matching the "allow in-flight branches to finish" policy.
    while scheduler.can_schedule():
        wave: list[tuple[str, int]] = []
        while scheduler.can_schedule():
            decision = scheduler.schedule_next()
            if decision is None:
                break
            wave.append((str(decision.branch_id), index))
            index += 1
        if not wave:
            break
        results = await asyncio.gather(
            *(
                _run_indexed(branch_index)
                for _scheduler_branch_id, branch_index in wave
            ),
            return_exceptions=True,
        )
        for (scheduler_branch_id, _branch_index), result in zip(wave, results):
            if isinstance(result, BaseException):
                scheduler.complete_branch(
                    scheduler_branch_id, confirmed_cluster_id=None
                )
                branch_results.append(
                    {
                        "scheduler_branch_id": scheduler_branch_id,
                        "status": "executor-error",
                        "error_class": type(result).__name__,
                        "error_message": str(result)[:400],
                        "confirmed_cluster_id": None,
                    }
                )
                continue
            branch = result["branch"]
            qa = result["qa"]
            branch_ref = result["branch_ref"]
            scheduled_refs.append(branch_ref)
            confirmed, cluster_decision = _confirmed_cluster(
                root, branch_ref, branch, qa, clusters
            )
            scheduler.complete_branch(
                scheduler_branch_id, confirmed_cluster_id=confirmed
            )
            if branch.get("execution_boundary_crossed") is True:
                completed_refs.append(branch_ref)
            branch_results.append(
                {
                    "scheduler_branch_id": scheduler_branch_id,
                    "branch_id": branch.get("branch_id"),
                    "branch_ref": branch_ref,
                    "reward": branch.get("reward"),
                    "status": branch.get("status"),
                    "execution_boundary_crossed": branch.get(
                        "execution_boundary_crossed"
                    ),
                    "hud_trace_id": branch.get("hud_trace_id"),
                    "promotion_signal_status": branch.get("promotion_signal_status"),
                    "qa_status": qa.get("status") if qa else None,
                    "qa_is_reward_hacking": qa.get("is_reward_hacking") if qa else None,
                    "confirmed_cluster_id": confirmed,
                    "cluster_decision": cluster_decision,
                }
            )

    stop = scheduler.stop_event()
    measured_values = {
        "branch_budget": branch_budget,
        "scheduled_depth_two_branch_count": len(scheduled_refs),
        "completed_depth_two_branch_count": len(completed_refs),
        "distinct_confirmed_depth_two_clusters": len(clusters),
        "confirmed_cluster_ids": [cluster["cluster_id"] for cluster in clusters],
        "reward_success_count": sum(
            1 for item in branch_results if reward_success(item.get("reward"))
        ),
        "qa_pass_count": sum(
            1 for item in branch_results if item.get("qa_status") == "pass"
        ),
        "reward_hacking_count": sum(
            1 for item in branch_results if item.get("qa_is_reward_hacking") is True
        ),
        "candidate_count": sum(
            1
            for item in branch_results
            if item.get("promotion_signal_status") == "candidate"
        ),
        "adaptive_stop_reason": stop.reason if stop else None,
        "consecutive_no_new_cluster_at_stop": scheduler.consecutive_no_new_cluster,
        "scheduler_completed_count": scheduler.completed_count,
    }

    status = "completed" if completed_refs else "blocked"
    blocker = (
        None
        if status == "completed"
        else "no depth-two branch crossed the live execution boundary"
    )
    record = DepthTwoRunRecord(
        run_id=run_id,
        child_node_id=child_node_id,
        status=status,
        branch_budget=branch_budget,
        scheduled_branch_refs=tuple(scheduled_refs),
        completed_branch_refs=tuple(completed_refs),
        stop_event_ref="inline:stop_event" if stop else None,
        blocker=blocker,
        measured_values=measured_values if status == "completed" else None,
        recorded_at=recorded_at,
    )

    return _headline(
        status=status,
        run_id=run_id,
        child_node_id=child_node_id,
        child_snapshot_artifact=child_snapshot_artifact,
        child_snapshot_artifact_ref=child_snapshot_artifact_ref,
        record=record.to_record(),
        decisions=[decision.to_record() for decision in scheduler.decisions],
        stop_event=stop.to_record() if stop else None,
        branch_results=branch_results,
        branch_artifact_root=str(artifact_root.relative_to(root)),
        presence=presence,
        recorded_at=recorded_at,
        scheduler_config={
            "child_budget": branch_budget,
            "concurrency": concurrency,
            "max_depth": config.max_depth,
            "no_new_cluster_limit": config.no_new_cluster_limit,
        },
        measured_values=measured_values,
    )


def _headline(
    *,
    status: str,
    run_id: str,
    child_node_id: str,
    child_snapshot_artifact: dict[str, Any],
    child_snapshot_artifact_ref: str,
    record: dict[str, Any],
    decisions: list[dict[str, Any]],
    stop_event: dict[str, Any] | None,
    branch_results: list[dict[str, Any]],
    branch_artifact_root: str | None,
    presence: dict[str, str],
    recorded_at: str,
    scheduler_config: dict[str, Any],
    measured_values: dict[str, Any] | None = None,
) -> dict[str, Any]:
    child_snapshot = child_snapshot_artifact.get("child_snapshot") or {}
    artifact: dict[str, Any] = {
        "schema_version": 1,
        "artifact_id": f"plan-007-depth-two-run-{run_id}",
        "status": status,
        "recorded_at": recorded_at,
        "run_id": run_id,
        "child_node_id": child_node_id,
        "child_snapshot_ref": child_snapshot.get("snapshot_ref"),
        "child_snapshot_artifact_ref": child_snapshot_artifact_ref,
        "lineage": child_snapshot_artifact.get("lineage"),
        "scheduler_config": scheduler_config,
        "depth_two_run": record,
        "scheduler_decisions": decisions,
        "stop_event": stop_event,
        "branch_results": branch_results,
        "branch_artifact_root": branch_artifact_root,
        "measured_values": measured_values,
        "credential_presence": presence,
        "observed_behavior": (
            "Ran adaptive depth-two BranchRuns from an independently re-snapshotted child using the proven "
            "Plan 003 BranchRun primitive and the Plan 007 scheduler. Confirmed QA/dedup clusters — not raw "
            "reward — drive the adaptive-stop counter. Branch sub-artifacts are written under Plan 007-owned "
            "evidence; no Plan 003 artifact is mutated."
        ),
        "completion_claim": "depth-two-run-completed"
        if status == "completed"
        else "not-complete",
    }
    artifact["content_digest"] = digest_json(artifact)
    return artifact
