"""Machine-readable demo report validation."""

from __future__ import annotations

import re
from typing import Any

from .models import DemoError, assert_content_digest, require_fields

DEMO_MODES = {"acceptance", "presentation", "report-replay"}
DISCOVERY_SOURCES = {"live-new-witness", "live-no-witness", "prior-run-replay"}
REPORT_STATUSES = {"pass", "blocked", "failed"}
LIVE_ATTEMPT_RESULTS = {
    "new-witness",
    "branches-launched",
    "timeout",
    "blocked",
    "failed",
    "audit-only",
}
STEP_STATUSES = {"passed", "displayed", "fallback", "blocked-with-proof", "failed"}
METRIC_ABSENT_KEYS = {"not-measured", "not-applicable"}
REQUIRED_METRICS = {
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
FORBIDDEN_SINGLE_RUN_CLAIMS = {
    "discovery_probability",
    "success_rate",
    "exploit_coverage",
    "reliability",
    "coverage",
    "avoided_setup",
    "setup_avoidance",
    "cost_savings",
}
FORBIDDEN_CLAIM_PATTERNS = (
    re.compile(r"\bdiscovery\s+probabilit(?:y|ies)\b", re.I),
    re.compile(r"\bsuccess\s+rates?\b", re.I),
    re.compile(r"\breliab(?:le|ility)\b", re.I),
    re.compile(r"\bexploit\s+coverage\b", re.I),
    re.compile(r"\bcoverage\b", re.I),
    re.compile(r"\bsetup\s+(?:avoid(?:ed|ance)|savings?)\b", re.I),
    re.compile(r"\bcost\s+savings?\b", re.I),
)

REQUIRED_REPORT_FIELDS = {
    "schema_version",
    "invocation_id",
    "command_argv",
    "commit",
    "started_at",
    "finished_at",
    "status",
    "demo_mode",
    "discovery_source",
    "live_attempt_id",
    "live_attempt_result",
    "proof_source",
    "steps",
    "metrics",
    "release_proof_ref",
    "publication_attempt_ref",
    "content_digest",
}

STEP_LABELS = {
    1: "Open suspicious HUD trace",
    2: "Show QA verdict and file evidence",
    3: "Show selected ForkPoint",
    4: "Start genuine stochastic branches",
    5: "Show branch ids/traces populating",
    6: "Inspect one exploit and file diff",
    7: "Save Exploit Witness",
    8: "Add it to ProofSet",
    9: "Apply verifier patch",
    10: "Replay Witness against v2",
    11: "Rerun legitimate controls",
    12: "Show ReleaseProof",
    13: "Publish/display hardened version",
}


def validate_demo_report(record: dict[str, Any]) -> None:
    """Validate the Plan 006 report.json semantic contract."""

    require_fields(record, REQUIRED_REPORT_FIELDS, error_class="report_incomplete")
    if record["status"] not in REPORT_STATUSES:
        raise DemoError("report_invalid", "report status is invalid")
    if record["demo_mode"] not in DEMO_MODES:
        raise DemoError("report_invalid", "demo_mode is invalid")
    if record["discovery_source"] not in DISCOVERY_SOURCES:
        raise DemoError("report_invalid", "discovery_source is invalid")
    if record["live_attempt_result"] not in LIVE_ATTEMPT_RESULTS:
        raise DemoError("report_invalid", "live_attempt_result is invalid")
    _validate_top_level_shapes(record)
    _validate_status_consistency(record)
    _validate_mode_source_consistency(record)
    if record["demo_mode"] == "report-replay":
        _validate_report_replay(record)
    if record["demo_mode"] == "presentation":
        _validate_presentation(record)
    if record["demo_mode"] == "acceptance":
        _validate_acceptance(record)
    _validate_steps(record["steps"], record)
    _validate_metrics(record["metrics"])
    _reject_single_run_overclaims(record)
    assert_content_digest(record)


def _validate_steps(steps: list[dict[str, Any]], report: dict[str, Any]) -> None:
    if not isinstance(steps, list):
        raise DemoError("report_invalid", "steps must be a list")
    if len(steps) != 13:
        raise DemoError("report_invalid", "report must contain exactly 13 steps")
    if not all(isinstance(step, dict) for step in steps):
        raise DemoError("step_invalid", "each step must be an object")
    numbers = [step.get("step_number") for step in steps]
    if not all(isinstance(number, int) for number in numbers):
        raise DemoError("report_invalid", "step numbers must be integers")
    if sorted(numbers) != list(range(1, 14)):
        raise DemoError("report_invalid", "step numbers must be exactly 1..13")
    for step in steps:
        require_fields(
            step,
            {
                "step_number",
                "label",
                "status",
                "evidence_refs",
                "observed_behavior",
                "started_at",
                "finished_at",
            },
            error_class="step_incomplete",
        )
        number = step["step_number"]
        if step["label"] != STEP_LABELS[number]:
            raise DemoError(
                "step_invalid", f"step {number} label does not match Plan 006 reference"
            )
        if step["status"] not in STEP_STATUSES:
            raise DemoError("step_invalid", f"step {number} status is invalid")
        if step["status"] != "failed":
            _require_non_screenshot_evidence(step)
        if step["status"] == "blocked-with-proof" and number != 13:
            raise DemoError(
                "step_invalid",
                "blocked-with-proof is only valid for publication step 13",
            )
    if report["discovery_source"] == "prior-run-replay":
        fallback_steps = [s for s in steps if s["status"] == "fallback"]
        required_fallback_refs = {
            "prior_run_id",
            "prior_run_witness_ref",
            "prior_run_witness_digest",
            "new_replay_ref",
        }
        missing = sorted(ref for ref in required_fallback_refs if not report.get(ref))
        if not fallback_steps or missing:
            raise DemoError(
                "fallback_unlabeled",
                "prior-run replay requires fallback step and replay refs",
            )
        if not any(step["step_number"] in {6, 7, 10} for step in fallback_steps):
            raise DemoError(
                "fallback_unlabeled",
                "fallback status must be on replay-relevant demo steps",
            )
    live_branch_refs = report.get("live_branch_refs")
    if (
        report["live_attempt_result"] in {"new-witness", "branches-launched"}
        and not live_branch_refs
    ):
        raise DemoError(
            "fake_live_branch", "live discovery claims require persisted branch refs"
        )
    if live_branch_refs is not None and not _is_string_list(live_branch_refs):
        raise DemoError(
            "fake_live_branch", "live_branch_refs must be non-empty strings"
        )
    if isinstance(live_branch_refs, list) and len(set(live_branch_refs)) != len(
        live_branch_refs
    ):
        raise DemoError(
            "fake_live_branch", "live_branch_refs must be unique persisted branch refs"
        )
    if report["discovery_source"] == "live-new-witness":
        if (
            not report.get("live_witness_ref")
            or not report.get("live_witness_digest")
            or report.get("live_witness_gate_status") != "pass"
        ):
            raise DemoError(
                "fake_live_branch",
                "fresh exploit claims require a gate-passing live Witness",
            )
    _validate_step_status_consistency(steps, report)


def _validate_top_level_shapes(record: dict[str, Any]) -> None:
    for field in (
        "invocation_id",
        "commit",
        "started_at",
        "finished_at",
        "live_attempt_id",
        "proof_source",
        "release_proof_ref",
        "publication_attempt_ref",
    ):
        if not isinstance(record[field], str) or not record[field].strip():
            raise DemoError("report_invalid", f"{field} must be a non-empty string")
    if not _is_nonempty_string_list(record["command_argv"]):
        raise DemoError(
            "report_invalid", "command_argv must be a non-empty string list"
        )


def _validate_mode_source_consistency(record: dict[str, Any]) -> None:
    source = record["discovery_source"]
    result = record["live_attempt_result"]
    if record["demo_mode"] == "report-replay":
        if result != "audit-only":
            raise DemoError(
                "report_replay_overclaim", "report replay must be audit-only"
            )
        return
    if source == "live-new-witness" and result != "new-witness":
        raise DemoError(
            "fake_live_branch", "live-new-witness requires a new-witness live result"
        )
    if source == "live-no-witness" and result not in {
        "branches-launched",
        "timeout",
        "blocked",
        "failed",
    }:
        raise DemoError(
            "fake_live_branch", "live-no-witness cannot claim a new Witness"
        )
    if source == "prior-run-replay" and result not in {"timeout", "blocked", "failed"}:
        raise DemoError(
            "fallback_unlabeled",
            "prior-run replay requires a bounded live attempt result",
        )


def _validate_status_consistency(record: dict[str, Any]) -> None:
    blocked_refs = [
        field
        for field in ("release_proof_ref", "publication_attempt_ref")
        if str(record.get(field, "")).startswith("blocked:")
    ]
    if record["status"] == "pass" and blocked_refs:
        raise DemoError(
            "report_overclaim",
            f"passing report cannot use blocked refs: {blocked_refs}",
        )


def _validate_step_status_consistency(
    steps: list[dict[str, Any]], report: dict[str, Any]
) -> None:
    by_number = {step["step_number"]: step for step in steps}
    failed_steps = [step["step_number"] for step in steps if step["status"] == "failed"]
    if report["status"] == "pass" and failed_steps:
        raise DemoError(
            "report_overclaim",
            f"passing report cannot contain failed steps: {failed_steps}",
        )
    if str(report.get("release_proof_ref", "")).startswith("blocked:") and by_number[
        12
    ]["status"] in {
        "passed",
        "displayed",
        "fallback",
    }:
        raise DemoError(
            "report_overclaim", "blocked ReleaseProof ref cannot mark step 12 complete"
        )
    if str(report.get("publication_attempt_ref", "")).startswith(
        "blocked:"
    ) and by_number[13]["status"] in {
        "passed",
        "displayed",
        "fallback",
    }:
        raise DemoError(
            "report_overclaim", "blocked publication ref cannot mark step 13 complete"
        )


def _require_non_screenshot_evidence(step: dict[str, Any]) -> None:
    refs = step.get("evidence_refs")
    if not isinstance(refs, list) or not refs:
        raise DemoError(
            "step_incomplete", f"step {step['step_number']} lacks evidence refs"
        )
    if not all(isinstance(ref, str) and ref for ref in refs):
        raise DemoError(
            "step_incomplete",
            f"step {step['step_number']} evidence refs must be non-empty strings",
        )
    non_screenshot = [
        ref
        for ref in refs
        if isinstance(ref, str)
        and not ref.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
    ]
    if not non_screenshot:
        raise DemoError(
            "screenshot_only_proof",
            f"step {step['step_number']} has screenshot-only proof",
        )


def _validate_metrics(metrics: list[dict[str, Any]]) -> None:
    if not isinstance(metrics, list):
        raise DemoError("metric_invalid", "metrics must be a list")
    seen = set()
    for metric in metrics:
        if not isinstance(metric, dict):
            raise DemoError("metric_invalid", "each metric must be an object")
        require_fields(metric, {"name"}, error_class="metric_incomplete")
        if not isinstance(metric["name"], str) or not metric["name"].strip():
            raise DemoError("metric_invalid", "metric name must be a non-empty string")
        if metric["name"] in seen:
            raise DemoError("metric_invalid", f"metric {metric['name']} is duplicated")
        seen.add(metric["name"])
        present = "value" in metric
        absent = [key for key in METRIC_ABSENT_KEYS if key in metric]
        if present and absent:
            raise DemoError(
                "metric_invalid",
                f"metric {metric['name']} mixes value and absent status",
            )
        if not present and len(absent) != 1:
            raise DemoError(
                "metric_invalid",
                f"metric {metric['name']} needs value or one absent status",
            )
        if metric.get("value") == "TBD":
            raise DemoError(
                "metric_invalid", f"metric {metric['name']} uses TBD as a result"
            )
        if present and (
            not isinstance(metric.get("evidence_ref"), str)
            or not metric["evidence_ref"]
        ):
            raise DemoError(
                "metric_invalid", f"metric {metric['name']} lacks evidence_ref"
            )
        if absent and metric[absent[0]] is not True:
            raise DemoError(
                "metric_invalid", f"metric {metric['name']} absent status must be true"
            )
        if absent and not metric.get("reason"):
            raise DemoError(
                "metric_invalid",
                f"metric {metric['name']} lacks reason for absent value",
            )
    missing = sorted(REQUIRED_METRICS - seen)
    if missing:
        raise DemoError(
            "metric_incomplete", f"report missing required metric(s): {missing}"
        )


def _validate_report_replay(record: dict[str, Any]) -> None:
    require_fields(
        record, {"source_invocation_id"}, error_class="report_replay_incomplete"
    )
    forbidden = {
        "created_branch_refs",
        "live_branch_refs",
        "new_replay_ref",
        "new_release_proof_ref",
        "new_publication_attempt_ref",
        "published_environment_ref",
    }
    claimed = sorted(key for key in forbidden if record.get(key))
    if claimed:
        raise DemoError(
            "report_replay_overclaim",
            f"report replay cannot claim new evidence: {claimed}",
        )


def _validate_presentation(record: dict[str, Any]) -> None:
    if (
        not isinstance(record.get("presentation_budget_seconds"), int)
        or record["presentation_budget_seconds"] <= 0
    ):
        raise DemoError(
            "presentation_incomplete", "presentation mode needs a bounded budget"
        )
    if not record.get("live_attempt_id"):
        raise DemoError(
            "presentation_incomplete", "presentation mode must launch a live attempt"
        )
    if (
        record["live_attempt_result"] == "timeout"
        and record["discovery_source"] != "prior-run-replay"
    ):
        raise DemoError(
            "fallback_unlabeled",
            "presentation timeout must switch to Prior-Run Witness Replay",
        )
    if record["discovery_source"] == "prior-run-replay" and not record.get(
        "fallback_reason"
    ):
        raise DemoError(
            "fallback_unlabeled", "presentation fallback needs fallback_reason"
        )
    if record["live_attempt_result"] == "timeout" and not record.get(
        "live_branch_refs"
    ):
        raise DemoError(
            "fake_live_branch",
            "presentation timeout needs persisted branch refs before fallback",
        )


def _validate_acceptance(record: dict[str, Any]) -> None:
    budget = record.get("accepted_branch_budget")
    launched = record.get("launched_branch_count")
    if isinstance(budget, int) and budget > 0 and launched == budget:
        if record["status"] == "pass" and record["live_attempt_result"] not in {
            "branches-launched",
            "new-witness",
        }:
            raise DemoError(
                "acceptance_budget_incomplete",
                "passing acceptance requires launched live branches",
            )
        if record["live_attempt_result"] in {"branches-launched", "new-witness"}:
            live_branch_refs = record.get("live_branch_refs")
            if (
                not isinstance(live_branch_refs, list)
                or len(live_branch_refs) != launched
            ):
                raise DemoError(
                    "fake_live_branch",
                    "acceptance launched_branch_count must match persisted live_branch_refs",
                )
        if record["live_attempt_result"] in {
            "blocked",
            "failed",
            "timeout",
        } and not record.get("resource_stop_ref"):
            raise DemoError(
                "acceptance_budget_incomplete",
                "blocked acceptance attempt needs STOP evidence",
            )
        return
    if record.get("resource_stop_ref"):
        if record["status"] == "pass":
            raise DemoError(
                "acceptance_budget_incomplete",
                "passing acceptance report cannot use resource STOP",
            )
        return
    raise DemoError(
        "acceptance_budget_incomplete",
        "acceptance needs full branch budget or resource STOP evidence",
    )


def _reject_single_run_overclaims(record: dict[str, Any]) -> None:
    raw_claims = record.get("claims") or []
    if not isinstance(raw_claims, list) or not all(
        isinstance(claim, str) and claim for claim in raw_claims
    ):
        raise DemoError(
            "statistical_overclaim", "claims must be a list of non-empty strings"
        )
    claims = {_normalize_claim(claim) for claim in raw_claims}
    forbidden = sorted(claims & FORBIDDEN_SINGLE_RUN_CLAIMS)
    if forbidden:
        raise DemoError(
            "statistical_overclaim", f"single-run report cannot claim {forbidden}"
        )
    phrase_forbidden = [
        claim
        for claim in raw_claims
        if any(pattern.search(claim) for pattern in FORBIDDEN_CLAIM_PATTERNS)
    ]
    if phrase_forbidden:
        raise DemoError(
            "statistical_overclaim",
            f"single-run report cannot claim {phrase_forbidden}",
        )


def _is_nonempty_string_list(value: Any) -> bool:
    return (
        isinstance(value, list)
        and bool(value)
        and all(isinstance(item, str) and item for item in value)
    )


def _is_string_list(value: Any) -> bool:
    return isinstance(value, list) and all(
        isinstance(item, str) and item for item in value
    )


def _normalize_claim(value: str) -> str:
    return value.strip().lower().replace("-", "_").replace(" ", "_")
