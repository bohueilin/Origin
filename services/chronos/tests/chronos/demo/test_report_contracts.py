from __future__ import annotations

import pytest

from chronos.demo.models import DemoError, with_content_digest
from chronos.demo.report import REQUIRED_METRICS, STEP_LABELS, validate_demo_report


def branch_refs(count: int = 12) -> list[str]:
    return [f"branch-run-{index:03d}.json" for index in range(1, count + 1)]


def step(number: int, *, status: str = "passed", refs: list[str] | None = None):
    return {
        "step_number": number,
        "label": STEP_LABELS[number],
        "status": status,
        "evidence_refs": refs
        or [f"docs/plans/evidence/006/artifacts/step-{number}.json"],
        "observed_behavior": f"observed step {number}",
        "started_at": "2026-06-21T00:00:00Z",
        "finished_at": "2026-06-21T00:00:01Z",
    }


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
    if overrides.get("status") == "pass":
        steps = [step(i) for i in range(1, 14)]
    else:
        steps[11] = step(12, status="failed")
        steps[12] = step(13, status="failed")
    record = {
        "schema_version": 1,
        "invocation_id": "demo-001",
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


def test_acceptance_report_requires_thirteen_evidence_backed_steps():
    validate_demo_report(report())


def test_acceptance_report_requires_full_budget_or_nonpassing_resource_stop():
    with pytest.raises(DemoError, match="full branch budget"):
        validate_demo_report(
            report(accepted_branch_budget="12", launched_branch_count="12")
        )

    validate_demo_report(
        report(
            accepted_branch_budget=None,
            launched_branch_count=None,
            resource_stop_ref="quota-stop.json",
        )
    )

    with pytest.raises(DemoError, match="resource STOP"):
        validate_demo_report(
            report(
                status="pass",
                accepted_branch_budget=None,
                launched_branch_count=None,
                release_proof_ref="release-proof.json",
                publication_attempt_ref="publication-attempt.json",
                resource_stop_ref="quota-stop.json",
            )
        )

    with pytest.raises(DemoError, match="launched live branches"):
        validate_demo_report(
            report(
                status="pass",
                live_attempt_result="blocked",
                release_proof_ref="release-proof.json",
                publication_attempt_ref="publication-attempt.json",
            )
        )


def test_report_rejects_invalid_status_and_live_attempt_result():
    with pytest.raises(DemoError, match="report status"):
        validate_demo_report(report(status="skipped"))

    with pytest.raises(DemoError, match="live_attempt_result"):
        validate_demo_report(report(live_attempt_result="pretend-live"))


def test_report_rejects_empty_required_refs_and_bad_command_argv():
    with pytest.raises(DemoError, match="invocation_id"):
        validate_demo_report(report(invocation_id=""))

    with pytest.raises(DemoError, match="command_argv"):
        validate_demo_report(report(command_argv="chronos-demo acceptance"))


def test_report_rejects_screenshot_only_step_evidence():
    steps = [step(i) for i in range(1, 14)]
    steps[0] = step(1, refs=["screenshots/trace.png"])

    with pytest.raises(DemoError, match="screenshot-only"):
        validate_demo_report(report(steps=steps))


def test_report_rejects_malformed_step_and_branch_refs():
    steps = [step(i) for i in range(1, 14)]
    steps[0] = step(1, refs=[""])

    with pytest.raises(DemoError, match="evidence refs"):
        validate_demo_report(report(steps=steps))

    with pytest.raises(DemoError, match="live_branch_refs"):
        validate_demo_report(report(live_branch_refs=["branch-run-001.json", ""]))

    with pytest.raises(DemoError, match="unique"):
        validate_demo_report(report(live_branch_refs=["branch-run-001.json"] * 12))

    steps[0] = {**step(1), "step_number": "1"}
    with pytest.raises(DemoError, match="step numbers must be integers"):
        validate_demo_report(report(steps=steps))


def test_acceptance_report_rejects_fake_live_branch_claims():
    with pytest.raises(DemoError, match="launched_branch_count"):
        validate_demo_report(report(live_branch_refs=[]))

    with pytest.raises(DemoError, match="launched_branch_count"):
        validate_demo_report(report(live_branch_refs=branch_refs(1)))

    with pytest.raises(DemoError, match="live-new-witness"):
        validate_demo_report(
            report(
                discovery_source="live-new-witness",
                live_attempt_result="branches-launched",
            )
        )

    with pytest.raises(DemoError, match="cannot claim a new Witness"):
        validate_demo_report(
            report(
                discovery_source="live-no-witness", live_attempt_result="new-witness"
            )
        )

    with pytest.raises(DemoError, match="gate-passing live Witness"):
        validate_demo_report(
            report(
                discovery_source="live-new-witness", live_attempt_result="new-witness"
            )
        )

    validate_demo_report(
        report(
            status="pass",
            discovery_source="live-new-witness",
            live_attempt_result="new-witness",
            live_witness_ref="witness-live-001.json",
            live_witness_digest="sha256:live-witness",
            live_witness_gate_status="pass",
            release_proof_ref="release-proof.json",
            publication_attempt_ref="publication-attempt.json",
        )
    )


def test_passing_report_rejects_blocked_release_or_publication_refs():
    with pytest.raises(DemoError, match="passing report cannot use blocked refs"):
        validate_demo_report(report(status="pass"))


def test_passing_report_rejects_failed_steps():
    steps = [step(i) for i in range(1, 14)]
    steps[11] = step(12, status="failed")

    with pytest.raises(DemoError, match="failed steps"):
        validate_demo_report(
            report(
                status="pass",
                release_proof_ref="release-proof.json",
                publication_attempt_ref="publication-attempt.json",
                steps=steps,
            )
        )


def test_blocked_report_rejects_completed_proof_or_publication_steps():
    steps = [step(i) for i in range(1, 14)]
    steps[12] = step(13, status="failed")
    with pytest.raises(DemoError, match="step 12"):
        validate_demo_report(report(steps=steps))

    steps = [step(i) for i in range(1, 14)]
    steps[11] = step(12, status="failed")
    with pytest.raises(DemoError, match="step 13"):
        validate_demo_report(report(steps=steps))


def test_prior_run_fallback_requires_visible_label_and_replay_refs():
    with pytest.raises(DemoError, match="prior-run replay requires"):
        validate_demo_report(report(discovery_source="prior-run-replay"))

    steps = [step(i) for i in range(1, 14)]
    steps[5] = step(6, status="fallback")
    steps[11] = step(12, status="failed")
    steps[12] = step(13, status="failed")
    validate_demo_report(
        report(
            discovery_source="prior-run-replay",
            live_attempt_result="timeout",
            steps=steps,
            prior_run_id="run-001",
            prior_run_witness_ref="wit-001.json",
            prior_run_witness_digest="sha256:wit-001",
            new_replay_ref="replay-001.json",
            resource_stop_ref="timeout-stop.json",
        )
    )

    steps = [step(i) for i in range(1, 14)]
    steps[11] = step(12, status="fallback")
    with pytest.raises(DemoError, match="replay-relevant"):
        validate_demo_report(
            report(
                discovery_source="prior-run-replay",
                live_attempt_result="timeout",
                steps=steps,
                prior_run_id="run-001",
                prior_run_witness_ref="wit-001.json",
                prior_run_witness_digest="sha256:wit-001",
                new_replay_ref="replay-001.json",
                resource_stop_ref="timeout-stop.json",
            )
        )


def test_report_replay_is_audit_only():
    replay = report(
        demo_mode="report-replay",
        source_invocation_id="demo-source",
        accepted_branch_budget=None,
        launched_branch_count=None,
        live_attempt_result="audit-only",
        live_branch_refs=[],
        resource_stop_ref="not-required-for-report-replay",
    )
    validate_demo_report(replay)

    with pytest.raises(DemoError, match="cannot claim new evidence"):
        validate_demo_report(
            report(
                demo_mode="report-replay",
                live_attempt_result="audit-only",
                source_invocation_id="demo-source",
                new_publication_attempt_ref="pub-new.json",
            )
        )

    with pytest.raises(DemoError, match="cannot claim new evidence"):
        validate_demo_report(
            report(
                demo_mode="report-replay",
                live_attempt_result="audit-only",
                source_invocation_id="demo-source",
                new_replay_ref="replay-new.json",
            )
        )

    with pytest.raises(DemoError, match="audit-only"):
        validate_demo_report(
            report(demo_mode="report-replay", source_invocation_id="demo-source")
        )

    with pytest.raises(DemoError, match="cannot claim new evidence"):
        validate_demo_report(
            report(
                demo_mode="report-replay",
                live_attempt_result="audit-only",
                source_invocation_id="demo-source",
                live_branch_refs=["branch-run-new.json"],
                resource_stop_ref="not-required-for-report-replay",
            )
        )


def test_presentation_mode_requires_bounded_live_attempt_before_fallback():
    with pytest.raises(DemoError, match="bounded budget"):
        validate_demo_report(report(demo_mode="presentation"))

    with pytest.raises(DemoError, match="bounded budget"):
        validate_demo_report(
            report(demo_mode="presentation", presentation_budget_seconds="30")
        )

    with pytest.raises(DemoError, match="Prior-Run Witness Replay"):
        validate_demo_report(
            report(
                demo_mode="presentation",
                discovery_source="live-no-witness",
                live_attempt_result="timeout",
                presentation_budget_seconds=30,
            )
        )

    with pytest.raises(DemoError, match="persisted branch refs before fallback"):
        validate_demo_report(
            report(
                demo_mode="presentation",
                discovery_source="prior-run-replay",
                live_attempt_result="timeout",
                presentation_budget_seconds=30,
                fallback_reason="presentation timeout",
                live_branch_refs=[],
                prior_run_id="run-001",
                prior_run_witness_ref="wit-001.json",
                prior_run_witness_digest="sha256:wit-001",
                new_replay_ref="replay-001.json",
            )
        )

    steps = [step(i) for i in range(1, 14)]
    steps[5] = step(6, status="fallback")
    steps[11] = step(12, status="failed")
    steps[12] = step(13, status="failed")
    validate_demo_report(
        report(
            demo_mode="presentation",
            discovery_source="prior-run-replay",
            live_attempt_result="timeout",
            presentation_budget_seconds=30,
            fallback_reason="presentation timeout",
            prior_run_id="run-001",
            prior_run_witness_ref="wit-001.json",
            prior_run_witness_digest="sha256:wit-001",
            new_replay_ref="replay-001.json",
            steps=steps,
        )
    )


def test_metrics_reject_tbd_and_single_run_statistical_overclaims():
    metrics = [
        {"name": name, "not-measured": True, "reason": "not measured"}
        for name in sorted(REQUIRED_METRICS)
    ]
    metrics[0] = {"name": metrics[0]["name"], "value": "TBD", "evidence_ref": "x"}
    with pytest.raises(DemoError, match="TBD"):
        validate_demo_report(report(metrics=metrics))

    with pytest.raises(DemoError, match="single-run"):
        validate_demo_report(report(claims=["success_rate"]))

    with pytest.raises(DemoError, match="single-run"):
        validate_demo_report(report(claims=["cost-savings"]))

    with pytest.raises(DemoError, match="single-run"):
        validate_demo_report(report(claims=["100% success rate"]))

    with pytest.raises(DemoError, match="single-run"):
        validate_demo_report(report(claims=["reliable demo coverage improved"]))

    with pytest.raises(DemoError, match="claims must be"):
        validate_demo_report(report(claims="success_rate"))


def test_metrics_require_core_metric_set():
    with pytest.raises(DemoError, match="missing required metric"):
        validate_demo_report(
            report(
                metrics=[
                    {
                        "name": "branch_count",
                        "value": 12,
                        "evidence_ref": "branch-run-batch.json",
                    }
                ]
            )
        )


def test_metrics_reject_duplicate_names():
    metrics = [
        {"name": name, "not-measured": True, "reason": "not measured"}
        for name in sorted(REQUIRED_METRICS)
    ]
    metrics.append(
        {"name": "branch_count", "value": 12, "evidence_ref": "branch-run-batch.json"}
    )

    with pytest.raises(DemoError, match="duplicated"):
        validate_demo_report(report(metrics=metrics))


def test_metrics_reject_malformed_names_evidence_and_absent_marker():
    metrics = [
        {"name": name, "not-measured": True, "reason": "not measured"}
        for name in sorted(REQUIRED_METRICS)
    ]
    metrics[0] = {"name": 7, "not-measured": True, "reason": "not measured"}
    with pytest.raises(DemoError, match="metric name"):
        validate_demo_report(report(metrics=metrics))

    metrics = [
        {"name": name, "not-measured": True, "reason": "not measured"}
        for name in sorted(REQUIRED_METRICS)
    ]
    metrics[0] = {"name": metrics[0]["name"], "value": 1, "evidence_ref": ["not-a-ref"]}
    with pytest.raises(DemoError, match="evidence_ref"):
        validate_demo_report(report(metrics=metrics))

    metrics = [
        {"name": name, "not-measured": True, "reason": "not measured"}
        for name in sorted(REQUIRED_METRICS)
    ]
    metrics[0] = {
        "name": metrics[0]["name"],
        "not-measured": False,
        "reason": "not measured",
    }
    with pytest.raises(DemoError, match="absent status"):
        validate_demo_report(report(metrics=metrics))
