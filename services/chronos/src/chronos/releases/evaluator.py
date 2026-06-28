"""Evaluator result identity checks for Plan 005."""

from __future__ import annotations

from typing import Any

from .models import ReleaseError, missing_fields


CASE_RESULT_FIELDS = {
    "case_id",
    "case_kind",
    "reward",
    "environment_version",
    "grader_digest",
    "trace_ref",
}


def assert_case_result_identity(
    results: list[dict[str, Any]],
    *,
    expected_environment: str,
    expected_grader_digest: str,
    phase: str,
) -> None:
    """Abort when any case lacks immutable v1/v2 runtime identity."""

    for result in results:
        missing = missing_fields(result, CASE_RESULT_FIELDS)
        if missing:
            raise ReleaseError("case_incomplete", f"{phase} case missing {missing}")
        if result["environment_version"] != expected_environment:
            raise ReleaseError(
                "environment_mismatch",
                f"{phase} case used mixed environment: {result['case_id']}",
            )
        if result["grader_digest"] != expected_grader_digest:
            raise ReleaseError(
                "grader_mismatch",
                f"{phase} case used mixed grader digest: {result['case_id']}",
            )
