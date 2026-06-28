"""Assemble and validate the Acceptance Demo ``report.json`` (pure).

Takes injected immutable inputs and an injected, normalized branch-batch result
and produces a sealed report dict that passes ``validate_demo_report``. No I/O,
no async, no real systems — the CLI wires the real runner to this builder.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .branch_launch import BranchBatchResult
from .forkpoint_inputs import DemoInputs
from .metrics import build_metrics
from .models import DemoError, with_content_digest
from .report import validate_demo_report
from .steps import build_steps


@dataclass(frozen=True)
class ReportContext:
    """Per-invocation identity for one Acceptance Demo Run."""

    invocation_id: str
    command_argv: list[str]
    commit: str
    started_at: str
    finished_at: str
    live_attempt_id: str


def build_acceptance_report(
    *,
    ctx: ReportContext,
    inputs: DemoInputs,
    batch: BranchBatchResult,
    publication_attempt_ref: str,
    resource_stop_ref: str | None = None,
) -> dict[str, Any]:
    """Build a sealed, validated acceptance ``report.json`` record."""

    if batch.blocked and not resource_stop_ref:
        raise DemoError(
            "acceptance_budget_incomplete",
            "blocked acceptance run requires a resource STOP reference",
        )
    if not batch.blocked and resource_stop_ref:
        raise DemoError(
            "report_overclaim",
            "passing acceptance run cannot carry a resource STOP reference",
        )
    if (
        not isinstance(publication_attempt_ref, str)
        or not publication_attempt_ref.strip()
    ):
        raise DemoError(
            "report_incomplete", "publication_attempt_ref must be a non-empty string"
        )

    proof_source = (
        inputs.release_proof.get("release_proof_id") or inputs.release_proof_digest
    )

    record: dict[str, Any] = {
        "schema_version": 1,
        "invocation_id": ctx.invocation_id,
        "command_argv": list(ctx.command_argv),
        "commit": ctx.commit,
        "started_at": ctx.started_at,
        "finished_at": ctx.finished_at,
        "demo_mode": "acceptance",
        "discovery_source": "live-no-witness",
        "live_attempt_id": ctx.live_attempt_id,
        "proof_source": proof_source,
        "release_proof_ref": inputs.release_proof_ref,
        "publication_attempt_ref": publication_attempt_ref,
        "accepted_branch_budget": batch.requested_branch_count,
        "launched_branch_count": batch.executed_branch_count,
        "metrics": build_metrics(batch=batch, inputs=inputs),
        "claims": [],
    }

    if batch.blocked:
        record["status"] = "blocked"
        record["live_attempt_result"] = "blocked"
        record["resource_stop_ref"] = resource_stop_ref
    else:
        record["status"] = "pass"
        record["live_attempt_result"] = "branches-launched"
        record["live_branch_refs"] = list(batch.branch_refs)

    record["steps"] = build_steps(
        batch=batch,
        inputs=inputs,
        publication_attempt_ref=publication_attempt_ref,
        started_at=ctx.started_at,
        finished_at=ctx.finished_at,
        blocked=batch.blocked,
        resource_stop_ref=resource_stop_ref,
    )

    sealed = with_content_digest(record)
    validate_demo_report(sealed)
    return sealed


__all__ = ["ReportContext", "build_acceptance_report"]
