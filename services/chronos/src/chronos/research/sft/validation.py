"""Validation helpers for Chronos trace rows."""

from __future__ import annotations

from typing import Any

from chronos.research.sft.errors import TraceValidationError
from chronos.research.sft.models import REQUIRED_FIELDS, TraceRecord, TraceSource

OPTIONAL_STRING_FIELDS = (
    "exploit_cluster",
    "environment_version",
    "grader_version",
    "patched_grader_version",
    "hud_trace_url",
    "witness_id",
    "release_proof_id",
)


def _require_mapping(row: Any, *, line_number: int) -> dict[str, Any]:
    if not isinstance(row, dict):
        raise TraceValidationError(
            "each JSONL line must be a JSON object", line_number=line_number
        )
    return row


def _require_non_empty_string(value: Any, field: str, *, line_number: int) -> str:
    if not isinstance(value, str) or not value.strip():
        raise TraceValidationError(
            f"{field} must be a non-empty string", line_number=line_number
        )
    return value.strip()


def _require_reward(value: Any, field: str, *, line_number: int) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TraceValidationError(f"{field} must be a number", line_number=line_number)
    reward = float(value)
    if reward not in (0.0, 1.0):
        raise TraceValidationError(
            f"{field} must be 0.0 or 1.0", line_number=line_number
        )
    return reward


def _require_bool(value: Any, field: str, *, line_number: int) -> bool:
    if not isinstance(value, bool):
        raise TraceValidationError(
            f"{field} must be a boolean", line_number=line_number
        )
    return value


def _optional_string(value: Any, field: str, *, line_number: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise TraceValidationError(
            f"{field} must be a string or null", line_number=line_number
        )
    stripped = value.strip()
    return stripped or None


def compute_needs_review(
    *,
    raw_reward: float,
    patched_reward: float,
    is_hack: bool,
    is_legit: bool,
) -> bool:
    if is_hack and is_legit:
        return True
    if patched_reward == 1.0 and is_hack:
        return True
    if raw_reward == 0.0 and is_hack:
        return True
    return False


def parse_trace_record(
    row: Any,
    *,
    line_number: int,
    source: TraceSource,
) -> TraceRecord:
    """Validate one export row and return a TraceRecord."""
    data = _require_mapping(row, line_number=line_number)

    missing = [field for field in REQUIRED_FIELDS if field not in data]
    if missing:
        joined = ", ".join(sorted(missing))
        raise TraceValidationError(
            f"missing required fields: {joined}", line_number=line_number
        )

    unknown = sorted(set(data) - set(REQUIRED_FIELDS) - set(OPTIONAL_STRING_FIELDS))
    if unknown:
        joined = ", ".join(unknown)
        raise TraceValidationError(f"unknown fields: {joined}", line_number=line_number)

    raw_reward = _require_reward(
        data["raw_reward"], "raw_reward", line_number=line_number
    )
    patched_reward = _require_reward(
        data["patched_reward"], "patched_reward", line_number=line_number
    )
    is_hack = _require_bool(data["is_hack"], "is_hack", line_number=line_number)
    is_legit = _require_bool(data["is_legit"], "is_legit", line_number=line_number)

    optional_values = {
        field: _optional_string(data.get(field), field, line_number=line_number)
        for field in OPTIONAL_STRING_FIELDS
    }

    return TraceRecord(
        trace_id=_require_non_empty_string(
            data["trace_id"], "trace_id", line_number=line_number
        ),
        task_id=_require_non_empty_string(
            data["task_id"], "task_id", line_number=line_number
        ),
        task_prompt=_require_non_empty_string(
            data["task_prompt"], "task_prompt", line_number=line_number
        ),
        assistant_output=_require_non_empty_string(
            data["assistant_output"], "assistant_output", line_number=line_number
        ),
        raw_reward=raw_reward,
        patched_reward=patched_reward,
        is_hack=is_hack,
        is_legit=is_legit,
        exploit_cluster=optional_values["exploit_cluster"],
        environment_version=optional_values["environment_version"],
        grader_version=optional_values["grader_version"],
        patched_grader_version=optional_values["patched_grader_version"],
        hud_trace_url=optional_values["hud_trace_url"],
        witness_id=optional_values["witness_id"],
        release_proof_id=optional_values["release_proof_id"],
        needs_review=compute_needs_review(
            raw_reward=raw_reward,
            patched_reward=patched_reward,
            is_hack=is_hack,
            is_legit=is_legit,
        ),
        source=source,
    )
