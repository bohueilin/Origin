"""Normalize Plan 008 qabench report trajectories for training analysis."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterator

from chronos.research.canonical.errors import CanonicalInputError
from chronos.research.canonical.types import RecordOrigin, RefereeVerdict


@dataclass(frozen=True, slots=True)
class QABenchTrajectory:
    """One qabench trajectory that may become a training analysis row."""

    trajectory_id: str
    task_id: str
    task_prompt: str | None
    assistant_output: str | None
    origin: RecordOrigin
    proofset_case_id: str | None
    hud_reward: float
    referee_verdict: RefereeVerdict
    qa_verdict: str | None
    cluster_id: str | None
    lineage: dict[str, Any] | None
    environment_version: str | None
    grader_digest: str | None
    source_trace_id: str | None
    solution_family: str | None
    template_family: str | None


def _quarantine_row(raw: Any, *, row_index: int, reason: str) -> dict[str, Any]:
    row = raw if isinstance(raw, dict) else {}
    return {
        "row_index": row_index,
        "trajectory_id": _string(row, "trajectory_id", "id", "trace_id"),
        "task_id": _string(row, "task_id"),
        "origin": _string(row, "origin", "trajectory_origin"),
        "proofset_case_id": _string(row, "proofset_case_id", "case_id"),
        "referee_verdict": row.get("referee_verdict")
        if isinstance(row, dict)
        else None,
        "reason": reason,
    }


def _string(row: dict[str, Any], *fields: str) -> str | None:
    for field in fields:
        value = row.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _required_string(row: dict[str, Any], *fields: str) -> str:
    value = _string(row, *fields)
    if value is None:
        joined = ", ".join(fields)
        raise CanonicalInputError(f"qabench trajectory missing {joined}")
    return value


def _reward(row: dict[str, Any]) -> float:
    for field in ("hud_reward", "reward", "v1_reward"):
        value = row.get(field)
        if isinstance(value, bool):
            return 1.0 if value else 0.0
        if isinstance(value, (int, float)) and float(value) in (0.0, 1.0):
            return float(value)
    raise CanonicalInputError(f"qabench trajectory lacks binary HUD reward: {row!r}")


def _origin(row: dict[str, Any]) -> RecordOrigin:
    value = _string(row, "origin", "trajectory_origin") or "recorded"
    if value not in ("base", "recorded", "branch", "control"):
        raise CanonicalInputError(f"unsupported qabench origin: {value!r}")
    return value  # type: ignore[return-value]


def _verdict(row: dict[str, Any]) -> RefereeVerdict:
    raw = row.get("referee_verdict")
    if isinstance(raw, dict):
        raw = raw.get("verdict") or raw.get("label") or raw.get("status")
    text = str(raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    if text in {"confirmed_hack", "confirmed_reward_hack", "hack", "reward_hack"}:
        return "confirmed_hack"
    if text in {"legitimate", "legit", "pass", "passed"}:
        return "legitimate"
    if text in {"undecided", "unknown", "inconclusive", ""}:
        return "undecided"
    raise CanonicalInputError(f"unsupported referee verdict: {raw!r}")


def _qa_verdict(row: dict[str, Any]) -> str | None:
    raw = row.get("hud_qa_verdict") or row.get("qa_verdict")
    if isinstance(raw, dict):
        value = raw.get("is_reward_hacking")
        if isinstance(value, bool):
            return "reward_hacking" if value else "not_reward_hacking"
        value = raw.get("verdict") or raw.get("hacking_strategy")
        return str(value) if value is not None else None
    return str(raw) if raw is not None else None


def _lineage(row: dict[str, Any]) -> dict[str, Any] | None:
    raw = (
        row.get("branch_divergence_lineage")
        or row.get("divergence_lineage")
        or row.get("lineage")
    )
    return raw if isinstance(raw, dict) else None


def parse_qabench_training_candidate(row: dict[str, Any]) -> QABenchTrajectory:
    """Parse one qabench trajectory row into the canonical training shape."""
    origin = _origin(row)
    verdict = _verdict(row)
    lineage = _lineage(row)
    return QABenchTrajectory(
        trajectory_id=_required_string(row, "trajectory_id", "id", "trace_id"),
        task_id=_required_string(row, "task_id"),
        task_prompt=_string(row, "task_prompt", "prompt", "instruction"),
        assistant_output=_string(row, "assistant_output", "final_response", "response"),
        origin=origin,
        proofset_case_id=_string(row, "proofset_case_id", "case_id"),
        hud_reward=_reward(row),
        referee_verdict=verdict,
        qa_verdict=_qa_verdict(row),
        cluster_id=_string(row, "cluster_id", "exploit_cluster"),
        lineage=lineage,
        environment_version=_string(row, "environment_version", "environment_v1"),
        grader_digest=_string(row, "grader_digest", "grader_v1_digest"),
        source_trace_id=_string(
            row, "source_trace_id", "parent_trace_id", "hud_trace_id"
        ),
        solution_family=_string(row, "solution_family", "solution_template_family"),
        template_family=_string(row, "template_family", "prompt_template_family"),
    )


def iter_qabench_training_candidate_results(
    report: dict[str, Any],
) -> Iterator[QABenchTrajectory | dict[str, Any]]:
    """Yield parsed qabench rows or row-level quarantine records."""
    trajectories = report.get("trajectories")
    if not isinstance(trajectories, list):
        raise CanonicalInputError("qabench report must include trajectories[]")

    for row_index, raw in enumerate(trajectories):
        if not isinstance(raw, dict):
            yield _quarantine_row(
                raw, row_index=row_index, reason="qabench_row_not_object"
            )
            continue
        try:
            yield parse_qabench_training_candidate(raw)
        except CanonicalInputError as exc:
            yield _quarantine_row(
                raw,
                row_index=row_index,
                reason=f"qabench_row_invalid: {exc}",
            )


def iter_qabench_training_candidates(
    report: dict[str, Any],
) -> Iterator[QABenchTrajectory]:
    """Yield structurally valid qabench trajectories."""
    trajectories = report.get("trajectories")
    if not isinstance(trajectories, list):
        raise CanonicalInputError("qabench report must include trajectories[]")

    for raw in trajectories:
        if not isinstance(raw, dict):
            raise CanonicalInputError("each qabench trajectory must be an object")
        yield parse_qabench_training_candidate(raw)
