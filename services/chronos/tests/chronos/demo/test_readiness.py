from __future__ import annotations

import pytest

from chronos.demo.models import DemoError, with_content_digest
from chronos.demo.readiness import REQUIRED_CHECKS, validate_readiness_pack


def check(name: str, *, status: str = "pass", reason: str | None = None):
    record = {
        "name": name,
        "status": status,
        "evidence_refs": [f"artifacts/chronos/demo/readiness/{name}.json"],
    }
    if reason:
        record["reason"] = reason
    return record


def readiness_pack(**overrides):
    checks = []
    for name in sorted(REQUIRED_CHECKS):
        if name in {
            "release_proof",
            "release_candidate",
            "publication_attempt_or_expected_block",
        }:
            checks.append(
                check(
                    name,
                    status="expected-block",
                    reason="Plan 005/Gate 4 or publish binding is incomplete",
                )
            )
        else:
            checks.append(check(name))
    record = {
        "schema_version": 1,
        "readiness_pack_id": "ready-001",
        "created_at": "2026-06-21T00:00:00Z",
        "mode": "presentation",
        "status": "blocked",
        "checks": checks,
        "artifact_refs": {
            "source_trace_ref": "trace://source",
            "forkpoint_ref": "forkpoint.json",
            "prior_witness_ref": "witness.json",
            "replay_entrypoint_ref": "replay.py",
            "proofset_ref": "proofset.json",
            "release_proof_ref": "blocked:plan-005",
            "release_candidate_ref": "blocked:plan-005",
            "metrics_report_ref": "metrics.json",
            "publication_attempt_or_block_ref": "blocked:publish-binding",
        },
        "redaction_status": "redacted",
    }
    record.update(overrides)
    return with_content_digest(record)


def test_readiness_pack_allows_evidence_backed_expected_blocks():
    validate_readiness_pack(readiness_pack())


def test_readiness_pack_rejects_passing_pack_with_expected_blocks():
    with pytest.raises(DemoError, match="passing readiness"):
        validate_readiness_pack(readiness_pack(status="pass"))


def test_readiness_pack_rejects_passing_pack_with_not_applicable_checks():
    checks = [check(name) for name in sorted(REQUIRED_CHECKS)]
    checks[0] = check(
        checks[0]["name"], status="not-applicable", reason="not used in this dry run"
    )

    with pytest.raises(DemoError, match="passing readiness"):
        validate_readiness_pack(readiness_pack(status="pass", checks=checks))


def test_readiness_pack_rejects_passing_pack_with_placeholder_artifacts():
    checks = [check(name) for name in sorted(REQUIRED_CHECKS)]
    refs = dict(readiness_pack()["artifact_refs"])
    refs["release_proof_ref"] = "blocked:plan-005"

    with pytest.raises(DemoError, match="placeholder artifact ref"):
        validate_readiness_pack(
            readiness_pack(status="pass", checks=checks, artifact_refs=refs)
        )


def test_readiness_pack_rejects_missing_checks_and_artifact_refs():
    missing_check = readiness_pack(checks=[check("hud_auth")])
    with pytest.raises(DemoError, match="missing checks"):
        validate_readiness_pack(missing_check)

    refs = dict(readiness_pack()["artifact_refs"])
    refs.pop("release_proof_ref")
    with pytest.raises(DemoError, match="missing artifact refs"):
        validate_readiness_pack(readiness_pack(artifact_refs=refs))


def test_readiness_pack_rejects_duplicate_check_names():
    checks = [check(name) for name in sorted(REQUIRED_CHECKS)]
    checks.append(check("hud_auth"))

    with pytest.raises(DemoError, match="duplicated"):
        validate_readiness_pack(readiness_pack(status="pass", checks=checks))


def test_readiness_pack_rejects_secret_like_content():
    with pytest.raises(DemoError, match="unredacted"):
        validate_readiness_pack(readiness_pack(notes="Authorization: Bearer abc123"))

    refs = dict(readiness_pack()["artifact_refs"])
    refs["source_trace_ref"] = "https://example.test/trace?token=abc123"
    with pytest.raises(DemoError, match="unredacted|token-bearing"):
        validate_readiness_pack(readiness_pack(artifact_refs=refs))
