"""Branch-runner seam and pure normalization for the Acceptance Demo.

The Acceptance Demo launches a real full-budget live branch batch through the
repo-native ``run_live_branch_batch`` seam. To keep the report builder unit
testable without HUD/Modal/network, the runner is injected behind
``BranchRunner`` and its heterogeneous return dict is normalized here into a
single immutable ``BranchBatchResult``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol


class BranchRunner(Protocol):
    """Async launcher matching ``witnesses.branch_runs.run_live_branch_batch``."""

    async def __call__(
        self,
        root: Path,
        forkpoint: dict[str, Any],
        *,
        count: int,
        concurrency: int,
    ) -> dict[str, Any]: ...


@dataclass(frozen=True)
class BranchBatchResult:
    """Normalized view of a live branch batch summary."""

    blocked: bool
    reason: str | None
    credential_presence: dict[str, str]
    executed_branch_count: int
    requested_branch_count: int
    branch_refs: list[str]
    candidate_branch_ids: list[str]
    provenance_status: str
    provenance_blockers: list[str]
    run_id: str | None
    batch_artifact_ref: str | None
    started_at: str | None
    finished_at: str | None
    raw: dict[str, Any] = field(default_factory=dict)


def normalize_batch(summary: dict[str, Any], *, requested: int) -> BranchBatchResult:
    """Interpret a runner summary, blocked-early or full, without I/O.

    A batch counts as launched only when it crossed the execution boundary for
    every requested branch, recorded one persisted ref per branch, and carries
    no provenance blockers. Anything short of that is a blocked outcome.
    """

    executed = summary.get("executed_branch_count")
    branch_refs = summary.get("branch_refs")
    if not isinstance(branch_refs, list):
        branch_refs = []
    branch_refs = [ref for ref in branch_refs if isinstance(ref, str) and ref]
    provenance_blockers = summary.get("provenance_blockers")
    if not isinstance(provenance_blockers, list):
        provenance_blockers = []
    candidate_branch_ids = summary.get("candidate_branch_ids")
    if not isinstance(candidate_branch_ids, list):
        candidate_branch_ids = []

    blocked = (
        not isinstance(executed, int)
        or summary.get("status") == "blocked"
        or executed != requested
        or len(set(branch_refs)) != requested
        or bool(provenance_blockers)
    )
    reason = None
    if blocked:
        reason = str(
            summary.get("observed_behavior")
            or "live branch batch did not launch the full accepted budget"
        )

    return BranchBatchResult(
        blocked=blocked,
        reason=reason,
        credential_presence=summary.get("credential_presence") or {},
        executed_branch_count=executed if isinstance(executed, int) else 0,
        requested_branch_count=requested,
        branch_refs=branch_refs,
        candidate_branch_ids=[str(item) for item in candidate_branch_ids],
        provenance_status=str(
            summary.get("provenance_status")
            or ("incomplete" if blocked else "complete")
        ),
        provenance_blockers=[str(item) for item in provenance_blockers],
        run_id=summary.get("run_id"),
        batch_artifact_ref=summary.get("artifact_ref"),
        started_at=summary.get("started_at"),
        finished_at=summary.get("completed_at") or summary.get("finished_at"),
        raw=summary,
    )


def live_branch_runner() -> BranchRunner:
    """Return the real repo-native branch runner (imported lazily)."""

    from chronos.witnesses.branch_runs import run_live_branch_batch

    return run_live_branch_batch


__all__ = ["BranchRunner", "BranchBatchResult", "normalize_batch", "live_branch_runner"]
