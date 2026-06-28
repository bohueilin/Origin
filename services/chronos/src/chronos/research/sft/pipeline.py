"""End-to-end SFT analysis and export pipeline."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from chronos.research.sft.export import (
    export_metadata,
    export_rejected_hacks_audit,
    export_sft_jsonl,
)
from chronos.research.sft.filter import FilterResult, filter_traces
from chronos.research.sft.loader import infer_source, load_traces
from chronos.research.sft.metrics import MetricsSummary
from chronos.research.sft.models import TraceRecord, TraceSource
from chronos.research.sft.report import write_phase2_report
from chronos.research.sft.training_recommendations import (
    export_training_recommendations,
)


@dataclass(frozen=True, slots=True)
class PipelineResult:
    """Outputs from a full load → filter → report → export run."""

    input_path: Path
    output_dir: Path
    traces: tuple[TraceRecord, ...]
    filtered: FilterResult
    metrics: MetricsSummary
    raw_sft_examples: int
    hardened_sft_examples: int
    rejected_hack_records: int


def run_sft_pipeline(
    input_path: str | Path,
    output_dir: str | Path,
    *,
    source: TraceSource | None = None,
    source_label: str | None = None,
) -> PipelineResult:
    """Load traces, filter buckets, write Phase 2 report, and export SFT JSONL."""
    resolved_input = Path(input_path)
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    traces = load_traces(resolved_input, source=source)
    filtered = filter_traces(traces)
    label = source_label or resolved_input.name
    metrics = write_phase2_report(out, traces, filtered, source_label=label)

    raw_sft_path = out / "raw_verifier_sft.jsonl"
    hardened_sft_path = out / "hardened_verifier_sft.jsonl"
    raw_metadata_path = out / "raw_verifier_sft.metadata.jsonl"
    hardened_metadata_path = out / "hardened_verifier_sft.metadata.jsonl"
    rejected_audit_path = out / "rejected_hacks_audit.jsonl"

    raw_count = export_sft_jsonl(
        filtered.raw_sft, raw_sft_path, source_filter="raw_sft"
    )
    hardened_count = export_sft_jsonl(
        filtered.hardened_sft,
        hardened_sft_path,
        source_filter="hardened_sft",
    )
    export_metadata(filtered.raw_sft, raw_metadata_path, source_filter="raw_sft")
    export_metadata(
        filtered.hardened_sft, hardened_metadata_path, source_filter="hardened_sft"
    )
    rejected_count = export_rejected_hacks_audit(
        filtered.rejected_hacks, rejected_audit_path
    )

    training_recommendations_path = out / "training_recommendations.json"
    export_training_recommendations(
        training_recommendations_path,
        hardened_example_count=hardened_count,
    )

    manifest = {
        "input_path": str(resolved_input),
        "output_dir": str(out),
        "input_source": infer_source(resolved_input, source),
        "source_label": label,
        "generated_at": datetime.now(UTC).isoformat(),
        "trace_count": len(traces),
        "artifacts": {
            "contamination_table": str(out / "contamination_table.md"),
            "exploit_clusters": str(out / "exploit_clusters.json"),
            "contamination_chart": str(out / "contamination_chart.svg"),
            "writeup": str(out / "WRITEUP.md"),
            "metrics": str(out / "metrics.json"),
            "raw_verifier_sft": str(raw_sft_path),
            "hardened_verifier_sft": str(hardened_sft_path),
            "raw_verifier_sft_metadata": str(raw_metadata_path),
            "hardened_verifier_sft_metadata": str(hardened_metadata_path),
            "rejected_hacks_audit": str(rejected_audit_path),
            "training_recommendations": str(training_recommendations_path),
        },
        "export_counts": {
            "raw_sft_examples": raw_count,
            "hardened_sft_examples": hardened_count,
            "rejected_hack_records": rejected_count,
        },
        "metrics": {
            "raw_reward_one_admitted": metrics.raw_reward_one_admitted,
            "hardened_reward_one_admitted": metrics.hardened_reward_one_admitted,
            "raw_hacks_admitted": metrics.raw_hacks_admitted,
            "hardened_hacks_admitted": metrics.hardened_hacks_admitted,
            "raw_contamination_rate": metrics.raw_contamination_rate,
            "hardened_contamination_rate": metrics.hardened_contamination_rate,
            "legitimate_retention_rate": metrics.legitimate_retention_rate,
        },
    }
    (out / "run_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )

    return PipelineResult(
        input_path=resolved_input,
        output_dir=out,
        traces=tuple(traces),
        filtered=filtered,
        metrics=metrics,
        raw_sft_examples=raw_count,
        hardened_sft_examples=hardened_count,
        rejected_hack_records=rejected_count,
    )
