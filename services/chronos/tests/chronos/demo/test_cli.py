from __future__ import annotations

import json

import chronos.demo.cli as demo_cli
from chronos.demo.cli import (
    demo_preflight,
    publication_preflight_command,
    report_replay,
    validate_publication,
    validate_readiness,
    validate_report,
)
from chronos.demo.models import with_content_digest
from chronos.demo.publication import idempotency_key
from chronos.demo.readiness import REQUIRED_CHECKS
from chronos.demo.report import REQUIRED_METRICS, STEP_LABELS
from chronos.releases.models import digest_json


def step(number: int, *, status: str = "passed", refs: list[str] | None = None):
    return {
        "step_number": number,
        "label": STEP_LABELS[number],
        "status": status,
        "evidence_refs": refs or [f"artifact-{number}.json"],
        "observed_behavior": f"step {number}",
        "started_at": "2026-06-21T00:00:00Z",
        "finished_at": "2026-06-21T00:00:01Z",
    }


def branch_refs(count: int = 12) -> list[str]:
    return [f"branch-run-{index:03d}.json" for index in range(1, count + 1)]


def report(**overrides):
    metrics = [
        {"name": "branch_count", "value": 12, "evidence_ref": "branch-run-batch.json"}
    ]
    metrics.extend(
        {
            "name": name,
            "not-measured": True,
            "reason": "Not measured before full Acceptance Demo Run evidence exists",
        }
        for name in sorted(REQUIRED_METRICS - {"branch_count"})
    )
    steps = [step(i) for i in range(1, 14)]
    steps[11] = step(12, status="failed")
    steps[12] = step(13, status="failed")
    record = {
        "schema_version": 1,
        "invocation_id": "demo-cli-source",
        "command_argv": ["chronos-demo", "acceptance"],
        "commit": "abc123",
        "started_at": "2026-06-21T00:00:00Z",
        "finished_at": "2026-06-21T00:02:00Z",
        "status": "blocked",
        "demo_mode": "acceptance",
        "discovery_source": "live-no-witness",
        "live_attempt_id": "live-001",
        "live_attempt_result": "branches-launched",
        "live_branch_refs": branch_refs(),
        "proof_source": "release-proof-pending",
        "steps": steps,
        "metrics": metrics,
        "release_proof_ref": "blocked:plan-005",
        "publication_attempt_ref": "blocked:publish-binding",
        "accepted_branch_budget": 12,
        "launched_branch_count": 12,
        "claims": [],
    }
    record.update(overrides)
    return with_content_digest(record)


def publication_attempt(**overrides):
    key = idempotency_key(release_proof_digest="rp-digest", target_id="target-prod")
    record = {
        "schema_version": 1,
        "publication_attempt_id": "pub-001",
        "release_proof_id": "rp-001",
        "release_proof_digest": "rp-digest",
        "target_id": "target-prod",
        "publisher_capability_label": "trusted-publisher",
        "command_key": "integration-publication",
        "command_argv_ref": "COMMANDS.json:integration-publication",
        "trusted_context_ref": "trusted-ci",
        "idempotency_key": key,
        "outcome": "permission-blocked",
        "release_proof_gate_status": "pass",
        "release_candidate_ref": "candidate.json",
        "normalized_error_class": "publish_unauthorized",
        "evidence_refs": ["release-proof.json", "candidate.json"],
        "redaction_status": "redacted",
        "created_at": "2026-06-21T00:00:00Z",
    }
    record.update(overrides)
    return with_content_digest(record)


def release_proof(**overrides):
    record = {
        "schema_version": 1,
        "release_proof_id": "rp-cli-001",
        "proof_set_id": "proof-set-cli",
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


def readiness_check(name, *, status="pass", reason=None):
    record = {
        "name": name,
        "status": status,
        "evidence_refs": [f"readiness/{name}.json"],
    }
    if reason:
        record["reason"] = reason
    return record


def readiness_pack(**overrides):
    checks = [
        readiness_check(
            name,
            status="expected-block"
            if name == "publication_attempt_or_expected_block"
            else "pass",
            reason="Publish binding is not available before Plan 005 completes"
            if name == "publication_attempt_or_expected_block"
            else None,
        )
        for name in sorted(REQUIRED_CHECKS)
    ]
    record = {
        "schema_version": 1,
        "readiness_pack_id": "ready-cli-001",
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


def write_json(path, record):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_demo_preflight_uses_merged_plan_005_artifacts_without_dependency_blocker(
    monkeypatch, tmp_path
):
    manifest = tmp_path / "docs/plans/evidence/005/MANIFEST.json"
    proof_dir = tmp_path / "artifacts/chronos/releases/release-proofs"
    candidate_dir = tmp_path / "artifacts/chronos/releases/candidates"
    interfaces = tmp_path / "docs/plans/repo-map/INTERFACES.md"
    candidate = candidate_dir / "releasecandidate-294df1726b8a5ed0.json"
    proof_path = proof_dir / "releaseproof-30e03914472631dd.json"
    write_json(
        manifest,
        {
            "schema_version": 1,
            "status": "complete",
            "artifacts": [
                {
                    "ref": "artifacts/chronos/releases/release-proofs/releaseproof-30e03914472631dd.json"
                },
                {
                    "ref": "artifacts/chronos/releases/candidates/releasecandidate-294df1726b8a5ed0.json"
                },
            ],
        },
    )
    write_json(
        candidate,
        {
            "schema_version": 1,
            "release_candidate_id": "releasecandidate-294df1726b8a5ed0",
            "environment_v2": "env-v2",
            "grader_v2_digest": "grader-v2",
        },
    )
    write_json(
        proof_path,
        release_proof(
            release_candidate_ref="/stale/plan-005/worktree/releasecandidate-294df1726b8a5ed0.json"
        ),
    )
    interfaces.parent.mkdir(parents=True, exist_ok=True)
    interfaces.write_text(
        "HUD environment version publish/compare | Not present\n", encoding="utf-8"
    )
    monkeypatch.setattr(demo_cli, "ROOT", tmp_path)

    assert demo_preflight() == 2

    blocker = read_json(
        tmp_path / "artifacts/chronos/demo/preflight-blockers/plan-006-demo.json"
    )
    blocker_types = {item["type"] for item in blocker["blockers"]}
    assert "DEPENDENCY_GATE" not in blocker_types
    assert "PUBLISH_BINDING" in blocker_types
    assert (
        blocker["release_proof_ref"]
        == "artifacts/chronos/releases/release-proofs/releaseproof-30e03914472631dd.json"
    )
    assert (
        blocker["release_candidate_ref"]
        == "artifacts/chronos/releases/candidates/releasecandidate-294df1726b8a5ed0.json"
    )

    publication = read_json(
        tmp_path
        / "artifacts/chronos/demo/preflight-blockers/plan-006-publication-attempt.json"
    )
    assert publication["outcome"] == "blocked-with-proof"
    assert publication["target_id"] == "env-v2"
    assert (
        publication["trusted_context_ref"]
        == "docs/plans/repo-map/COMMANDS.json:integration-publication"
    )
    assert publication["normalized_error_class"] == "publish_binding_missing"
    assert publication["release_proof_gate_status"] == "pass"


def test_validate_report_cli_writes_pass_artifact(tmp_path):
    source = tmp_path / "report.json"
    output = tmp_path / "validation.json"
    write_json(source, report())

    assert validate_report(report=source, output=output) == 0

    result = read_json(output)
    assert result["status"] == "pass"
    assert result["source_invocation_id"] == "demo-cli-source"
    assert result["content_digest"]


def test_validate_report_cli_writes_failure_artifact(tmp_path):
    source = tmp_path / "report.json"
    output = tmp_path / "validation.json"
    metrics = [
        {"name": name, "not-measured": True, "reason": "not measured"}
        for name in sorted(REQUIRED_METRICS)
    ]
    metrics[0] = {
        "name": metrics[0]["name"],
        "value": "TBD",
        "evidence_ref": "metrics.json",
    }
    bad = report(metrics=metrics)
    write_json(source, bad)

    assert validate_report(report=source, output=output) == 2

    result = read_json(output)
    assert result["status"] == "failed"
    assert result["error_class"] == "metric_invalid"


def test_validate_report_cli_writes_failure_artifact_for_malformed_json(tmp_path):
    source = tmp_path / "report.json"
    output = tmp_path / "validation.json"
    source.write_text("{not-json", encoding="utf-8")

    assert validate_report(report=source, output=output) == 2

    result = read_json(output)
    assert result["status"] == "failed"
    assert result["error_class"] == "input_invalid"


def test_validate_report_cli_writes_failure_artifact_for_non_object_json(tmp_path):
    source = tmp_path / "report.json"
    output = tmp_path / "validation.json"
    write_json(source, ["not", "an", "object"])

    assert validate_report(report=source, output=output) == 2

    result = read_json(output)
    assert result["status"] == "failed"
    assert result["error_class"] == "input_invalid"


def test_validate_report_cli_redacts_failure_output(capsys, tmp_path):
    source = tmp_path / "report-token=abc123.json"
    output = tmp_path / "validation.json"

    assert validate_report(report=source, output=output) == 2

    captured = capsys.readouterr()
    result = read_json(output)
    assert "token=abc123" not in captured.out
    assert "token=abc123" not in result["observed_behavior"]
    assert "token=<redacted>" in captured.out
    assert "token=<redacted>" in result["observed_behavior"]


def test_report_replay_cli_is_audit_only(tmp_path):
    source = tmp_path / "report.json"
    output = tmp_path / "replay-validation.json"
    write_json(source, report())

    assert report_replay(source_report=source, output=output) == 0

    result = read_json(output)
    assert result["status"] == "pass"
    assert result["replay_type"] == "demo-report-replay"
    assert result["source_invocation_id"] == "demo-cli-source"
    assert result["created_branch_refs"] == []
    assert result["new_replay_ref"] is None
    assert result["new_release_proof_ref"] is None
    assert result["new_publication_attempt_ref"] is None
    assert result["published_environment_ref"] is None


def test_validate_publication_attempt_cli_writes_pass_artifact(tmp_path):
    source = tmp_path / "publication-attempt.json"
    output = tmp_path / "publication-validation.json"
    write_json(source, publication_attempt())

    assert validate_publication(attempt=source, output=output) == 0

    result = read_json(output)
    assert result["status"] == "pass"
    assert result["publication_attempt_id"] == "pub-001"
    assert result["outcome"] == "permission-blocked"
    assert result["content_digest"]


def test_validate_publication_attempt_cli_writes_failure_artifact(tmp_path):
    source = tmp_path / "publication-attempt.json"
    output = tmp_path / "publication-validation.json"
    write_json(source, publication_attempt(redaction_status="unsafe"))

    assert validate_publication(attempt=source, output=output) == 2

    result = read_json(output)
    assert result["status"] == "failed"
    assert result["error_class"] == "secret_exposure"


def test_publication_preflight_cli_writes_blocked_with_proof_attempt(tmp_path):
    proof_path = tmp_path / "release-proof.json"
    output = tmp_path / "publication-attempt.json"
    write_json(proof_path, release_proof())

    assert (
        publication_preflight_command(
            release_proof=proof_path,
            target_id="target-prod",
            trusted_context_ref="trusted-ci",
            publish_binding_ref=None,
            publisher_capability_label=None,
            release_candidate_ref="candidate.json",
            permission_denied=False,
            evidence_refs=["release-proof.json", "candidate.json"],
            output=output,
        )
        == 0
    )

    result = read_json(output)
    assert result["outcome"] == "blocked-with-proof"
    assert result["normalized_error_class"] == "publish_binding_missing"
    assert result["release_proof_gate_status"] == "pass"
    assert result["content_digest"]


def test_publication_preflight_cli_writes_failure_artifact_for_bad_proof(tmp_path):
    proof_path = tmp_path / "release-proof.json"
    output = tmp_path / "publication-attempt.json"
    write_json(proof_path, {"release_proof_id": "incomplete"})

    assert (
        publication_preflight_command(
            release_proof=proof_path,
            target_id="target-prod",
            trusted_context_ref="trusted-ci",
            publish_binding_ref=None,
            publisher_capability_label=None,
            release_candidate_ref="candidate.json",
            permission_denied=False,
            evidence_refs=["release-proof.json", "candidate.json"],
            output=output,
        )
        == 2
    )

    result = read_json(output)
    assert result["outcome"] == "failed"
    assert result["normalized_error_class"] == "proof_mismatch"
    assert result["content_digest"]


def test_validate_readiness_pack_cli_writes_pass_artifact(tmp_path):
    source = tmp_path / "readiness.json"
    output = tmp_path / "readiness-validation.json"
    write_json(source, readiness_pack())

    assert validate_readiness(pack=source, output=output) == 0

    result = read_json(output)
    assert result["status"] == "pass"
    assert result["readiness_pack_id"] == "ready-cli-001"
    assert result["readiness_status"] == "blocked"
    assert result["content_digest"]


def test_validate_readiness_pack_cli_writes_failure_artifact(tmp_path):
    source = tmp_path / "readiness.json"
    output = tmp_path / "readiness-validation.json"
    write_json(source, readiness_pack(redaction_status="unsafe"))

    assert validate_readiness(pack=source, output=output) == 2

    result = read_json(output)
    assert result["status"] == "failed"
    assert result["error_class"] == "secret_exposure"
