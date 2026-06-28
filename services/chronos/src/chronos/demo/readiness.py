"""Demo readiness pack validation."""

from __future__ import annotations

from typing import Any

from .models import DemoError, assert_content_digest, require_fields
from .redaction import redact_record

REQUIRED_READINESS_FIELDS = {
    "schema_version",
    "readiness_pack_id",
    "created_at",
    "mode",
    "status",
    "checks",
    "artifact_refs",
    "redaction_status",
    "content_digest",
}
READINESS_MODES = {"acceptance", "presentation"}
READINESS_STATUSES = {"pass", "blocked", "failed"}
CHECK_STATUSES = {"pass", "expected-block", "blocked", "failed", "not-applicable"}
REQUIRED_CHECKS = {
    "hud_auth",
    "modal_auth",
    "model_gateway_auth",
    "network_reachability",
    "quota_headroom",
    "source_trace",
    "forkpoint",
    "prior_witness",
    "replay_entrypoint",
    "proofset",
    "release_proof",
    "release_candidate",
    "publication_attempt_or_expected_block",
    "local_artifact_paths",
}
REQUIRED_ARTIFACT_REFS = {
    "source_trace_ref",
    "forkpoint_ref",
    "prior_witness_ref",
    "replay_entrypoint_ref",
    "proofset_ref",
    "release_proof_ref",
    "release_candidate_ref",
    "metrics_report_ref",
    "publication_attempt_or_block_ref",
}


def validate_readiness_pack(record: dict[str, Any]) -> None:
    """Validate the Plan 006 demo-day readiness pack contract."""

    require_fields(
        record, REQUIRED_READINESS_FIELDS, error_class="readiness_incomplete"
    )
    if record["mode"] not in READINESS_MODES:
        raise DemoError("readiness_invalid", "readiness mode is invalid")
    if record["status"] not in READINESS_STATUSES:
        raise DemoError("readiness_invalid", "readiness status is invalid")
    if record["redaction_status"] != "redacted":
        raise DemoError("secret_exposure", "readiness pack is not redacted")
    if redact_record({k: v for k, v in record.items() if k != "content_digest"}) != {
        k: v for k, v in record.items() if k != "content_digest"
    }:
        raise DemoError(
            "secret_exposure", "readiness pack contains unredacted secret-like content"
        )
    _validate_checks(record["checks"], record["status"])
    _validate_artifact_refs(record["artifact_refs"], record["status"])
    assert_content_digest(record)


def _validate_checks(checks: list[dict[str, Any]], pack_status: str) -> None:
    if not isinstance(checks, list):
        raise DemoError("readiness_invalid", "checks must be a list")
    by_name: dict[str, dict[str, Any]] = {}
    for check in checks:
        if not isinstance(check, dict):
            raise DemoError(
                "readiness_invalid", "each readiness check must be an object"
            )
        require_fields(
            check,
            {"name", "status", "evidence_refs"},
            error_class="readiness_check_incomplete",
        )
        if check["status"] not in CHECK_STATUSES:
            raise DemoError(
                "readiness_invalid",
                f"readiness check {check['name']} has invalid status",
            )
        refs = check["evidence_refs"]
        if not isinstance(refs, list) or not all(
            isinstance(ref, str) and ref for ref in refs
        ):
            raise DemoError(
                "readiness_check_incomplete",
                f"readiness check {check['name']} lacks evidence refs",
            )
        if check["status"] in {
            "blocked",
            "failed",
            "expected-block",
            "not-applicable",
        } and not check.get("reason"):
            raise DemoError(
                "readiness_check_incomplete",
                f"readiness check {check['name']} needs reason",
            )
        if check["name"] in by_name:
            raise DemoError(
                "readiness_invalid", f"readiness check {check['name']} is duplicated"
            )
        by_name[check["name"]] = check
    missing = sorted(REQUIRED_CHECKS - set(by_name))
    if missing:
        raise DemoError(
            "readiness_incomplete", f"readiness pack missing checks: {missing}"
        )
    bad = {check["status"] for check in by_name.values()} & {"blocked", "failed"}
    expected_blocks = [
        check for check in by_name.values() if check["status"] == "expected-block"
    ]
    not_applicable = [
        check for check in by_name.values() if check["status"] == "not-applicable"
    ]
    if pack_status == "pass" and (bad or expected_blocks or not_applicable):
        raise DemoError(
            "readiness_invalid", "passing readiness pack cannot contain blockers"
        )
    if pack_status == "blocked" and not (bad or expected_blocks):
        raise DemoError(
            "readiness_invalid",
            "blocked readiness pack needs blocked or expected-block check",
        )


def _validate_artifact_refs(refs: dict[str, Any], pack_status: str) -> None:
    if not isinstance(refs, dict):
        raise DemoError("readiness_invalid", "artifact_refs must be an object")
    missing = sorted(key for key in REQUIRED_ARTIFACT_REFS if not refs.get(key))
    if missing:
        raise DemoError(
            "readiness_incomplete", f"readiness pack missing artifact refs: {missing}"
        )
    for key, value in refs.items():
        if not isinstance(value, str):
            raise DemoError("readiness_invalid", f"artifact ref {key} must be a string")
        if pack_status == "pass" and value.startswith(("blocked:", "missing:")):
            raise DemoError(
                "readiness_invalid",
                f"passing readiness pack cannot use placeholder artifact ref {key}",
            )
        if value.startswith(("http://", "https://")) and "token=" in value.lower():
            raise DemoError(
                "secret_exposure", f"artifact ref {key} contains a token-bearing URL"
            )
