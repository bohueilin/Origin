"""PublicationAttempt contracts and trusted preflight policy."""

from __future__ import annotations

from typing import Any

from chronos.releases.models import ReleaseError
from chronos.releases.release_proof import assert_release_proof

from .models import (
    DemoError,
    assert_content_digest,
    content_digest,
    require_fields,
    utc_now,
    with_content_digest,
)
from .redaction import redact_record

OUTCOMES = {
    "published",
    "permission-blocked",
    "blocked-with-proof",
    "prepared",
    "failed",
}
PUBLICATION_COMMAND_KEY = "integration-publication"
DEPLOY_COMMAND_REF_SUFFIX = "COMMANDS.json:hud-deploy"
FAILURE_CLASSES = {
    "proof_mismatch",
    "unauthorized_target",
    "mixed_identity",
    "missing_artifacts",
    "trusted_context_unavailable",
    "branch_writable_evidence",
    "secret_exposure",
}
REQUIRED_ATTEMPT_FIELDS = {
    "schema_version",
    "publication_attempt_id",
    "release_proof_id",
    "release_proof_digest",
    "target_id",
    "publisher_capability_label",
    "command_key",
    "command_argv_ref",
    "trusted_context_ref",
    "idempotency_key",
    "outcome",
    "evidence_refs",
    "redaction_status",
    "created_at",
    "content_digest",
}
COMMAND_REF_SUFFIX = "COMMANDS.json:integration-publication"
UNTRUSTED_REF_PREFIXES = ("/tmp/", "/private/tmp/", "tmp/", "artifacts/chronos/demo/")


def idempotency_key(*, release_proof_digest: str, target_id: str) -> str:
    return content_digest(
        {"release_proof_digest": release_proof_digest, "target_id": target_id}
    )


def validate_publication_attempt(record: dict[str, Any]) -> None:
    """Validate a publication attempt without invoking a publish API."""

    require_fields(
        record, REQUIRED_ATTEMPT_FIELDS, error_class="publication_attempt_incomplete"
    )
    _validate_required_field_shapes(record)
    if redact_record({k: v for k, v in record.items() if k != "content_digest"}) != {
        k: v for k, v in record.items() if k != "content_digest"
    }:
        raise DemoError(
            "secret_exposure",
            "publication attempt contains unredacted secret-like content",
        )
    if record["outcome"] not in OUTCOMES:
        raise DemoError("publication_attempt_invalid", "publication outcome is invalid")
    if record["command_key"] != PUBLICATION_COMMAND_KEY:
        raise DemoError(
            "publication_attempt_invalid",
            "publication attempt must use integration-publication command",
        )
    expected_key = idempotency_key(
        release_proof_digest=record["release_proof_digest"],
        target_id=record["target_id"],
    )
    if record["idempotency_key"] != expected_key:
        raise DemoError(
            "publication_attempt_invalid",
            "idempotency key does not match proof digest and target",
        )
    if record["redaction_status"] != "redacted":
        raise DemoError("secret_exposure", "publication attempt is not redacted")
    if not isinstance(record["evidence_refs"], list) or not record["evidence_refs"]:
        raise DemoError(
            "publication_attempt_incomplete", "publication attempt lacks evidence refs"
        )
    if not all(isinstance(ref, str) and ref for ref in record["evidence_refs"]):
        raise DemoError(
            "publication_attempt_invalid",
            "publication evidence refs must be non-empty strings",
        )
    if len(record["evidence_refs"]) != len(set(record["evidence_refs"])):
        raise DemoError(
            "publication_attempt_invalid", "publication evidence refs must be unique"
        )
    if record.get("branch_writable_evidence"):
        raise DemoError(
            "branch_writable_evidence",
            "publication attempt references branch-writable evidence",
        )
    _validate_outcome(record)
    assert_content_digest(record)


def _validate_required_field_shapes(record: dict[str, Any]) -> None:
    if record["schema_version"] != 1:
        raise DemoError(
            "publication_attempt_invalid",
            "publication attempt schema_version is invalid",
        )
    for field in REQUIRED_ATTEMPT_FIELDS - {
        "schema_version",
        "content_digest",
        "evidence_refs",
    }:
        if not isinstance(record[field], str) or not record[field].strip():
            raise DemoError(
                "publication_attempt_invalid", f"{field} must be a non-empty string"
            )


def publication_preflight(
    *,
    release_proof: dict[str, Any] | None,
    target_id: str | None,
    trusted_context_ref: str | None,
    publish_binding_ref: str | None,
    publisher_capability_label: str | None,
    release_candidate_ref: str | None,
    permission_denied: bool = False,
    evidence_refs: list[str] | None = None,
    deferred_deploy_command_ref: str | None = None,
    deferred_reason: str | None = None,
    published_target_ref: str | None = None,
) -> dict[str, Any]:
    """Return a structured attempt/blocker without publishing anything."""

    evidence = evidence_refs or []
    base = {
        "schema_version": 1,
        "publication_attempt_id": "pubattempt-pending",
        "release_proof_id": release_proof.get("release_proof_id")
        if release_proof
        else "missing-release-proof",
        "release_proof_digest": (
            release_proof.get("content_digest") or "invalid-release-proof-digest"
        )
        if release_proof
        else "missing-release-proof-digest",
        "target_id": target_id or "missing-target",
        "publisher_capability_label": publisher_capability_label
        or "missing-capability",
        "command_key": PUBLICATION_COMMAND_KEY,
        "command_argv_ref": publish_binding_ref
        or f"docs/plans/repo-map/{COMMAND_REF_SUFFIX}",
        "trusted_context_ref": trusted_context_ref or "missing-trusted-context",
        "evidence_refs": evidence,
        "redaction_status": "redacted",
        "created_at": utc_now(),
    }
    base["idempotency_key"] = idempotency_key(
        release_proof_digest=base["release_proof_digest"],
        target_id=base["target_id"],
    )
    base["publication_attempt_id"] = "pubattempt-" + base["idempotency_key"][:16]

    failure = _preflight_failure(
        release_proof, target_id, trusted_context_ref, release_candidate_ref
    )
    if failure:
        base.update(
            {
                "outcome": "failed",
                "normalized_error_class": failure,
                "release_candidate_ref": release_candidate_ref,
            }
        )
        return with_content_digest(base)
    if permission_denied:
        base.update(
            {
                "outcome": "permission-blocked",
                "normalized_error_class": "publish_unauthorized",
                "release_candidate_ref": release_candidate_ref,
                "release_proof_gate_status": release_proof.get("gate_status"),
            }
        )
        return with_content_digest(base)
    if not publish_binding_ref or not publisher_capability_label:
        base.update(
            {
                "outcome": "blocked-with-proof",
                "normalized_error_class": "publish_binding_missing",
                "release_candidate_ref": release_candidate_ref,
                "release_proof_gate_status": release_proof.get("gate_status"),
            }
        )
        return with_content_digest(base)
    if deferred_deploy_command_ref and deferred_reason:
        # Real binding + authorized target are present, but the actual registry
        # upload is deliberately not performed. This is "prepared": everything
        # verified and ready, no environment published.
        base.update(
            {
                "outcome": "prepared",
                "release_candidate_ref": release_candidate_ref,
                "release_proof_gate_status": release_proof.get("gate_status"),
                "deferred_deploy_command_ref": deferred_deploy_command_ref,
                "deferred_reason": deferred_reason,
            }
        )
        if published_target_ref:
            base["published_target_ref"] = published_target_ref
        return with_content_digest(base)
    base.update(
        {
            "outcome": "failed",
            "normalized_error_class": "publish_api_not_invoked_by_contract_layer",
            "release_candidate_ref": release_candidate_ref,
        }
    )
    return with_content_digest(base)


def _preflight_failure(
    release_proof: dict[str, Any] | None,
    target_id: str | None,
    trusted_context_ref: str | None,
    release_candidate_ref: str | None,
) -> str | None:
    if not release_proof:
        return "proof_mismatch"
    try:
        assert_release_proof(release_proof)
    except ReleaseError:
        return "proof_mismatch"
    if release_proof.get("gate_status") != "pass":
        return "proof_mismatch"
    if not target_id:
        return "unauthorized_target"
    if not release_candidate_ref:
        return "missing_artifacts"
    if not trusted_context_ref:
        return "trusted_context_unavailable"
    if release_proof.get("branch_writable_evidence"):
        return "branch_writable_evidence"
    if release_proof.get("environment_v2") == release_proof.get(
        "environment_v1"
    ) or release_proof.get("grader_v2_digest") == release_proof.get("grader_v1_digest"):
        return "mixed_identity"
    return None


def _validate_outcome(record: dict[str, Any]) -> None:
    outcome = record["outcome"]
    if outcome == "published":
        _require_trusted_publication_context(record, require_publish_binding=True)
        if not record.get("published_environment_ref"):
            raise DemoError(
                "publication_attempt_invalid",
                "published outcome needs stable environment ref",
            )
        if not _trusted_evidence_ref(record.get("trusted_publication_evidence_ref")):
            raise DemoError(
                "publication_attempt_invalid",
                "published outcome needs trusted publication evidence ref",
            )
        if record["trusted_publication_evidence_ref"] not in record["evidence_refs"]:
            raise DemoError(
                "publication_attempt_invalid",
                "trusted publication evidence ref must be in evidence_refs",
            )
        if record.get("release_proof_gate_status") != "pass":
            raise DemoError(
                "publication_attempt_invalid",
                "published outcome requires passing ReleaseProof",
            )
        if not record.get("release_candidate_ref"):
            raise DemoError(
                "publication_attempt_invalid",
                "published outcome needs release_candidate_ref",
            )
        if not _trusted_evidence_ref(record.get("release_candidate_ref")):
            raise DemoError(
                "publication_attempt_invalid",
                "published outcome needs trusted release_candidate_ref",
            )
        if record.get("normalized_error_class"):
            raise DemoError(
                "publication_attempt_invalid",
                "published outcome cannot carry an error class",
            )
    if outcome in {"permission-blocked", "blocked-with-proof"}:
        _require_trusted_publication_context(
            record, require_publish_binding=outcome == "permission-blocked"
        )
        if not record.get("release_candidate_ref"):
            raise DemoError(
                "publication_attempt_invalid", f"{outcome} needs release_candidate_ref"
            )
        if not _trusted_evidence_ref(record.get("release_candidate_ref")):
            raise DemoError(
                "publication_attempt_invalid",
                f"{outcome} needs trusted release_candidate_ref",
            )
        if record.get("release_proof_gate_status") != "pass":
            raise DemoError(
                "publication_attempt_invalid",
                f"{outcome} requires passing ReleaseProof",
            )
        expected_error = {
            "permission-blocked": "publish_unauthorized",
            "blocked-with-proof": "publish_binding_missing",
        }[outcome]
        if record.get("normalized_error_class") != expected_error:
            raise DemoError(
                "publication_attempt_invalid", f"{outcome} needs {expected_error}"
            )
    if outcome == "prepared":
        # Prepared proves a real bound primitive + authorized target + verified
        # candidate are ready, with the actual upload deliberately deferred.
        _require_trusted_publication_context(record, require_publish_binding=True)
        if not record.get("release_candidate_ref"):
            raise DemoError(
                "publication_attempt_invalid",
                "prepared outcome needs release_candidate_ref",
            )
        if not _trusted_evidence_ref(record.get("release_candidate_ref")):
            raise DemoError(
                "publication_attempt_invalid",
                "prepared outcome needs trusted release_candidate_ref",
            )
        if record.get("release_proof_gate_status") != "pass":
            raise DemoError(
                "publication_attempt_invalid",
                "prepared outcome requires passing ReleaseProof",
            )
        if record.get("normalized_error_class"):
            raise DemoError(
                "publication_attempt_invalid",
                "prepared outcome cannot carry an error class",
            )
        if record.get("published_environment_ref"):
            raise DemoError(
                "publication_attempt_invalid",
                "prepared outcome cannot carry a published environment ref",
            )
        if not _trusted_deploy_command_ref(record.get("deferred_deploy_command_ref")):
            raise DemoError(
                "publication_attempt_invalid",
                "prepared outcome needs trusted deferred_deploy_command_ref",
            )
        if (
            not isinstance(record.get("deferred_reason"), str)
            or not record["deferred_reason"].strip()
        ):
            raise DemoError(
                "publication_attempt_invalid",
                "prepared outcome needs a non-empty deferred_reason",
            )
    if outcome == "failed":
        if record.get("normalized_error_class") not in FAILURE_CLASSES | {
            "proof_mismatch",
            "publish_api_not_invoked_by_contract_layer",
        }:
            raise DemoError(
                "publication_attempt_invalid",
                "failed outcome needs normalized failure class",
            )
        if record.get("published_environment_ref"):
            raise DemoError(
                "publication_attempt_invalid",
                "failed outcome cannot carry published environment ref",
            )


def _require_trusted_publication_context(
    record: dict[str, Any], *, require_publish_binding: bool
) -> None:
    for field in ("target_id", "trusted_context_ref"):
        if str(record.get(field, "")).startswith("missing-"):
            raise DemoError("publication_attempt_invalid", f"{field} is not available")
        if _is_untrusted_ref(record.get(field)):
            raise DemoError("publication_attempt_invalid", f"{field} is not trusted")
    command_ref = record.get("command_argv_ref")
    if str(command_ref).startswith("missing-"):
        raise DemoError(
            "publication_attempt_invalid", "command_argv_ref is not available"
        )
    if not _trusted_command_ref(command_ref):
        raise DemoError(
            "publication_attempt_invalid",
            "command_argv_ref must reference integration-publication",
        )
    if require_publish_binding:
        for field in ("publisher_capability_label",):
            if str(record.get(field, "")).startswith("missing-"):
                raise DemoError(
                    "publication_attempt_invalid", f"{field} is not available"
                )
            if _is_untrusted_ref(record.get(field)):
                raise DemoError(
                    "publication_attempt_invalid", f"{field} is not trusted"
                )


def _trusted_command_ref(value: Any) -> bool:
    return (
        isinstance(value, str)
        and value.strip().endswith(COMMAND_REF_SUFFIX)
        and not _is_untrusted_ref(value)
    )


def _trusted_deploy_command_ref(value: Any) -> bool:
    return (
        isinstance(value, str)
        and value.strip().endswith(DEPLOY_COMMAND_REF_SUFFIX)
        and not _is_untrusted_ref(value)
    )


def _trusted_evidence_ref(value: Any) -> bool:
    return (
        isinstance(value, str)
        and bool(value.strip())
        and not _is_untrusted_ref(value)
        and not value.startswith("missing-")
    )


def _is_untrusted_ref(value: Any) -> bool:
    if not isinstance(value, str):
        return True
    normalized = value.strip()
    return (
        not normalized
        or normalized.startswith(UNTRUSTED_REF_PREFIXES)
        or "/../" in normalized
        or normalized.startswith("../")
    )
