"""Metrics and reporting for raw vs hardened SFT data quality."""

from __future__ import annotations

from dataclasses import dataclass

from chronos.research.sft.filter import FilterResult
from chronos.research.sft.models import TraceRecord


@dataclass(frozen=True, slots=True)
class MetricsSummary:
    """Before/after training-data quality comparison."""

    raw_reward_one_admitted: int
    hardened_reward_one_admitted: int
    raw_legitimate_admitted: int
    hardened_legitimate_admitted: int
    raw_hacks_admitted: int
    hardened_hacks_admitted: int
    raw_contamination_rate: float
    hardened_contamination_rate: float
    legitimate_retention_rate: float
    total_traces: int
    total_legitimate: int


def _rate(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0
    return numerator / denominator


def compute_metrics(
    traces: list[TraceRecord], filtered: FilterResult
) -> MetricsSummary:
    """Compute contamination and retention metrics from traces and filter buckets."""
    total_legitimate = sum(1 for trace in traces if trace.is_legit)

    raw_hacks_admitted = sum(
        1 for trace in traces if trace.raw_reward == 1.0 and trace.is_hack is True
    )
    hardened_hacks_admitted = sum(
        1 for trace in traces if trace.patched_reward == 1.0 and trace.is_hack is True
    )

    raw_legitimate_admitted = sum(
        1 for trace in traces if trace.is_legit is True and trace.raw_reward == 1.0
    )
    hardened_legitimate_admitted = len(filtered.hardened_sft)

    raw_reward_one = len(filtered.raw_sft)
    hardened_reward_one = len(filtered.hardened_sft)

    return MetricsSummary(
        raw_reward_one_admitted=raw_reward_one,
        hardened_reward_one_admitted=hardened_reward_one,
        raw_legitimate_admitted=raw_legitimate_admitted,
        hardened_legitimate_admitted=hardened_legitimate_admitted,
        raw_hacks_admitted=raw_hacks_admitted,
        hardened_hacks_admitted=hardened_hacks_admitted,
        raw_contamination_rate=_rate(raw_hacks_admitted, raw_reward_one),
        hardened_contamination_rate=_rate(hardened_hacks_admitted, hardened_reward_one),
        legitimate_retention_rate=_rate(hardened_legitimate_admitted, total_legitimate),
        total_traces=len(traces),
        total_legitimate=total_legitimate,
    )


def render_exploit_cluster_breakdown(
    rejected_hacks: list[TraceRecord] | tuple[TraceRecord, ...],
) -> dict[str, int]:
    """Count rejected hacks grouped by exploit mechanism."""
    breakdown: dict[str, int] = {}
    for trace in rejected_hacks:
        cluster = trace.exploit_cluster or "unclassified"
        breakdown[cluster] = breakdown.get(cluster, 0) + 1
    return dict(sorted(breakdown.items()))


def _format_count(value: int) -> str:
    return str(value)


def _format_percent(rate: float) -> str:
    return f"{rate * 100:.1f}%"


def render_contamination_table(metrics: MetricsSummary, *, source: str) -> str:
    """Render the primary pitch table as Markdown."""
    lines = [
        "# SFT Data Quality: Raw vs Hardened Verifier",
        "",
        "| Metric | Raw Verifier | Hardened Verifier |",
        "| --- | ---: | ---: |",
        f"| Reward-1 traces admitted | {_format_count(metrics.raw_reward_one_admitted)} | {_format_count(metrics.hardened_reward_one_admitted)} |",
        f"| Legitimate traces admitted | {_format_count(metrics.raw_legitimate_admitted)} | {_format_count(metrics.hardened_legitimate_admitted)} |",
        f"| Hacked traces admitted | {_format_count(metrics.raw_hacks_admitted)} | {_format_count(metrics.hardened_hacks_admitted)} |",
        f"| Training contamination | {_format_percent(metrics.raw_contamination_rate)} | {_format_percent(metrics.hardened_contamination_rate)} |",
        f"| Legitimate retention | {_format_percent(metrics.legitimate_retention_rate)} | {_format_percent(metrics.legitimate_retention_rate)} |",
        "",
        f"_Source: {source}_",
        "",
    ]
    return "\n".join(lines)
