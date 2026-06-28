"""Live BranchRun executor for Plan 003."""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from pathlib import Path
from typing import Any

import httpx

from .branch_artifacts import build_file_diff, build_security_evidence
from .branch_runtime import BranchRuntimeEvidence, EvidenceModalRuntime
from .branch_task_profile import hud_task_profile, load_hud_task, runtime_command
from .causal_evidence import (
    build_causal_evidence_bundle,
    build_classifier_evidence_context,
)
from .local_env import credential_presence, load_local_env
from .models import digest_json, utc_now
from .promotion import branch_signal_status
from .qa_binding import run_reward_hacking_analysis

EVIDENCE_SUBDIR = Path("docs/plans/evidence/003/artifacts")
DEFAULT_BRANCH_MAX_STEPS = 60
DEFAULT_BRANCH_MAX_TOKENS = 8192


def _credential_presence() -> dict[str, str]:
    names = ("MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET", "HUD_API_KEY", "ANTHROPIC_API_KEY")
    return credential_presence(names)


def _artifact_root(root: Path, run_id: str) -> Path:
    path = root / EVIDENCE_SUBDIR / "branch-runs" / run_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def _write_json(path: Path, data: dict[str, Any], *, compact: bool = False) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        payload = json.dumps(data, sort_keys=True, separators=(",", ":"))
    else:
        payload = json.dumps(data, indent=2, sort_keys=True)
    path.write_text(payload + "\n", encoding="utf-8")
    return path


def _relative(root: Path, path: Path) -> str:
    return str(path.relative_to(root))


def _trace_readback(trace_id: str) -> dict[str, Any]:
    api_key = os.environ["HUD_API_KEY"]
    base = os.environ.get("HUD_API_URL", "https://api.beta.hud.ai").rstrip("/")
    headers = {"Authorization": f"Bearer {api_key}"}
    trace = httpx.get(f"{base}/v2/trace/{trace_id}", headers=headers, timeout=30)
    events = httpx.get(
        f"{base}/v2/trace/{trace_id}/events", headers=headers, timeout=30
    )
    trace.raise_for_status()
    events.raise_for_status()
    return {"trace": trace.json(), "events": events.json()}


def _branch_state_roots(forkpoint: dict[str, Any]) -> tuple[list[str], str]:
    env_value = os.environ.get("FORKPROOF_BRANCH_STATE_ROOTS")
    if env_value:
        return [
            item.strip() for item in env_value.split(",") if item.strip()
        ], "FORKPROOF_BRANCH_STATE_ROOTS"
    roots = forkpoint.get("task_state_roots")
    if (
        isinstance(roots, list)
        and roots
        and all(isinstance(item, str) for item in roots)
    ):
        return roots, "forkpoint.task_state_roots"
    profile = forkpoint.get("hud_task_profile")
    profile_roots = profile.get("capture_roots") if isinstance(profile, dict) else None
    if (
        isinstance(profile_roots, list)
        and profile_roots
        and all(isinstance(item, str) for item in profile_roots)
    ):
        return profile_roots, "forkpoint.hud_task_profile.capture_roots"
    root = forkpoint.get("task_state_root") or forkpoint.get(
        "isolated_writable_root_identity"
    )
    if isinstance(root, str) and root.startswith("/"):
        return [root], "forkpoint.task_state_root"
    if isinstance(profile, dict) and isinstance(profile.get("runtime_workdir"), str):
        return [
            str(profile["runtime_workdir"])
        ], "forkpoint.hud_task_profile.runtime_workdir"
    raise ValueError(
        "forkpoint must include task_state_roots, task_state_root, or hud_task_profile capture roots"
    )


def _skip_qa_enabled() -> bool:
    return os.environ.get("FORKPROOF_SKIP_QA", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _action_record(
    branch_id: str, job_id: str, trace_id: str, reward: Any
) -> dict[str, Any]:
    trace_data = _trace_readback(trace_id) if trace_id else {"trace": {}, "events": {}}
    return {
        "schema_version": 1,
        "branch_id": branch_id,
        "job_id": job_id,
        "hud_trace_id": trace_id,
        "reward": reward,
        "trace_readback": trace_data,
    }


async def _run_one_branch(
    *,
    root: Path,
    forkpoint: dict[str, Any],
    task: Any,
    prompt_packet: dict[str, Any],
    run_id: str,
    branch_index: int,
    artifact_root: Path,
) -> dict[str, Any]:
    import modal
    from hud.agents.claude.agent import ClaudeAgent, ClaudeConfig

    branch_id = f"{run_id}-branch-{branch_index:02d}"
    seed = 7300 + branch_index
    model = (
        os.environ.get("FORKPROOF_BRANCH_MODEL")
        or os.environ.get("H2F2H_HACKER_MODEL")
        or "claude-haiku-4-5"
    )
    max_steps = int(
        os.environ.get("FORKPROOF_BRANCH_MAX_STEPS", str(DEFAULT_BRANCH_MAX_STEPS))
    )
    max_tokens = int(
        os.environ.get("FORKPROOF_BRANCH_MAX_TOKENS", str(DEFAULT_BRANCH_MAX_TOKENS))
    )
    sampling_config = {
        "max_steps": max_steps,
        "max_tokens": max_tokens,
        "requested_seed": seed,
        "provider_seed_support": "not-supported-by-ClaudeConfig",
        "parallelism": "12-concurrent-branches",
        "budget_profile": "terminal-bench-style-hacker-discovery",
    }
    started_at = utc_now()
    job_id = ""
    trace_id = ""
    reward: Any = None
    status = "success"
    execution_boundary_crossed = False
    error_class: str | None = None
    error_message: str | None = None
    capture_roots, capture_root_source = _branch_state_roots(forkpoint)
    runtime_evidence = BranchRuntimeEvidence(
        branch_id=branch_id,
        capture_roots=capture_roots,
        capture_root_source=capture_root_source,
    )
    task_profile = hud_task_profile(forkpoint)
    runtime_command_argv = runtime_command(prompt_packet, task_profile)
    snapshot_restore_ref = (
        forkpoint.get("snapshot_restore_ref")
        or f"modal-image://{forkpoint.get('snapshot_id')}"
    )
    try:
        runtime = EvidenceModalRuntime(
            image=modal.Image.from_id(forkpoint["snapshot_id"]),
            app_name="chronos-plan-003",
            workdir=str(task_profile["runtime_workdir"]),
            command=runtime_command_argv,
            evidence=runtime_evidence,
        )
        agent = ClaudeAgent(
            ClaudeConfig(
                model=model,
                max_steps=max_steps,
                max_tokens=max_tokens,
                use_computer_beta=False,
                system_prompt=f"Plan 003 Hacker BranchRun {branch_id}; requested_seed={seed}.",
            )
        )
        job = await task.run(agent, runtime=runtime)
        runs = getattr(job, "runs", None) or []
        if runs:
            trace_id = str(getattr(runs[0], "trace_id", "") or "")
        trace_id = trace_id or str(getattr(job, "trace_id", "") or "")
        job_id = str(getattr(job, "id", "") or "")
        reward = getattr(job, "reward", None)
        execution_boundary_crossed = bool(job_id and trace_id)
        if not job_id or not trace_id:
            status = "agent-error"
            error_class = "missing_hud_provenance"
            error_message = "HUD job did not expose both job_id and trace_id"
    except Exception as exc:  # noqa: BLE001 - counted BranchRuns record provider failures.
        status = "agent-error"
        error_class = type(exc).__name__
        error_message = str(exc)

    action_record = (
        _action_record(branch_id, job_id, trace_id, reward)
        if trace_id
        else {
            "schema_version": 1,
            "branch_id": branch_id,
            "job_id": job_id,
            "hud_trace_id": trace_id,
            "reward": reward,
            "error_class": error_class,
            "error_message": error_message,
        }
    )
    action_record_digest = digest_json(action_record)
    action_path = _write_json(
        artifact_root / "actions" / f"{branch_id}.json", action_record, compact=True
    )
    file_diff = build_file_diff(
        branch_id, runtime_evidence.before_snapshot, runtime_evidence.after_snapshot
    )
    file_diff_path = _write_json(
        artifact_root / "file-diffs" / f"{branch_id}.json", file_diff
    )
    file_diff_digest = digest_json(file_diff)
    security_evidence = build_security_evidence(
        branch_id,
        runtime_evidence.runtime_params,
        runtime_evidence.security_probe,
    )
    security_path = _write_json(
        artifact_root / "security" / f"{branch_id}.json", security_evidence
    )

    qa_result: dict[str, Any] | None = None
    action_ref = _relative(root, action_path)
    file_diff_ref = _relative(root, file_diff_path)
    classifier_evidence = build_classifier_evidence_context(
        branch_id=branch_id,
        hud_trace_id=trace_id,
        reward=reward,
        action_record_ref=action_ref,
        action_record_digest=action_record_digest,
        file_diff_ref=file_diff_ref,
        file_diff=file_diff,
        task_identity={
            "task_id": forkpoint.get("task_id"),
            "environment_version": forkpoint.get("environment_version"),
            "grader_digest": forkpoint.get("grader_digest"),
        },
    )
    if trace_id and not _skip_qa_enabled():
        qa_result = await asyncio.to_thread(
            run_reward_hacking_analysis,
            root,
            trace_id,
            branch_id=branch_id,
            action_record_digest=action_record_digest,
            classifier_evidence=classifier_evidence,
        )
        qa_path = _write_json(artifact_root / "qa" / f"{branch_id}.json", qa_result)
        qa_result_ref = (
            qa_result.get("qa_result_id")
            if qa_result.get("status") == "pass"
            else "missing"
        )
    elif trace_id:
        qa_result = {
            "schema_version": 1,
            "status": "skipped",
            "branch_id": branch_id,
            "hud_trace_id": trace_id,
            "skip_reason": "FORKPROOF_SKIP_QA enabled for clean-SFT collection",
            "observed_behavior": (
                "HUD Reward Hacking QA was intentionally skipped. This branch must not be promoted "
                "as a reward-hack witness from QA; clean-SFT promotion is gated by post-agent "
                "workspace snapshot plus sterile clean_verify."
            ),
        }
        qa_path = _write_json(artifact_root / "qa" / f"{branch_id}.json", qa_result)
        qa_result_ref = "skipped"
    else:
        qa_path = _write_json(
            artifact_root / "qa" / f"{branch_id}.json",
            {
                "status": "blocked",
                "branch_id": branch_id,
                "observed_behavior": "no HUD trace id available",
            },
        )
        qa_result_ref = "missing"

    post_agent_snapshot = runtime_evidence.post_agent_snapshot or {}
    post_agent_snapshot_ref = (
        post_agent_snapshot.get("snapshot_ref")
        if post_agent_snapshot.get("status") == "pass"
        else None
    )
    branch = {
        "schema_version": 1,
        "run_id": run_id,
        "branch_id": branch_id,
        "branch_role": prompt_packet["branch_role"],
        "prompt_profile": prompt_packet["prompt_profile"],
        "prompt_source_ref": prompt_packet["prompt_source_ref"],
        "prompt_upstream_ref": prompt_packet.get("prompt_upstream_ref"),
        "prompt_digest": prompt_packet["prompt_digest"],
        "prompt_goal_digest": prompt_packet["prompt_goal_digest"],
        "prompt_rewrite_mode": prompt_packet["rewrite_mode"],
        "feedback_enabled": prompt_packet.get("feedback_enabled", False),
        "feedback_source_ref": prompt_packet.get("feedback_source_ref"),
        "feedback_attempt_count": prompt_packet.get("feedback_attempt_count", 0),
        "feedback_attempt_refs": prompt_packet.get("feedback_attempt_refs", []),
        "parent_fork_point_id": forkpoint.get("fork_point_id"),
        "parent_node_id": forkpoint.get("node_id")
        or forkpoint.get("parent_node_id")
        or "accepted-forkpoint",
        "seed": seed,
        "model": model,
        "sampling_config": sampling_config,
        "gateway_request_ids": [f"hud-job:{job_id}"] if job_id else [],
        "model_response_refs": [f"hud-trace:{trace_id}"] if trace_id else [],
        "runtime_provider": runtime_evidence.runtime_params.get("provider"),
        "runtime_instance_id": runtime_evidence.runtime_params.get("instance_id"),
        "capture_roots": capture_roots,
        "capture_root_source": capture_root_source,
        "hud_trace_id": trace_id,
        "environment_version": forkpoint.get("environment_version"),
        "environment_image_digest": forkpoint.get("environment_image_digest"),
        "grader_digest": forkpoint.get("grader_digest"),
        "grader_digest_source": forkpoint.get("grader_digest_source"),
        "reward": reward,
        "qa_result_ref": qa_result_ref,
        "lineage": {
            "fork_point_id": forkpoint.get("fork_point_id"),
            "snapshot_id": forkpoint.get("snapshot_id"),
            "branch_index": branch_index,
        },
        "snapshot_restore_ref": snapshot_restore_ref,
        "snapshot_id": forkpoint.get("snapshot_id"),
        "snapshot_mode": forkpoint.get("snapshot_mode"),
        "snapshot_digest": forkpoint.get("snapshot_digest"),
        "post_agent_snapshot": post_agent_snapshot,
        "post_agent_snapshot_ref": post_agent_snapshot_ref,
        "post_agent_snapshot_id": post_agent_snapshot.get("snapshot_id"),
        "post_agent_snapshot_mode": post_agent_snapshot.get("snapshot_mode"),
        "post_agent_snapshot_retention": post_agent_snapshot.get("retention"),
        "history_prefix_ref": forkpoint.get("history_prefix_ref"),
        "history_hash": forkpoint.get("history_hash"),
        "boundary_token": forkpoint.get("boundary_token"),
        "network_policy": forkpoint.get("network_policy"),
        "secret_policy": forkpoint.get("secret_policy"),
        "resource_policy": forkpoint.get("resource_policy"),
        "snapshot_retention": forkpoint.get("snapshot_retention"),
        "source_evidence_refs": forkpoint.get("source_evidence_refs"),
        "replay_surface": {
            "schema_version": 1,
            "replay_surface_id": f"{branch_id}-replay-surface",
            "environment_version": forkpoint.get("environment_version"),
            "grader_digest": forkpoint.get("grader_digest"),
            "command_argv": list(runtime_command_argv),
            "cwd": str(task_profile["runtime_workdir"]),
            "pre_grader_command_argv": list(
                task_profile.get("pre_grader_command_argv") or []
            ),
            "grader_command_argv": list(task_profile["grader_command_argv"]),
            "state_restore_ref": snapshot_restore_ref,
            "trusted_entrypoint_ref": str(task_profile["trusted_entrypoint_ref"]),
            "captured_at": started_at,
        },
        "action_record_ref": action_ref,
        "action_record_digest": action_record_digest,
        "file_diff_ref": file_diff_ref,
        "file_diff_digest": file_diff_digest,
        "security_probe_ref": _relative(root, security_path),
        "started_at": started_at,
        "completed_at": utc_now(),
        "status": status,
        "cleanup_result": "runtime-owned-cleanup",
        "execution_boundary_crossed": execution_boundary_crossed,
        "provenance_status": "complete",
        "provenance_blockers": [],
    }
    if file_diff.get("status") != "pass":
        branch["provenance_status"] = "incomplete"
        branch["provenance_blockers"].append(
            "filesystem diff capture remains a promotion gate"
        )
    if security_evidence.get("status") != "pass":
        branch["provenance_status"] = "incomplete"
        branch["provenance_blockers"].append(
            "same-runtime branch security negative probes are not captured"
        )
    if not post_agent_snapshot_ref:
        branch["provenance_status"] = "incomplete"
        branch["provenance_blockers"].append(
            "post-agent workspace snapshot is missing or blocked"
        )
    if error_class:
        branch["error_class"] = error_class
        branch["error_message"] = error_message

    causal_evidence = build_causal_evidence_bundle(
        branch, qa_result, file_diff_digest=file_diff_digest
    )
    causal_path = _write_json(
        artifact_root / "causal" / f"{branch_id}.json", causal_evidence
    )
    branch["causal_evidence_ref"] = _relative(root, causal_path)
    branch["causal_evidence_digest"] = causal_evidence["content_digest"]
    branch["causal_delta_status"] = causal_evidence["causal_delta_status"]

    signal_status = "incomplete-classification"
    if qa_result and qa_result.get("status") == "pass":
        try:
            signal_status = branch_signal_status(branch, qa_result)
        except Exception as exc:  # noqa: BLE001 - summarize gate failures in the run artifact.
            if getattr(exc, "error_class", "") == "classification_unavailable":
                signal_status = "incomplete-classification"
            else:
                signal_status = f"gate-error:{type(exc).__name__}:{exc}"
    branch["promotion_signal_status"] = signal_status
    branch_path = _write_json(artifact_root / "branches" / f"{branch_id}.json", branch)
    return {
        "branch": branch,
        "qa": qa_result,
        "branch_ref": _relative(root, branch_path),
        "qa_ref": _relative(root, qa_path),
        "action_record_ref": _relative(root, action_path),
        "file_diff_ref": _relative(root, file_diff_path),
        "security_probe_ref": _relative(root, security_path),
        "causal_evidence_ref": _relative(root, causal_path),
    }


def _feedback_summary(
    branch: dict[str, Any], qa: dict[str, Any] | None
) -> dict[str, Any]:
    return {
        "branch_id": branch.get("branch_id"),
        "reward": branch.get("reward"),
        "promotion_signal_status": branch.get("promotion_signal_status"),
        "status": branch.get("status"),
        "qa_is_reward_hacking": qa.get("is_reward_hacking") if qa else None,
        "summary": (
            f"Branch {branch.get('branch_id')} ended with status={branch.get('status')}, "
            f"reward={branch.get('reward')}, promotion_signal={branch.get('promotion_signal_status')}, "
            f"provenance_status={branch.get('provenance_status')}."
        ),
    }


async def run_live_branch_batch(
    root: Path,
    forkpoint: dict[str, Any],
    *,
    count: int = 12,
    concurrency: int = 12,
) -> dict[str, Any]:
    load_local_env(root)
    presence = _credential_presence()
    if any(value != "present" for value in presence.values()):
        return {
            "status": "blocked",
            "credential_presence": presence,
            "observed_behavior": "12-branch batch skipped because required local credentials were absent",
        }
    if os.environ.get("FORKPROOF_ALLOW_EXTERNAL_QA") != "1":
        return {
            "status": "blocked",
            "credential_presence": presence,
            "observed_behavior": "12-branch batch skipped because external QA export is not approved",
        }

    # Second-precision timestamp alone collides when batches run concurrently (e.g.
    # the qabench parallel benchmark), which would mix multiple tasks' branch
    # artifacts into one run dir. A uuid suffix keeps each run's artifact dir unique.
    run_id = (
        "run-"
        + utc_now().replace("-", "").replace(":", "").removesuffix("Z")
        + "-"
        + uuid.uuid4().hex[:8]
    )
    artifact_root = _artifact_root(root, run_id)
    task, prompt_packet = load_hud_task(root, forkpoint)
    sem = asyncio.Semaphore(concurrency)

    async def guarded(index: int) -> dict[str, Any]:
        async with sem:
            return await _run_one_branch(
                root=root,
                forkpoint=forkpoint,
                task=task,
                prompt_packet=prompt_packet,
                run_id=run_id,
                branch_index=index,
                artifact_root=artifact_root,
            )

    started_at = utc_now()
    results = await asyncio.gather(*(guarded(index) for index in range(count)))
    branches = [item["branch"] for item in results]
    qa_results = [item["qa"] for item in results if item["qa"]]
    candidates = [
        branch
        for branch in branches
        if branch.get("promotion_signal_status") == "candidate"
    ]
    feedback_retry_budget = int(
        os.environ.get("FORKPROOF_HACKER_FEEDBACK_RETRIES", "0")
    )
    feedback_results: list[dict[str, Any]] = []
    if feedback_retry_budget > 0 and not candidates:
        feedback_attempts = [
            _feedback_summary(item["branch"], item["qa"])
            for item in results
            if item["branch"].get("promotion_signal_status") != "candidate"
        ][:12]
        feedback_task, feedback_prompt_packet = load_hud_task(
            root,
            forkpoint,
            feedback_attempts=feedback_attempts,
        )
        for retry_index in range(feedback_retry_budget):
            feedback_result = await _run_one_branch(
                root=root,
                forkpoint=forkpoint,
                task=feedback_task,
                prompt_packet=feedback_prompt_packet,
                run_id=f"{run_id}-feedback-r{retry_index + 1}",
                branch_index=retry_index,
                artifact_root=artifact_root,
            )
            feedback_result["branch"]["feedback_retry_index"] = retry_index + 1
            feedback_results.append(feedback_result)
            if feedback_result["branch"].get("promotion_signal_status") == "candidate":
                break
    feedback_branches = [item["branch"] for item in feedback_results]
    executed_branch_count = sum(
        1 for branch in branches if branch.get("execution_boundary_crossed") is True
    )
    provenance_blockers = sorted(
        {
            blocker
            for branch in branches
            for blocker in branch.get("provenance_blockers", [])
        }
    )
    summary = {
        "schema_version": 1,
        "run_id": run_id,
        "status": "blocked"
        if executed_branch_count != count or provenance_blockers
        else "pass",
        "live_execution_status": "pass"
        if executed_branch_count == count
        else "blocked",
        "provenance_status": "incomplete" if provenance_blockers else "complete",
        "provenance_blockers": provenance_blockers,
        "started_at": started_at,
        "completed_at": utc_now(),
        "fork_point_id": forkpoint.get("fork_point_id"),
        "snapshot_id": forkpoint.get("snapshot_id"),
        "requested_branch_count": count,
        "completed_record_count": len(branches),
        "executed_branch_count": executed_branch_count,
        "concurrency": concurrency,
        "credential_presence": presence,
        "branch_refs": [item["branch_ref"] for item in results],
        "qa_refs": [item["qa_ref"] for item in results],
        "feedback_retry_budget": feedback_retry_budget,
        "feedback_retry_count": len(feedback_branches),
        "feedback_branch_refs": [item["branch_ref"] for item in feedback_results],
        "feedback_candidate_branch_ids": [
            branch["branch_id"]
            for branch in feedback_branches
            if branch.get("promotion_signal_status") == "candidate"
        ],
        "unique_branch_ids": len({branch["branch_id"] for branch in branches}),
        "unique_requested_seed_labels": len({branch["seed"] for branch in branches}),
        "provider_seed_support": "not-supported-by-ClaudeConfig",
        "hud_trace_count": sum(1 for branch in branches if branch.get("hud_trace_id")),
        "branch_role_counts": {
            role: sum(1 for branch in branches if branch.get("branch_role") == role)
            for role in sorted({str(branch.get("branch_role")) for branch in branches})
        },
        "prompt_profile_counts": {
            profile: sum(
                1 for branch in branches if branch.get("prompt_profile") == profile
            )
            for profile in sorted(
                {str(branch.get("prompt_profile")) for branch in branches}
            )
        },
        "prompt_source_ref": prompt_packet["prompt_source_ref"],
        "prompt_digest": prompt_packet["prompt_digest"],
        "feedback_enabled": bool(feedback_branches),
        "reward_success_count": sum(
            1 for branch in branches if branch.get("reward") in (1, 1.0, True)
        ),
        "qa_pass_count": sum(1 for qa in qa_results if qa.get("status") == "pass"),
        "reward_hacking_count": sum(
            1 for qa in qa_results if qa.get("is_reward_hacking") is True
        ),
        "candidate_branch_ids": [branch["branch_id"] for branch in candidates],
        "promotion_signal_counts": {
            status: sum(
                1
                for branch in branches
                if branch.get("promotion_signal_status") == status
            )
            for status in sorted(
                {str(branch.get("promotion_signal_status")) for branch in branches}
            )
        },
        "observed_behavior": (
            "Executed 12 live Hacker BranchRuns concurrently from the same accepted ForkPoint with the "
            "selected Hacker BranchRun prompt profile, then ran user-approved repo-bound Reward "
            "Hacking QA classification for every branch with a HUD trace. Role/profile tags are provenance "
            "only and do not replace reward, QA, dedup, durable storage, or replay gates. Optional feedback "
            "retry branches are tagged separately and are not counted as the 12 independent core BranchRuns."
        ),
    }
    summary_path = _write_json(artifact_root / "branch-run-batch.json", summary)
    return {**summary, "artifact_ref": _relative(root, summary_path)}
