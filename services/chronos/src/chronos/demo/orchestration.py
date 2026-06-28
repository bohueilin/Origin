"""Acceptance Demo Run orchestration: wiring, live launch, and artifacts.

This is the only stateful/async layer. It loads immutable inputs, launches the
real full-budget live branch batch through the injected runner, persists the
fresh branch run under Plan 006 ownership, and writes the validated report,
publication attempt, and readiness pack. The pure builders decide the report
contract; this layer decides exit codes and durable evidence.
"""

from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from chronos.releases.models import utc_now

from .branch_launch import (
    BranchBatchResult,
    BranchRunner,
    live_branch_runner,
    normalize_batch,
)
from .forkpoint_inputs import ROOT, DemoInputs, load_demo_inputs
from .models import DemoError, with_content_digest
from .publication import (
    idempotency_key,
    publication_preflight,
    validate_publication_attempt,
)
from .readiness import validate_readiness_pack
from .redaction import redact_record
from .report_builder import ReportContext, build_acceptance_report

DEMO_ARTIFACT_DIR = Path("artifacts/chronos/demo")
PLAN_005_MANIFEST_REF = "docs/plans/evidence/005/MANIFEST.json"
TRUSTED_PUBLICATION_CONTEXT_REF = (
    "docs/plans/repo-map/COMMANDS.json:integration-publication"
)
COMMAND_ARGV = ["uv", "run", "python", "-m", "chronos.demo.cli", "acceptance-demo"]
PRIOR_BRANCH_RUN_PREFIX = "docs/plans/evidence/003/artifacts/branch-runs"

REQUIRED_READINESS_CHECKS = (
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
)


@dataclass(frozen=True)
class DemoOutcome:
    """Result of one Acceptance Demo Run invocation."""

    exit_code: int
    invocation_id: str
    report_ref: str | None
    publication_attempt_ref: str | None
    readiness_pack_ref: str | None
    resource_stop_ref: str | None
    observed_behavior: str


def _git_short_head(root: Path) -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=root,
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return "unknown"
    return result.stdout.strip() or "unknown"


def _compact_stamp(now: str) -> str:
    return now.replace("-", "").replace(":", "")


def _write_sealed(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def _relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def _build_publication_attempt(inputs: DemoInputs) -> dict[str, Any]:
    attempt = publication_preflight(
        release_proof=inputs.release_proof,
        target_id=inputs.target_id,
        trusted_context_ref=TRUSTED_PUBLICATION_CONTEXT_REF,
        publish_binding_ref=None,
        publisher_capability_label=None,
        release_candidate_ref=inputs.release_candidate_ref,
        evidence_refs=[
            PLAN_005_MANIFEST_REF,
            inputs.release_proof_ref,
            inputs.release_candidate_ref,
        ],
    )
    validate_publication_attempt(attempt)
    if attempt["outcome"] != "blocked-with-proof":
        raise DemoError(
            "publication_attempt_invalid",
            f"acceptance publication preflight resolved to {attempt['outcome']} instead of blocked-with-proof",
        )
    return attempt


PUBLISH_DIR = Path("artifacts/chronos/demo/publish")
PUBLISHER_CAPABILITY_LABEL = "hud-environment-deploy"
DEPLOY_COMMAND_REF = "docs/plans/repo-map/COMMANDS.json:hud-deploy"
PUBLISH_TARGET_REF = "artifacts/chronos/demo/publish/hud-target.json"
V2_VERIFICATION_REF = "artifacts/chronos/demo/publish/v2-grader-verification.json"
V2_KILL_PROOF_REF = "artifacts/chronos/demo/publish/v2-runtime-kill-proof.json"
V2_DEPLOY_PROOF_REF = "artifacts/chronos/demo/publish/v2-deploy-proof.json"
PUBLISH_RECEIPT_REF = "docs/plans/evidence/006/publish-receipt.json"
DEFERRED_PUBLISH_REASON = (
    "Ready to publish; the actual registry upload awaits an explicit go-ahead. The bound HUD deploy primitive, "
    "the authorized 'mongodb-sales-aggregation-engine' registry target, and the hardened v2 are all verified: the "
    "v2 grader digest matches the sealed ReleaseProof, AND the runtime kill is proven in real mongo:7.0 containers "
    "(witness exploit reward 0.0, all three controls reward 1.0; artifacts/chronos/demo/publish/v2-runtime-kill-proof.json)."
)


def prepare_publication(root: Path = ROOT) -> tuple[int, str]:
    """Build and persist a validated ``prepared`` PublicationAttempt (no upload)."""

    inputs = load_demo_inputs()
    attempt = publication_preflight(
        release_proof=inputs.release_proof,
        target_id=inputs.target_id,
        trusted_context_ref=TRUSTED_PUBLICATION_CONTEXT_REF,
        publish_binding_ref=TRUSTED_PUBLICATION_CONTEXT_REF,
        publisher_capability_label=PUBLISHER_CAPABILITY_LABEL,
        release_candidate_ref=inputs.release_candidate_ref,
        deferred_deploy_command_ref=DEPLOY_COMMAND_REF,
        deferred_reason=DEFERRED_PUBLISH_REASON,
        published_target_ref=PUBLISH_TARGET_REF,
        evidence_refs=[
            PLAN_005_MANIFEST_REF,
            inputs.release_proof_ref,
            inputs.release_candidate_ref,
            V2_VERIFICATION_REF,
            V2_KILL_PROOF_REF,
            PUBLISH_TARGET_REF,
        ],
    )
    validate_publication_attempt(attempt)
    if attempt["outcome"] != "prepared":
        raise DemoError(
            "publication_attempt_invalid",
            f"expected prepared, resolved to {attempt['outcome']}",
        )
    path = root / PUBLISH_DIR / "publication-prepared-attempt.json"
    _write_sealed(path, attempt)
    return 0, _relative(path)


def record_published_publication(root: Path = ROOT) -> tuple[int, str]:
    """Build and persist a validated ``published`` PublicationAttempt from the deploy receipt."""

    inputs = load_demo_inputs()
    receipt = json.loads((root / PUBLISH_RECEIPT_REF).read_text(encoding="utf-8"))
    published_environment_ref = receipt.get("published_environment_ref")
    if not published_environment_ref:
        raise DemoError(
            "publication_attempt_invalid",
            "publish receipt lacks published_environment_ref",
        )
    # Bind the published record to the proven target + the demo's own inputs, so a
    # 'published' attempt cannot claim an environment unrelated to the sealed ReleaseProof.
    if receipt.get("outcome") != "published":
        raise DemoError(
            "publication_attempt_invalid", "publish receipt outcome is not 'published'"
        )
    if receipt.get("registry_env_name") != inputs.target_id.split(":", 1)[0]:
        raise DemoError(
            "publication_attempt_invalid",
            "publish receipt registry env name does not match the proven target",
        )
    for field in ("release_proof_ref", "release_candidate_ref"):
        if receipt.get(field) not in (None, getattr(inputs, field)):
            raise DemoError(
                "publication_attempt_invalid",
                f"publish receipt {field} does not match the demo inputs",
            )
    base = {
        "schema_version": 1,
        "release_proof_id": inputs.release_proof.get("release_proof_id"),
        "release_proof_digest": inputs.release_proof_digest,
        "target_id": inputs.target_id,
        "publisher_capability_label": PUBLISHER_CAPABILITY_LABEL,
        "command_key": "integration-publication",
        "command_argv_ref": TRUSTED_PUBLICATION_CONTEXT_REF,
        "trusted_context_ref": TRUSTED_PUBLICATION_CONTEXT_REF,
        "outcome": "published",
        "release_proof_gate_status": inputs.release_proof.get("gate_status"),
        "release_candidate_ref": inputs.release_candidate_ref,
        "published_environment_ref": published_environment_ref,
        "trusted_publication_evidence_ref": PUBLISH_RECEIPT_REF,
        "evidence_refs": [
            PLAN_005_MANIFEST_REF,
            inputs.release_proof_ref,
            inputs.release_candidate_ref,
            PUBLISH_RECEIPT_REF,
            V2_DEPLOY_PROOF_REF,
        ],
        "redaction_status": "redacted",
        "created_at": utc_now(),
    }
    base["idempotency_key"] = idempotency_key(
        release_proof_digest=base["release_proof_digest"], target_id=base["target_id"]
    )
    base["publication_attempt_id"] = "pubattempt-" + base["idempotency_key"][:16]
    attempt = with_content_digest(base)
    validate_publication_attempt(attempt)
    if attempt["outcome"] != "published":
        raise DemoError(
            "publication_attempt_invalid",
            f"expected published, resolved to {attempt['outcome']}",
        )
    path = root / PUBLISH_DIR / "publication-published-attempt.json"
    _write_sealed(path, attempt)
    return 0, _relative(path)


def _persist_owned_branch_run(
    invocation_dir: Path, summary: dict[str, Any]
) -> dict[str, Any]:
    """Copy a fresh run into the invocation dir and rewrite refs to owned paths."""

    run_id = summary.get("run_id")
    artifact_ref = summary.get("artifact_ref")
    if not run_id or not isinstance(artifact_ref, str):
        return summary
    source_dir = ROOT / Path(artifact_ref).parent
    if not source_dir.is_dir():
        return summary
    dest_dir = invocation_dir / "branch-runs" / str(run_id)
    shutil.copytree(source_dir, dest_dir, dirs_exist_ok=True)
    src_prefix = Path(artifact_ref).parent.as_posix()
    dst_prefix = _relative(dest_dir)

    def rewrite(value: Any) -> Any:
        if isinstance(value, str):
            on_boundary = value == src_prefix or value.startswith(src_prefix + "/")
            return value.replace(src_prefix, dst_prefix, 1) if on_boundary else value
        if isinstance(value, list):
            return [rewrite(item) for item in value]
        return value

    rewritten = dict(summary)
    for key in ("artifact_ref", "branch_refs", "qa_refs", "feedback_branch_refs"):
        if key in rewritten:
            rewritten[key] = rewrite(rewritten[key])
    return rewritten


def _build_resource_stop(
    invocation_id: str,
    *,
    batch: BranchBatchResult,
    now: str,
) -> dict[str, Any]:
    blocker_class = "credentials_absent"
    presence = batch.credential_presence or {}
    if presence and all(value == "present" for value in presence.values()):
        blocker_class = "branch_launch_blocked"
    elif not presence:
        blocker_class = "live_launch_unavailable"
    if batch.provenance_blockers:
        blocker_class = "branch_provenance_incomplete"
    if 0 < batch.executed_branch_count < batch.requested_branch_count:
        blocker_class = "partial_branch_launch"
    record = {
        "schema_version": 1,
        "resource_stop_id": f"resource-stop-{invocation_id}",
        "invocation_id": invocation_id,
        "blocker_class": blocker_class,
        "requested_branch_count": batch.requested_branch_count,
        "launched_branch_count": batch.executed_branch_count,
        "auth_presence": presence,
        "provenance_blockers": batch.provenance_blockers,
        "observed_behavior": batch.reason
        or "live branch batch did not launch the full accepted budget",
        "created_at": now,
    }
    return with_content_digest(redact_record(record))


def _build_readiness_pack(
    *,
    invocation_id: str,
    inputs: DemoInputs,
    batch: BranchBatchResult,
    report_ref: str,
    publication_attempt_ref: str,
    now: str,
) -> dict[str, Any]:
    live_ref = batch.batch_artifact_ref or report_ref
    evidence = {
        "hud_auth": [live_ref],
        "modal_auth": [live_ref],
        "model_gateway_auth": [live_ref],
        "network_reachability": [live_ref],
        "quota_headroom": [live_ref],
        "source_trace": [inputs.source_trace_ref, inputs.forkpoint_ref],
        "forkpoint": [inputs.forkpoint_ref],
        "prior_witness": [inputs.prior_witness_ref],
        "replay_entrypoint": [inputs.prior_witness_ref],
        "proofset": [inputs.proofset_ref],
        "release_proof": [inputs.release_proof_ref],
        "release_candidate": [inputs.release_candidate_ref],
        "publication_attempt_or_expected_block": [publication_attempt_ref],
        "local_artifact_paths": [report_ref],
    }
    checks = [
        {"name": name, "status": "pass", "evidence_refs": evidence[name]}
        for name in REQUIRED_READINESS_CHECKS
    ]
    record = {
        "schema_version": 1,
        "readiness_pack_id": f"readiness-{invocation_id}",
        "created_at": now,
        "mode": "acceptance",
        "status": "pass",
        "checks": checks,
        "artifact_refs": {
            "source_trace_ref": inputs.source_trace_ref,
            "forkpoint_ref": inputs.forkpoint_ref,
            "prior_witness_ref": inputs.prior_witness_ref,
            "replay_entrypoint_ref": inputs.replay_entrypoint_ref,
            "proofset_ref": inputs.proofset_ref,
            "release_proof_ref": inputs.release_proof_ref,
            "release_candidate_ref": inputs.release_candidate_ref,
            "metrics_report_ref": report_ref,
            "publication_attempt_or_block_ref": publication_attempt_ref,
        },
        "redaction_status": "redacted",
    }
    sealed = with_content_digest(record)
    validate_readiness_pack(sealed)
    return sealed


def run_acceptance_demo(
    root: Path = ROOT,
    *,
    runner: BranchRunner | None = None,
    now: str | None = None,
    commit: str | None = None,
    count: int = 12,
    concurrency: int = 12,
) -> DemoOutcome:
    """Run one Acceptance Demo Run and return its outcome and exit code."""

    started_at = now or utc_now()
    commit = commit or _git_short_head(root)
    invocation_id = f"demo-{_compact_stamp(started_at)}-{commit}"
    invocation_dir = root / DEMO_ARTIFACT_DIR / invocation_id

    inputs = load_demo_inputs()
    attempt = _build_publication_attempt(inputs)
    publication_path = invocation_dir / "publication-attempt.json"
    _write_sealed(publication_path, attempt)
    publication_attempt_ref = _relative(publication_path)

    active_runner = runner or live_branch_runner()
    try:
        summary = asyncio.run(
            active_runner(
                root, inputs.enriched_forkpoint, count=count, concurrency=concurrency
            )
        )
    except Exception as exc:  # noqa: BLE001 - the acceptance demo records provider failures honestly.
        summary = {
            "status": "blocked",
            "observed_behavior": redact_record(
                f"live branch batch raised {type(exc).__name__}: {exc}"
            ),
        }

    summary = _persist_owned_branch_run(invocation_dir, summary)
    batch = normalize_batch(summary, requested=count)
    finished_at = utc_now()
    ctx = ReportContext(
        invocation_id=invocation_id,
        command_argv=COMMAND_ARGV,
        commit=commit,
        started_at=started_at,
        finished_at=finished_at,
        live_attempt_id=batch.run_id or f"live-blocked-{invocation_id}",
    )

    resource_stop_ref: str | None = None
    if batch.blocked:
        stop_record = _build_resource_stop(invocation_id, batch=batch, now=finished_at)
        stop_path = invocation_dir / "resource-stop.json"
        _write_sealed(stop_path, stop_record)
        resource_stop_ref = _relative(stop_path)

    report = build_acceptance_report(
        ctx=ctx,
        inputs=inputs,
        batch=batch,
        publication_attempt_ref=publication_attempt_ref,
        resource_stop_ref=resource_stop_ref,
    )
    report_path = invocation_dir / "report.json"
    _write_sealed(report_path, report)
    report_ref = _relative(report_path)

    if batch.blocked:
        return DemoOutcome(
            exit_code=2,
            invocation_id=invocation_id,
            report_ref=report_ref,
            publication_attempt_ref=publication_attempt_ref,
            readiness_pack_ref=None,
            resource_stop_ref=resource_stop_ref,
            observed_behavior=(
                f"Acceptance Demo blocked: {batch.reason}. Wrote a resource STOP and a blocked report; "
                "no completion claimed."
            ),
        )

    readiness = _build_readiness_pack(
        invocation_id=invocation_id,
        inputs=inputs,
        batch=batch,
        report_ref=report_ref,
        publication_attempt_ref=publication_attempt_ref,
        now=finished_at,
    )
    readiness_path = invocation_dir / "readiness-pack.json"
    _write_sealed(readiness_path, readiness)
    readiness_pack_ref = _relative(readiness_path)

    return DemoOutcome(
        exit_code=0,
        invocation_id=invocation_id,
        report_ref=report_ref,
        publication_attempt_ref=publication_attempt_ref,
        readiness_pack_ref=readiness_pack_ref,
        resource_stop_ref=None,
        observed_behavior=(
            f"Acceptance Demo Run launched {batch.executed_branch_count} live BranchRuns, wrote a validating "
            "13-step report, readiness pack, and blocked-with-proof publication attempt."
        ),
    )


__all__ = ["DemoOutcome", "run_acceptance_demo"]
