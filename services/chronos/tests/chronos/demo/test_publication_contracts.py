from __future__ import annotations

import pytest

from chronos.demo.models import DemoError, with_content_digest
from chronos.demo.publication import (
    idempotency_key,
    publication_preflight,
    validate_publication_attempt,
)
from chronos.releases.models import digest_json


def release_proof(**overrides):
    record = {
        "schema_version": 1,
        "release_proof_id": "rp-001",
        "proof_set_id": "proof-set-001",
        "environment_v1": "env-v1",
        "grader_v1_digest": "grader-v1",
        "environment_v2": "env-v2",
        "grader_v2_digest": "grader-v2",
        "patch_ref": "artifacts/chronos/releases/patch.json",
        "fixer_run_ref": "artifacts/chronos/releases/harden-result.json",
        "v1_results": [{"case_id": "witness-001", "kind": "witness", "reward": 1.0}],
        "v2_results": [{"case_id": "witness-001", "kind": "witness", "reward": 0.0}],
        "subversion_results": [],
        "evaluator_context_refs": ["artifacts/chronos/releases/context.json"],
        "rejection_history": [],
        "family_variant_results": [],
        "witnesses_killed": ["witness-001"],
        "controls_preserved": ["control-001"],
        "gate_status": "pass",
        "trace_links": ["trace://source"],
        "release_candidate_ref": "artifacts/chronos/releases/candidate.json",
        "created_at": "2026-06-21T00:00:00Z",
    }
    record.update(overrides)
    record["content_digest"] = digest_json(record)
    return record


def attempt(**overrides):
    key = idempotency_key(release_proof_digest="rp-digest", target_id="target-prod")
    record = {
        "schema_version": 1,
        "publication_attempt_id": "pub-001",
        "release_proof_id": "rp-001",
        "release_proof_digest": "rp-digest",
        "target_id": "target-prod",
        "publisher_capability_label": "trusted-publisher",
        "command_key": "integration-publication",
        "command_argv_ref": "docs/plans/repo-map/COMMANDS.json:integration-publication",
        "trusted_context_ref": "trusted-ci",
        "idempotency_key": key,
        "outcome": "blocked-with-proof",
        "release_proof_gate_status": "pass",
        "release_candidate_ref": "artifacts/chronos/releases/candidate.json",
        "normalized_error_class": "publish_binding_missing",
        "evidence_refs": ["release-proof.json", "candidate.json"],
        "redaction_status": "redacted",
        "created_at": "2026-06-21T00:00:00Z",
    }
    record.update(overrides)
    return with_content_digest(record)


def test_blocked_with_proof_requires_passing_proof_and_candidate():
    validate_publication_attempt(attempt())

    with pytest.raises(DemoError, match="passing ReleaseProof"):
        validate_publication_attempt(attempt(release_proof_gate_status="reject"))

    with pytest.raises(DemoError, match="release_candidate_ref"):
        validate_publication_attempt(attempt(release_candidate_ref=None))

    with pytest.raises(DemoError, match="publish_binding_missing"):
        validate_publication_attempt(attempt(normalized_error_class=None))


@pytest.mark.parametrize(
    "candidate_ref",
    [
        "/tmp/releasecandidate.json",
        "artifacts/chronos/demo/preflight-blockers/releasecandidate.json",
    ],
)
def test_proof_backed_outcomes_reject_untrusted_candidate_refs(candidate_ref):
    with pytest.raises(DemoError, match="trusted release_candidate_ref"):
        validate_publication_attempt(attempt(release_candidate_ref=candidate_ref))


def test_preflight_fails_missing_or_bad_proof_instead_of_claiming_blocked_with_proof():
    record = publication_preflight(
        release_proof=release_proof(gate_status="reject"),
        target_id="target-prod",
        trusted_context_ref="trusted-ci",
        publish_binding_ref=None,
        publisher_capability_label=None,
        release_candidate_ref="candidate.json",
        evidence_refs=["candidate.json"],
    )

    assert record["outcome"] == "failed"
    assert record["normalized_error_class"] == "proof_mismatch"
    validate_publication_attempt(record)


def test_preflight_records_blocked_with_proof_only_after_passing_proof():
    record = publication_preflight(
        release_proof=release_proof(),
        target_id="target-prod",
        trusted_context_ref="trusted-ci",
        publish_binding_ref=None,
        publisher_capability_label=None,
        release_candidate_ref="candidate.json",
        evidence_refs=["release-proof.json", "candidate.json"],
    )

    assert record["outcome"] == "blocked-with-proof"
    assert record["release_proof_gate_status"] == "pass"
    assert (
        record["command_argv_ref"]
        == "docs/plans/repo-map/COMMANDS.json:integration-publication"
    )
    validate_publication_attempt(record)


def test_preflight_records_permission_blocked_with_stable_idempotency():
    first = publication_preflight(
        release_proof=release_proof(),
        target_id="target-prod",
        trusted_context_ref="trusted-ci",
        publish_binding_ref="COMMANDS.json:integration-publication",
        publisher_capability_label="trusted-publisher",
        release_candidate_ref="candidate.json",
        permission_denied=True,
        evidence_refs=["release-proof.json", "candidate.json"],
    )
    second = publication_preflight(
        release_proof=release_proof(),
        target_id="target-prod",
        trusted_context_ref="trusted-ci",
        publish_binding_ref="COMMANDS.json:integration-publication",
        publisher_capability_label="trusted-publisher",
        release_candidate_ref="candidate.json",
        permission_denied=True,
        evidence_refs=["release-proof.json", "candidate.json"],
    )

    assert first["outcome"] == "permission-blocked"
    assert first["release_proof_gate_status"] == "pass"
    assert first["idempotency_key"] == second["idempotency_key"]
    assert first["publication_attempt_id"] == second["publication_attempt_id"]
    validate_publication_attempt(first)


@pytest.mark.parametrize(
    ("kwargs", "error_class"),
    [
        ({"target_id": None}, "unauthorized_target"),
        ({"trusted_context_ref": None}, "trusted_context_unavailable"),
        ({"release_candidate_ref": None}, "missing_artifacts"),
        (
            {"release_proof": release_proof(branch_writable_evidence=True)},
            "branch_writable_evidence",
        ),
        ({"release_proof": release_proof(environment_v2="env-v1")}, "mixed_identity"),
        (
            {"release_proof": release_proof(grader_v2_digest="grader-v1")},
            "mixed_identity",
        ),
    ],
)
def test_preflight_failure_semantics(kwargs, error_class):
    base = {
        "release_proof": release_proof(),
        "target_id": "target-prod",
        "trusted_context_ref": "trusted-ci",
        "publish_binding_ref": None,
        "publisher_capability_label": None,
        "release_candidate_ref": "candidate.json",
        "evidence_refs": ["candidate.json"],
    }
    base.update(kwargs)

    record = publication_preflight(**base)

    assert record["outcome"] == "failed"
    assert record["normalized_error_class"] == error_class
    validate_publication_attempt(record)


def test_published_outcome_requires_stable_environment_ref():
    with pytest.raises(DemoError, match="stable environment"):
        validate_publication_attempt(
            attempt(outcome="published", release_candidate_ref=None)
        )

    with pytest.raises(DemoError, match="passing ReleaseProof"):
        validate_publication_attempt(
            attempt(
                outcome="published",
                release_proof_gate_status=None,
                published_environment_ref="hud-env-version://env-v2",
                trusted_publication_evidence_ref="trusted-publication.json",
                evidence_refs=[
                    "release-proof.json",
                    "candidate.json",
                    "trusted-publication.json",
                ],
            )
        )

    with pytest.raises(DemoError, match="cannot carry an error class"):
        validate_publication_attempt(
            attempt(
                outcome="published",
                published_environment_ref="hud-env-version://env-v2",
                trusted_publication_evidence_ref="trusted-publication.json",
                evidence_refs=[
                    "release-proof.json",
                    "candidate.json",
                    "trusted-publication.json",
                ],
                normalized_error_class="publish_binding_missing",
            )
        )

    validate_publication_attempt(
        attempt(
            outcome="published",
            published_environment_ref="hud-env-version://env-v2",
            trusted_publication_evidence_ref="trusted-publication.json",
            evidence_refs=[
                "release-proof.json",
                "candidate.json",
                "trusted-publication.json",
            ],
            normalized_error_class=None,
        )
    )

    with pytest.raises(DemoError, match="trusted publication evidence"):
        validate_publication_attempt(
            attempt(
                outcome="published",
                published_environment_ref="hud-env-version://env-v2",
                normalized_error_class=None,
            )
        )


def test_publication_attempt_validation_rejects_self_attested_redaction_and_branch_writable_evidence():
    with pytest.raises(DemoError, match="unredacted"):
        validate_publication_attempt(
            attempt(stderr="Authorization: Bearer secret-token")
        )

    with pytest.raises(DemoError, match="branch-writable"):
        validate_publication_attempt(attempt(branch_writable_evidence=True))


def test_publication_attempt_rejects_wrong_command_and_duplicate_evidence_refs():
    with pytest.raises(DemoError, match="integration-publication"):
        validate_publication_attempt(attempt(command_key="demo"))

    with pytest.raises(DemoError, match="unique"):
        validate_publication_attempt(
            attempt(evidence_refs=["release-proof.json", "release-proof.json"])
        )

    with pytest.raises(
        DemoError, match="command_argv_ref must reference integration-publication"
    ):
        validate_publication_attempt(
            attempt(
                outcome="permission-blocked",
                normalized_error_class="publish_unauthorized",
                command_argv_ref="tmp/untrusted_publish.py",
            )
        )

    with pytest.raises(
        DemoError, match="command_argv_ref must reference integration-publication"
    ):
        validate_publication_attempt(
            attempt(command_argv_ref="tmp/untrusted_publish.py")
        )

    with pytest.raises(DemoError, match="trusted_context_ref is not trusted"):
        validate_publication_attempt(
            attempt(trusted_context_ref="artifacts/chronos/demo/branch-owned.json")
        )


def test_publication_attempt_rejects_empty_required_trust_fields():
    for field in (
        "publication_attempt_id",
        "release_proof_id",
        "release_proof_digest",
        "target_id",
        "publisher_capability_label",
        "command_argv_ref",
        "trusted_context_ref",
        "idempotency_key",
    ):
        record = attempt(**{field: " "})
        if field in {"release_proof_digest", "target_id"}:
            record["idempotency_key"] = idempotency_key(
                release_proof_digest=record["release_proof_digest"],
                target_id=record["target_id"],
            )
            record = with_content_digest(
                {k: v for k, v in record.items() if k != "content_digest"}
            )
        with pytest.raises(DemoError, match=f"{field} must be a non-empty string"):
            validate_publication_attempt(record)

    with pytest.raises(DemoError, match="schema_version"):
        validate_publication_attempt(attempt(schema_version="1"))


def test_failed_publication_attempt_cannot_carry_success_refs():
    with pytest.raises(DemoError, match="published environment"):
        validate_publication_attempt(
            attempt(
                outcome="failed",
                normalized_error_class="trusted_context_unavailable",
                published_environment_ref="hud-env-version://env-v2",
            )
        )


def test_proof_backed_outcomes_reject_missing_context_placeholders():
    with pytest.raises(DemoError, match="trusted_context_ref"):
        validate_publication_attempt(
            attempt(trusted_context_ref="missing-trusted-context")
        )

    with pytest.raises(DemoError, match="command_argv_ref"):
        validate_publication_attempt(
            attempt(
                outcome="permission-blocked",
                normalized_error_class="publish_unauthorized",
                command_argv_ref="missing-publish-binding",
            )
        )
