"""ReleaseProof validation and sealing."""

from __future__ import annotations

from typing import Any

from .artifact_store import ReleaseArtifactStore
from .models import (
    REQUIRED_RELEASE_PROOF_FIELDS,
    ReleaseError,
    assert_content_digest,
    missing_fields,
)

_VOLATILE_IDEMPOTENCY_FIELDS = {
    "content_digest",
    "created_at",
    "captured_at",
    "recorded_at",
}


def assert_release_proof(record: dict[str, Any]) -> None:
    """Verify the ReleaseProof artifact is complete and content-addressed."""

    missing = missing_fields(record, REQUIRED_RELEASE_PROOF_FIELDS)
    if missing:
        raise ReleaseError(
            "release_proof_incomplete", f"ReleaseProof missing {missing}"
        )
    if record["gate_status"] not in {"pass", "reject", "bounded_failure"}:
        raise ReleaseError(
            "release_proof_incomplete", "ReleaseProof gate_status is invalid"
        )
    if record["gate_status"] != "bounded_failure" and (
        not record["v1_results"] or not record["v2_results"]
    ):
        raise ReleaseError(
            "release_proof_incomplete", "ReleaseProof lacks per-case results"
        )
    if (
        record["gate_status"] in {"reject", "bounded_failure"}
        and not record["rejection_history"]
    ):
        raise ReleaseError(
            "release_proof_incomplete", "ReleaseProof lacks rejection history"
        )
    assert_content_digest(record)


def seal_release_proof(
    *,
    store: ReleaseArtifactStore,
    release_proof: dict[str, Any],
) -> dict[str, Any]:
    """Persist a content-verified ReleaseProof through the append-only store."""

    assert_release_proof(release_proof)
    try:
        store.create("release-proofs", release_proof["release_proof_id"], release_proof)
    except ReleaseError as exc:
        if exc.error_class != "artifact_immutable":
            raise
        existing = store.read("release-proofs", release_proof["release_proof_id"])
        if _stable(existing) != _stable(release_proof):
            raise
    return store.read("release-proofs", release_proof["release_proof_id"])


def _stable(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _stable(item)
            for key, item in value.items()
            if key not in _VOLATILE_IDEMPOTENCY_FIELDS
        }
    if isinstance(value, list):
        return [_stable(item) for item in value]
    return value
