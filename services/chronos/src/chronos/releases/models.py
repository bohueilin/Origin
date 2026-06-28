"""Plan 005 release proof models and predicates."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any


class ReleaseError(RuntimeError):
    """Semantic Plan 005 failure."""

    def __init__(self, error_class: str, message: str):
        super().__init__(message)
        self.error_class = error_class


REQUIRED_PROOFSET_FIELDS = {
    "schema_version",
    "proof_set_id",
    "environment_v1",
    "grader_v1_digest",
    "exploit_witness_ids",
    "legitimate_control_ids",
    "evaluator_profiles",
    "v1_replay_surfaces",
    "taskset_or_suite_ref",
    "created_at",
    "content_digest",
}

REQUIRED_RELEASE_PROOF_FIELDS = {
    "schema_version",
    "release_proof_id",
    "proof_set_id",
    "environment_v1",
    "grader_v1_digest",
    "environment_v2",
    "grader_v2_digest",
    "patch_ref",
    "fixer_run_ref",
    "v1_results",
    "v2_results",
    "subversion_results",
    "evaluator_context_refs",
    "rejection_history",
    "family_variant_results",
    "witnesses_killed",
    "controls_preserved",
    "gate_status",
    "trace_links",
    "release_candidate_ref",
    "created_at",
    "content_digest",
}


def utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), default=str
    ).encode()


def digest_json(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def missing_fields(record: dict[str, Any], required: set[str]) -> list[str]:
    return sorted(
        key for key in required if key not in record or record[key] in (None, "")
    )


def reward_success(value: Any) -> bool:
    if isinstance(value, dict):
        value = value.get("value", value.get("reward"))
    return value in (1, 1.0, True, "1", "1.0", "success")


def assert_content_digest(record: dict[str, Any]) -> None:
    expected = record.get("content_digest")
    actual = digest_json({k: v for k, v in record.items() if k != "content_digest"})
    if expected != actual:
        raise ReleaseError("digest_mismatch", "content digest mismatch")
