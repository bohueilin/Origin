"""Behavior tests for the Plan 006 Acceptance Demo Run.

These exercise the pure report/metric/step builders and the normalization seam
with injected fixtures and an injected fake branch runner. They never mock the
unit under test, and they never launch real HUD/Modal/network work.
"""

from __future__ import annotations

import json
import shutil

import pytest

from chronos.demo.branch_launch import BranchBatchResult, normalize_batch
from chronos.demo.forkpoint_inputs import ROOT, DemoInputs, load_demo_inputs
from chronos.demo.metrics import build_metrics
from chronos.demo.models import DemoError
from chronos.demo.orchestration import (
    _build_publication_attempt,
    record_published_publication,
    run_acceptance_demo,
)
from chronos.demo.publication import publication_preflight, validate_publication_attempt
from chronos.demo.readiness import validate_readiness_pack
from chronos.demo.report import validate_demo_report
from chronos.demo.report_builder import ReportContext, build_acceptance_report

PRIOR_RUN = "run-20260621T075711"


def make_inputs(**overrides) -> DemoInputs:
    base = dict(
        forkpoint_record={"snapshot_id": "im-x", "hud_trace_id": "trace-x"},
        forkpoint_ref="docs/plans/evidence/002/artifacts/forkpoint-record.json",
        enriched_forkpoint={"snapshot_id": "im-x", "hud_task_profile": {}},
        source_trace_id="trace-x",
        source_trace_ref="docs/plans/evidence/002/artifacts/trace-boundary-summary.json",
        qa_verdict_ref=f"docs/plans/evidence/003/artifacts/branch-runs/{PRIOR_RUN}/qa/{PRIOR_RUN}-branch-08.json",
        file_diff_ref=f"docs/plans/evidence/003/artifacts/branch-runs/{PRIOR_RUN}/file-diffs/{PRIOR_RUN}-branch-08.json",
        prior_branch_ref=f"docs/plans/evidence/003/artifacts/branch-runs/{PRIOR_RUN}/branches/{PRIOR_RUN}-branch-08.json",
        prior_batch_ref=f"docs/plans/evidence/003/artifacts/branch-runs/{PRIOR_RUN}/branch-run-batch.json",
        prior_run_id=PRIOR_RUN,
        prior_witness={
            "content_digest": "d" * 64,
            "cluster_id": "cluster-001",
            "reward": 1.0,
        },
        prior_witness_ref=f"docs/plans/evidence/003/artifacts/sealed/witnesses/wit-{PRIOR_RUN}-branch-08.json",
        prior_witness_digest="d" * 64,
        prior_witness_cluster_id="cluster-001",
        prior_witness_reward=1.0,
        replay_entrypoint_ref="chronos.witnesses.sealing.seal_witness",
        proofset_ref="artifacts/chronos/releases/release-results/proofset-e497370b2c3d2a69.json",
        patch_ref="artifacts/chronos/releases/harden-runs/proofset-e497370b2c3d2a69.json",
        controls_baseline_ref="artifacts/chronos/controls/baseline_runs.json",
        controls_preserved=3,
        controls_total=3,
        v2_replay_ref="artifacts/chronos/releases/release-results/releasecandidate-294df1726b8a5ed0/traces/wit.json",
        v2_replay_reward=0.0,
        release_proof={
            "release_proof_id": "releaseproof-30e03914472631dd",
            "gate_status": "pass",
        },
        release_proof_ref="artifacts/chronos/releases/release-proofs/releaseproof-30e03914472631dd.json",
        release_proof_digest="b" * 64,
        release_candidate_ref="artifacts/chronos/releases/candidates/releasecandidate-294df1726b8a5ed0.json",
        target_id="mongodb-sales-aggregation-engine:c2ee704d5c4e653e",
    )
    base.update(overrides)
    return DemoInputs(**base)


def make_batch(
    *, blocked=False, executed=12, refs=12, requested=12, reason=None
) -> BranchBatchResult:
    branch_refs = [
        f"artifacts/chronos/demo/demo-x/branch-runs/run-x/branches/run-x-branch-{i:02d}.json"
        for i in range(refs)
    ]
    return BranchBatchResult(
        blocked=blocked,
        reason=reason,
        credential_presence={"HUD_API_KEY": "present"},
        executed_branch_count=executed,
        requested_branch_count=requested,
        branch_refs=branch_refs,
        candidate_branch_ids=[],
        provenance_status="complete",
        provenance_blockers=[],
        run_id="run-x",
        batch_artifact_ref="artifacts/chronos/demo/demo-x/branch-runs/run-x/branch-run-batch.json",
        started_at="2026-06-21T08:00:00Z",
        finished_at="2026-06-21T08:10:00Z",
    )


def make_ctx() -> ReportContext:
    return ReportContext(
        invocation_id="demo-20260621T080000Z-abc1234",
        command_argv=[
            "uv",
            "run",
            "python",
            "-m",
            "chronos.demo.cli",
            "acceptance-demo",
        ],
        commit="abc1234",
        started_at="2026-06-21T08:00:00Z",
        finished_at="2026-06-21T08:10:00Z",
        live_attempt_id="run-x",
    )


PUB_REF = "artifacts/chronos/demo/demo-x/publication-attempt.json"


def test_full_budget_pass_report_validates():
    report = build_acceptance_report(
        ctx=make_ctx(),
        inputs=make_inputs(),
        batch=make_batch(),
        publication_attempt_ref=PUB_REF,
    )
    assert report["status"] == "pass"
    assert report["discovery_source"] == "live-no-witness"
    assert report["live_attempt_result"] == "branches-launched"
    assert report["launched_branch_count"] == 12
    assert len(report["live_branch_refs"]) == 12
    assert len(set(report["live_branch_refs"])) == 12
    assert len(report["steps"]) == 13
    assert report["steps"][12]["status"] == "blocked-with-proof"
    # Idempotent re-validation must pass.
    validate_demo_report(report)


def test_builder_rejects_fewer_refs_than_launched_count():
    # An execution claim of 12 with only 11 persisted refs is a fake-live overclaim.
    batch = make_batch(executed=12, refs=11)
    with pytest.raises(DemoError) as exc:
        build_acceptance_report(
            ctx=make_ctx(),
            inputs=make_inputs(),
            batch=batch,
            publication_attempt_ref=PUB_REF,
        )
    assert exc.value.error_class == "fake_live_branch"


def test_builder_never_relabels_prior_run_refs_as_fresh_live():
    report = build_acceptance_report(
        ctx=make_ctx(),
        inputs=make_inputs(),
        batch=make_batch(),
        publication_attempt_ref=PUB_REF,
    )
    assert all(PRIOR_RUN not in ref for ref in report["live_branch_refs"])
    by_number = {step["step_number"]: step for step in report["steps"]}
    for number in (6, 7, 10):
        assert by_number[number]["status"] == "fallback"
    # The prior Witness ref appears only in fallback evidence, never as a fresh live branch.
    assert any(
        make_inputs().prior_witness_ref in step["evidence_refs"]
        for step in report["steps"]
    )


def test_blocked_batch_requires_resource_stop():
    batch = make_batch(blocked=True, executed=0, reason="creds absent")
    with pytest.raises(DemoError) as exc:
        build_acceptance_report(
            ctx=make_ctx(),
            inputs=make_inputs(),
            batch=batch,
            publication_attempt_ref=PUB_REF,
        )
    assert exc.value.error_class == "acceptance_budget_incomplete"
    report = build_acceptance_report(
        ctx=make_ctx(),
        inputs=make_inputs(),
        batch=batch,
        publication_attempt_ref=PUB_REF,
        resource_stop_ref="artifacts/chronos/demo/demo-x/resource-stop.json",
    )
    assert report["status"] == "blocked"
    assert report["live_attempt_result"] == "blocked"
    validate_demo_report(report)


def test_pass_batch_rejects_resource_stop():
    with pytest.raises(DemoError) as exc:
        build_acceptance_report(
            ctx=make_ctx(),
            inputs=make_inputs(),
            batch=make_batch(),
            publication_attempt_ref=PUB_REF,
            resource_stop_ref="artifacts/chronos/demo/demo-x/resource-stop.json",
        )
    assert exc.value.error_class == "report_overclaim"


def test_normalize_blocked_early_shape():
    batch = normalize_batch(
        {"status": "blocked", "observed_behavior": "creds absent"}, requested=12
    )
    assert batch.blocked is True
    assert batch.executed_branch_count == 0
    assert batch.branch_refs == []
    assert batch.reason == "creds absent"


def test_normalize_full_summary_shape():
    refs = [f"a/branches/branch-{i:02d}.json" for i in range(12)]
    batch = normalize_batch(
        {
            "status": "pass",
            "run_id": "run-x",
            "executed_branch_count": 12,
            "branch_refs": refs,
            "provenance_blockers": [],
            "artifact_ref": "a/branch-run-batch.json",
            "candidate_branch_ids": ["run-x-branch-08"],
        },
        requested=12,
    )
    assert batch.blocked is False
    assert len(batch.branch_refs) == 12
    assert batch.candidate_branch_ids == ["run-x-branch-08"]


def test_normalize_treats_count_mismatch_as_blocked():
    refs = [f"a/branches/branch-{i:02d}.json" for i in range(11)]
    batch = normalize_batch(
        {"executed_branch_count": 12, "branch_refs": refs}, requested=12
    )
    assert batch.blocked is True


def test_normalize_treats_provenance_blockers_as_blocked():
    refs = [f"a/branches/branch-{i:02d}.json" for i in range(12)]
    batch = normalize_batch(
        {
            "executed_branch_count": 12,
            "branch_refs": refs,
            "provenance_blockers": ["missing_replay_surface"],
        },
        requested=12,
    )
    assert batch.blocked is True


def test_metrics_are_measured_or_honestly_absent():
    metrics = build_metrics(batch=make_batch(), inputs=make_inputs())
    names = {m["name"] for m in metrics}
    assert names == {
        "branch_count",
        "clusters",
        "time_to_witness",
        "reward_before",
        "reward_after",
        "control_retention",
        "replay_rate",
        "restore_latency",
        "setup_avoided",
    }
    by_name = {m["name"]: m for m in metrics}
    assert by_name["branch_count"]["value"] == 12
    assert by_name["reward_after"]["value"] == 0.0
    assert by_name["replay_rate"]["not-applicable"] is True
    assert by_name["time_to_witness"]["not-measured"] is True
    assert all(m.get("value") != "TBD" for m in metrics)
    # control_retention is preserved/total, so it can show a regression, not always N/N.
    assert by_name["control_retention"]["value"] == "3/3"


def test_control_retention_can_show_a_regression():
    metrics = build_metrics(
        batch=make_batch(), inputs=make_inputs(controls_preserved=2, controls_total=3)
    )
    value = {m["name"]: m for m in metrics}["control_retention"]["value"]
    assert value == "2/3"


def test_publication_blocked_with_proof_uses_real_proof():
    inputs = load_demo_inputs()
    attempt = _build_publication_attempt(inputs)
    assert attempt["outcome"] == "blocked-with-proof"
    assert attempt["normalized_error_class"] == "publish_binding_missing"
    assert attempt["release_proof_gate_status"] == "pass"
    assert attempt["command_argv_ref"].endswith("COMMANDS.json:integration-publication")
    assert not attempt["release_candidate_ref"].startswith(
        ("/tmp/", "artifacts/chronos/demo/")
    )
    validate_publication_attempt(attempt)


def _prepared_attempt(inputs):
    return publication_preflight(
        release_proof=inputs.release_proof,
        target_id=inputs.target_id,
        trusted_context_ref="docs/plans/repo-map/COMMANDS.json:integration-publication",
        publish_binding_ref="docs/plans/repo-map/COMMANDS.json:integration-publication",
        publisher_capability_label="hud-environment-deploy",
        release_candidate_ref=inputs.release_candidate_ref,
        deferred_deploy_command_ref="docs/plans/repo-map/COMMANDS.json:hud-deploy",
        deferred_reason="maintainer deferred the registry upload; binding and verified v2 ready",
        evidence_refs=[
            "docs/plans/evidence/005/MANIFEST.json",
            inputs.release_proof_ref,
            inputs.release_candidate_ref,
        ],
    )


def test_prepared_outcome_validates_with_real_proof_and_binding():
    inputs = load_demo_inputs()
    attempt = _prepared_attempt(inputs)
    assert attempt["outcome"] == "prepared"
    assert not attempt.get("normalized_error_class")
    assert attempt["release_proof_gate_status"] == "pass"
    assert attempt["deferred_deploy_command_ref"].endswith("COMMANDS.json:hud-deploy")
    assert "published_environment_ref" not in attempt
    validate_publication_attempt(attempt)


def test_prepared_falls_back_to_failed_without_deferred_intent():
    # Binding present but no deferred command/reason: not a prepared claim.
    inputs = load_demo_inputs()
    attempt = publication_preflight(
        release_proof=inputs.release_proof,
        target_id=inputs.target_id,
        trusted_context_ref="docs/plans/repo-map/COMMANDS.json:integration-publication",
        publish_binding_ref="docs/plans/repo-map/COMMANDS.json:integration-publication",
        publisher_capability_label="hud-environment-deploy",
        release_candidate_ref=inputs.release_candidate_ref,
        evidence_refs=[inputs.release_proof_ref],
    )
    assert attempt["outcome"] == "failed"


def test_prepared_rejects_untrusted_deploy_command_ref():
    from chronos.demo.models import with_content_digest

    inputs = load_demo_inputs()
    attempt = dict(_prepared_attempt(inputs))
    attempt["deferred_deploy_command_ref"] = (
        "artifacts/chronos/demo/publish/hud-deploy.json"
    )
    with pytest.raises(DemoError) as exc:
        validate_publication_attempt(with_content_digest(attempt))
    assert "deferred_deploy_command_ref" in str(exc.value)


def test_prepared_rejects_published_environment_ref():
    from chronos.demo.models import with_content_digest

    inputs = load_demo_inputs()
    attempt = dict(_prepared_attempt(inputs))
    attempt["published_environment_ref"] = (
        "hud-registry:mongodb-sales-aggregation-engine@v3"
    )
    with pytest.raises(DemoError) as exc:
        validate_publication_attempt(with_content_digest(attempt))
    assert "published environment ref" in str(exc.value)


def test_published_attempt_validates_from_real_deploy_receipt():
    import json

    exit_code, ref = record_published_publication(ROOT)
    assert exit_code == 0
    attempt = json.loads((ROOT / ref).read_text())
    assert attempt["outcome"] == "published"
    assert attempt["published_environment_ref"].startswith("hud:registry/")
    assert attempt["release_proof_gate_status"] == "pass"
    assert not attempt.get("normalized_error_class")
    assert attempt["trusted_publication_evidence_ref"] in attempt["evidence_refs"]
    validate_publication_attempt(attempt)


def test_published_rejects_untrusted_publication_evidence_ref():
    import json

    from chronos.demo.models import with_content_digest

    _, ref = record_published_publication(ROOT)
    attempt = dict(json.loads((ROOT / ref).read_text()))
    attempt["trusted_publication_evidence_ref"] = (
        "artifacts/chronos/demo/publish/hud-target.json"
    )
    with pytest.raises(DemoError):
        validate_publication_attempt(with_content_digest(attempt))


def test_publication_rejects_untrusted_candidate_ref():
    inputs = load_demo_inputs()
    attempt = publication_preflight(
        release_proof=inputs.release_proof,
        target_id=inputs.target_id,
        trusted_context_ref="docs/plans/repo-map/COMMANDS.json:integration-publication",
        publish_binding_ref=None,
        publisher_capability_label=None,
        release_candidate_ref="artifacts/chronos/demo/demo-x/candidate.json",
        evidence_refs=[
            "docs/plans/evidence/005/MANIFEST.json",
            inputs.release_proof_ref,
        ],
    )
    with pytest.raises(DemoError) as exc:
        validate_publication_attempt(attempt)
    assert "trusted release_candidate_ref" in str(exc.value)


def test_orchestration_pass_writes_validating_artifacts():
    fake_src = ROOT / "artifacts/chronos/demo/_test_src/run-fake"

    async def fake_runner(root, forkpoint, *, count, concurrency):
        refs = []
        for i in range(count):
            path = fake_src / "branches" / f"run-fake-branch-{i:02d}.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(
                json.dumps({"branch_id": f"run-fake-branch-{i:02d}", "seed": 7300 + i})
            )
            refs.append(
                f"artifacts/chronos/demo/_test_src/run-fake/branches/run-fake-branch-{i:02d}.json"
            )
        summary = {
            "schema_version": 1,
            "status": "pass",
            "run_id": "run-fake",
            "executed_branch_count": count,
            "branch_refs": refs,
            "provenance_blockers": [],
            "provenance_status": "complete",
            "candidate_branch_ids": [],
            "started_at": "2026-06-21T08:00:00Z",
            "completed_at": "2026-06-21T08:10:00Z",
            "credential_presence": {"HUD_API_KEY": "present"},
        }
        (fake_src / "branch-run-batch.json").write_text(json.dumps(summary))
        return {
            **summary,
            "artifact_ref": "artifacts/chronos/demo/_test_src/run-fake/branch-run-batch.json",
        }

    outcome = run_acceptance_demo(
        ROOT, runner=fake_runner, now="2026-06-21T11:11:11Z", commit="ptest", count=12
    )
    invocation_dir = ROOT / "artifacts/chronos/demo" / outcome.invocation_id
    try:
        assert outcome.exit_code == 0
        report = json.loads((invocation_dir / "report.json").read_text())
        validate_demo_report(report)
        validate_publication_attempt(
            json.loads((invocation_dir / "publication-attempt.json").read_text())
        )
        validate_readiness_pack(
            json.loads((invocation_dir / "readiness-pack.json").read_text())
        )
        assert all(
            ref.startswith(f"artifacts/chronos/demo/{outcome.invocation_id}/")
            for ref in report["live_branch_refs"]
        )
    finally:
        shutil.rmtree(ROOT / "artifacts/chronos/demo/_test_src", ignore_errors=True)
        shutil.rmtree(invocation_dir, ignore_errors=True)


def test_orchestration_blocked_exits_two_with_resource_stop():
    async def blocked_runner(root, forkpoint, *, count, concurrency):
        return {
            "status": "blocked",
            "credential_presence": {"HUD_API_KEY": "absent"},
            "observed_behavior": "creds absent",
        }

    outcome = run_acceptance_demo(
        ROOT,
        runner=blocked_runner,
        now="2026-06-21T12:12:12Z",
        commit="btest",
        count=12,
    )
    invocation_dir = ROOT / "artifacts/chronos/demo" / outcome.invocation_id
    try:
        assert outcome.exit_code == 2
        assert outcome.resource_stop_ref is not None
        assert outcome.readiness_pack_ref is None
        report = json.loads((invocation_dir / "report.json").read_text())
        validate_demo_report(report)
        assert report["status"] == "blocked"
        assert (invocation_dir / "resource-stop.json").is_file()
    finally:
        shutil.rmtree(invocation_dir, ignore_errors=True)
