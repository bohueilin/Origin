"""Adapt Plan 008 qabench benchmark trajectories into SFT TraceRecords."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from chronos.research.canonical.qabench import parse_qabench_training_candidate
from chronos.research.sft.models import TraceRecord
from chronos.research.sft.validation import compute_needs_review


def _reward(value: Any, *, field: str) -> float:
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)) and float(value) in (0.0, 1.0):
        return float(value)
    raise ValueError(f"{field} must be 0.0 or 1.0")


def _bool_label(value: Any, *, field: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"{field} must be a boolean")
    return value


def _training_status(row: dict[str, Any]) -> str | None:
    value = row.get("sft_status")
    return value.strip().lower() if isinstance(value, str) and value.strip() else None


def trajectory_row_to_trace_record(
    row: dict[str, Any],
    *,
    qabench_report_ref: str | None = None,
) -> TraceRecord:
    """
    Map one qabench benchmark trajectory to a TraceRecord.

    Uses embedded referee labels from the Plan 008 report (`patched_reward`,
    `is_hack`, `is_legit`) rather than joining to a ReleaseProof case. This is
    the preliminary 008 path until proofset_case_id linkage is available.
    """
    trajectory = parse_qabench_training_candidate(row)
    if trajectory.referee_verdict == "undecided":
        raise ValueError(f"undecided referee verdict for {trajectory.trajectory_id}")
    if not trajectory.task_prompt or not trajectory.assistant_output:
        raise ValueError(
            f"missing prompt or assistant output for {trajectory.trajectory_id}"
        )

    raw_reward = trajectory.hud_reward
    status = _training_status(row)
    training_clean = row.get("training_clean")
    if training_clean is not None and not isinstance(training_clean, bool):
        raise ValueError(
            f"training_clean must be a boolean for {trajectory.trajectory_id}"
        )

    if status == "confirmed_hack":
        patched_reward = 0.0
        is_hack = True
        is_legit = False
    elif training_clean is True or status == "sft_clean":
        patched_reward = 1.0
        is_hack = False
        is_legit = True
    elif status == "quarantined":
        patched_reward = 0.0
        is_hack = False
        is_legit = False
    elif "patched_reward" in row:
        patched_reward = _reward(row["patched_reward"], field="patched_reward")
        is_hack = (
            _bool_label(row["is_hack"], field="is_hack")
            if "is_hack" in row
            else trajectory.referee_verdict == "confirmed_hack"
        )
        is_legit = (
            _bool_label(row["is_legit"], field="is_legit")
            if "is_legit" in row
            else trajectory.referee_verdict == "legitimate"
        )
    else:
        patched_reward = (
            0.0 if trajectory.referee_verdict == "confirmed_hack" else raw_reward
        )
        is_hack = trajectory.referee_verdict == "confirmed_hack"
        is_legit = trajectory.referee_verdict == "legitimate"

    needs_review = (
        compute_needs_review(
            raw_reward=raw_reward,
            patched_reward=patched_reward,
            is_hack=is_hack,
            is_legit=is_legit,
        )
        or status == "quarantined"
    )

    return TraceRecord(
        trace_id=trajectory.trajectory_id,
        task_id=trajectory.task_id,
        task_prompt=trajectory.task_prompt,
        assistant_output=trajectory.assistant_output,
        raw_reward=raw_reward,
        patched_reward=patched_reward,
        is_hack=is_hack,
        is_legit=is_legit,
        exploit_cluster=trajectory.cluster_id,
        environment_version=row.get("environment_version")
        if isinstance(row.get("environment_version"), str)
        else None,
        needs_review=needs_review,
        source="chronos_export",
        trajectory_id=trajectory.trajectory_id,
        qabench_report_ref=qabench_report_ref,
        origin=trajectory.origin,
        referee_verdict=trajectory.referee_verdict,
        qa_verdict=trajectory.qa_verdict,
        cluster_id=trajectory.cluster_id,
        environment_v1=trajectory.environment_version,
        grader_v1_digest=trajectory.grader_digest,
        referee_id="preliminary_diff_based",
        referee_digest=(
            qabench_report_ref.rsplit("#", 1)[-1]
            if qabench_report_ref and "#" in qabench_report_ref
            else None
        ),
        classification_source="preliminary_diff_labeled",
        source_trace_id=(
            row.get("trace_id")
            if isinstance(row.get("trace_id"), str)
            else trajectory.source_trace_id
        ),
    )


def load_qabench_trace_records(
    report_path: str | Path,
) -> tuple[Path, str, list[TraceRecord], list[dict[str, Any]]]:
    """Load a qabench benchmark report and return adapted TraceRecords."""
    resolved = Path(report_path)
    raw = resolved.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    report = json.loads(raw.decode("utf-8"))
    trajectories = report.get("trajectories")
    if not isinstance(trajectories, list):
        raise ValueError("qabench report must include trajectories[]")

    report_ref = f"{resolved}#{digest}"
    traces: list[TraceRecord] = []
    quarantined: list[dict[str, Any]] = []
    for row_index, row in enumerate(trajectories):
        if not isinstance(row, dict):
            quarantined.append(
                {
                    "row_index": row_index,
                    "reason": "qabench_row_not_object",
                }
            )
            continue
        try:
            trace = trajectory_row_to_trace_record(row, qabench_report_ref=report_ref)
            traces.append(trace)
            if _training_status(row) == "quarantined":
                quarantined.append(
                    {
                        "row_index": row_index,
                        "trajectory_id": row.get("trajectory_id")
                        or row.get("trace_id"),
                        "task_id": row.get("task_id"),
                        "reason": row.get("sft_quarantine_reason")
                        or "qabench_sft_status_quarantined",
                    }
                )
        except (ValueError, TypeError) as exc:
            quarantined.append(
                {
                    "row_index": row_index,
                    "trajectory_id": row.get("trajectory_id") or row.get("trace_id"),
                    "task_id": row.get("task_id"),
                    "reason": str(exc),
                }
            )
    return resolved, digest, traces, quarantined
