"""Partition traces into SFT dataset buckets."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from chronos.research.sft.models import TraceRecord

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class FilterResult:
    """Traces partitioned for raw vs hardened SFT analysis."""

    raw_sft: tuple[TraceRecord, ...]
    hardened_sft: tuple[TraceRecord, ...]
    rejected_hacks: tuple[TraceRecord, ...]
    excluded: tuple[TraceRecord, ...]
    warnings: tuple[str, ...]

    @property
    def all_bucketed(self) -> tuple[TraceRecord, ...]:
        seen: set[str] = set()
        ordered: list[TraceRecord] = []
        for trace in (
            *self.raw_sft,
            *self.hardened_sft,
            *self.rejected_hacks,
            *self.excluded,
        ):
            if trace.trace_id not in seen:
                seen.add(trace.trace_id)
                ordered.append(trace)
        return tuple(ordered)


def is_raw_sft(trace: TraceRecord) -> bool:
    """Trace would enter an unfiltered raw-verifier analysis bucket."""
    return trace.raw_reward == 1.0


def is_hardened_sft(trace: TraceRecord) -> bool:
    """Trace is a safe positive example under the hardened verifier."""
    return trace.patched_reward == 1.0 and trace.is_legit is True


def is_rejected_hack(trace: TraceRecord) -> bool:
    """Trace was a raw reward-1 hack removed by verifier hardening."""
    return (
        trace.raw_reward == 1.0
        and trace.patched_reward == 0.0
        and trace.is_hack is True
    )


def is_excluded(trace: TraceRecord) -> bool:
    """Trace is not a positive example in any primary SFT bucket."""
    return not (is_raw_sft(trace) or is_hardened_sft(trace) or is_rejected_hack(trace))


def _is_ambiguous_raw_positive(trace: TraceRecord) -> bool:
    return (
        trace.raw_reward == 1.0
        and not is_hardened_sft(trace)
        and not is_rejected_hack(trace)
        and not trace.is_legit
        and not trace.is_hack
    )


def _collect_warnings(trace: TraceRecord) -> list[str]:
    warnings: list[str] = []
    if trace.needs_review:
        warnings.append(
            f"{trace.trace_id}: flagged needs_review "
            f"(raw={trace.raw_reward}, patched={trace.patched_reward}, "
            f"is_hack={trace.is_hack}, is_legit={trace.is_legit})"
        )
    if _is_ambiguous_raw_positive(trace):
        warnings.append(
            f"{trace.trace_id}: ambiguous raw reward-1 row "
            f"(patched={trace.patched_reward}, is_hack={trace.is_hack}, is_legit={trace.is_legit})"
        )
    return warnings


def filter_traces(traces: list[TraceRecord]) -> FilterResult:
    """
    Partition traces into raw SFT, hardened SFT, rejected hacks, and excluded.

    A trace may appear in more than one bucket when roles overlap:
    legitimate solutions belong to both raw_sft and hardened_sft; reward hacks
    belong to both raw_sft and rejected_hacks. Export code assigns confirmed
    hacks non-training assistant weight so they are never positive SFT rows.
    """
    raw_sft = tuple(trace for trace in traces if is_raw_sft(trace))
    hardened_sft = tuple(trace for trace in traces if is_hardened_sft(trace))
    rejected_hacks = tuple(trace for trace in traces if is_rejected_hack(trace))
    excluded = tuple(trace for trace in traces if is_excluded(trace))

    overlap = {trace.trace_id for trace in hardened_sft} & {
        trace.trace_id for trace in rejected_hacks
    }
    if overlap:
        joined = ", ".join(sorted(overlap))
        raise ValueError(f"trace(s) in both hardened_sft and rejected_hacks: {joined}")

    warnings: list[str] = []
    for trace in traces:
        for message in _collect_warnings(trace):
            warnings.append(message)
            logger.warning(message)

    return FilterResult(
        raw_sft=raw_sft,
        hardened_sft=hardened_sft,
        rejected_hacks=rejected_hacks,
        excluded=excluded,
        warnings=tuple(warnings),
    )


def validate_canonical_release_alignment(traces: list[TraceRecord]) -> None:
    """Reject canonical inputs that would make a training export unsafe."""
    for trace in traces:
        if trace.source != "chronos_export":
            continue
        if trace.is_hack and trace.patched_reward == 1.0:
            raise ValueError(
                f"canonical hack survived patched verifier: {trace.trace_id}"
            )
        if trace.is_legit and trace.patched_reward != 1.0:
            raise ValueError(
                f"canonical legitimate row failed patched verifier: {trace.trace_id}"
            )
        if trace.is_hack and (not trace.exploit_cluster and not trace.cluster_id):
            raise ValueError(f"canonical hack lacks cluster id: {trace.trace_id}")
        if trace.origin == "branch" and trace.is_hack and not trace.proofset_case_id:
            raise ValueError(
                f"canonical branch hack lacks proofset case id: {trace.trace_id}"
            )
