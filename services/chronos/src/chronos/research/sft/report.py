"""Write Phase 2 analysis artifacts to disk."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from chronos.research.sft.filter import FilterResult
from chronos.research.sft.metrics import (
    MetricsSummary,
    compute_metrics,
    render_contamination_table,
    render_exploit_cluster_breakdown,
)
from chronos.research.sft.models import TraceRecord


def render_contamination_chart_svg(metrics: MetricsSummary) -> str:
    """Render a simple bar chart comparing hacked traces admitted."""
    max_count = max(metrics.raw_hacks_admitted, metrics.hardened_hacks_admitted, 1)
    chart_height = 180
    raw_scaled = max(0, int(chart_height * metrics.raw_hacks_admitted / max_count))
    hardened_scaled = max(
        0, int(chart_height * metrics.hardened_hacks_admitted / max_count)
    )
    if metrics.raw_hacks_admitted and raw_scaled < 24:
        raw_scaled = 24
    if metrics.hardened_hacks_admitted and hardened_scaled < 24:
        hardened_scaled = 24

    raw_y = 220 - raw_scaled
    hardened_y = 220 - hardened_scaled

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="480" height="280" viewBox="0 0 480 280" role="img" aria-label="Reward hacks admitted under raw versus hardened verifier">
  <rect width="480" height="280" fill="#F4F6FA"/>
  <text x="240" y="28" text-anchor="middle" font-family="Inter, sans-serif" font-size="16" font-weight="600" fill="#10141B">Reward Hacks Admitted Before SFT</text>
  <line x1="60" y1="220" x2="420" y2="220" stroke="#DCE2EC" stroke-width="2"/>
  <rect x="130" y="{raw_y}" width="80" height="{raw_scaled}" rx="8" fill="#A85B12"/>
  <rect x="270" y="{hardened_y}" width="80" height="{hardened_scaled}" rx="8" fill="#1C8A57"/>
  <text x="170" y="{raw_y - 10}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="14" fill="#10141B">{metrics.raw_hacks_admitted}</text>
  <text x="310" y="{hardened_y - 10}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="14" fill="#10141B">{metrics.hardened_hacks_admitted}</text>
  <text x="170" y="245" text-anchor="middle" font-family="Inter, sans-serif" font-size="13" fill="#434C5A">Raw Verifier</text>
  <text x="310" y="245" text-anchor="middle" font-family="Inter, sans-serif" font-size="13" fill="#434C5A">Hardened Verifier</text>
</svg>
"""


def render_writeup(
    metrics: MetricsSummary, clusters: dict[str, int], *, source: str
) -> str:
    """Render a short narrative write-up for slides or submission."""
    cluster_lines = "\n".join(
        f"- **{name}:** {count}" for name, count in clusters.items()
    )
    return f"""# SFT Extension Write-up

## Problem

Raw reward-1 trajectories include reward hacks. If those trajectories become positive
supervised training examples, a model may learn exploit behavior instead of real
task-solving.

## Method

Load Chronos trace exports, partition them into raw SFT, hardened SFT, and rejected
hack buckets, then compare verifier outcomes before and after hardening.

## Result

| Metric | Raw | Hardened |
| --- | ---: | ---: |
| Reward-1 traces admitted | {metrics.raw_reward_one_admitted} | {metrics.hardened_reward_one_admitted} |
| Legitimate traces admitted | {metrics.raw_legitimate_admitted} | {metrics.hardened_legitimate_admitted} |
| Hacked traces admitted | {metrics.raw_hacks_admitted} | {metrics.hardened_hacks_admitted} |
| Training contamination | {metrics.raw_contamination_rate * 100:.1f}% | {metrics.hardened_contamination_rate * 100:.1f}% |
| Legitimate retention | {metrics.legitimate_retention_rate * 100:.1f}% | {metrics.legitimate_retention_rate * 100:.1f}% |

Rejected hack clusters:

{cluster_lines}

## Implication

Verifier hardening protects both benchmark reliability and training data quality.
Chronos removes poisoned reward-1 successes before they enter an SFT or RFT pipeline.

## Fireworks path

The hardened SFT bucket is the dataset that should feed a Fireworks managed SFT job.
The raw bucket remains as a deliberate contrast showing what an unfiltered pipeline
would have trained on.

_Source: {source}_
"""


def write_phase2_report(
    output_dir: str | Path,
    traces: list[TraceRecord],
    filtered: FilterResult,
    *,
    source_label: str,
) -> MetricsSummary:
    """Write contamination table, cluster breakdown, chart, and write-up."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    metrics = compute_metrics(traces, filtered)
    clusters = render_exploit_cluster_breakdown(filtered.rejected_hacks)

    (out / "contamination_table.md").write_text(
        render_contamination_table(metrics, source=source_label),
        encoding="utf-8",
    )
    (out / "exploit_clusters.json").write_text(
        json.dumps(clusters, indent=2) + "\n",
        encoding="utf-8",
    )
    (out / "contamination_chart.svg").write_text(
        render_contamination_chart_svg(metrics),
        encoding="utf-8",
    )
    (out / "WRITEUP.md").write_text(
        render_writeup(metrics, clusters, source=source_label),
        encoding="utf-8",
    )
    (out / "metrics.json").write_text(
        json.dumps(
            {
                "source": source_label,
                "generated_at": datetime.now(UTC).isoformat(),
                "raw_reward_one_admitted": metrics.raw_reward_one_admitted,
                "hardened_reward_one_admitted": metrics.hardened_reward_one_admitted,
                "raw_legitimate_admitted": metrics.raw_legitimate_admitted,
                "hardened_legitimate_admitted": metrics.hardened_legitimate_admitted,
                "raw_hacks_admitted": metrics.raw_hacks_admitted,
                "hardened_hacks_admitted": metrics.hardened_hacks_admitted,
                "raw_contamination_rate": metrics.raw_contamination_rate,
                "hardened_contamination_rate": metrics.hardened_contamination_rate,
                "legitimate_retention_rate": metrics.legitimate_retention_rate,
                "total_traces": metrics.total_traces,
                "total_legitimate": metrics.total_legitimate,
                "exploit_clusters": clusters,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return metrics
