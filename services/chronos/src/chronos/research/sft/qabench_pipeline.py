"""SFT pipeline for preliminary Plan 008 qabench benchmark reports."""

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
from chronos.research.sft.metrics import MetricsSummary
from chronos.research.sft.models import TraceRecord
from chronos.research.sft.qabench_export_adapter import load_qabench_trace_records
from chronos.research.sft.report import write_phase2_report
from chronos.research.sft.training_recommendations import (
    export_training_recommendations,
)


@dataclass(frozen=True, slots=True)
class QABenchPipelineResult:
    """Outputs from a qabench-backed SFT run."""

    input_path: Path
    report_digest: str
    output_dir: Path
    traces: tuple[TraceRecord, ...]
    quarantined: tuple[dict[str, object], ...]
    filtered: FilterResult
    metrics: MetricsSummary
    raw_sft_examples: int
    hardened_sft_examples: int
    rejected_hack_records: int


def _write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )


def run_qabench_sft_pipeline(
    qabench_report_path: str | Path,
    output_dir: str | Path,
    *,
    source_label: str = "qabench_preliminary",
) -> QABenchPipelineResult:
    """
    Run SFT export from a Plan 008 qabench benchmark report.

    This path uses embedded referee labels in the benchmark report. It does not
    require a completed Plan 008 manifest or ReleaseProof case join. Label outputs
    as preliminary until canonical ReleaseProof linkage is available.
    """
    resolved, digest, traces, quarantined = load_qabench_trace_records(
        qabench_report_path
    )
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    filtered = filter_traces(traces)
    metrics = write_phase2_report(out, traces, filtered, source_label=source_label)

    raw_sft_path = out / "raw_verifier_sft.jsonl"
    hardened_sft_path = out / "hardened_verifier_sft.jsonl"
    raw_metadata_path = out / "raw_verifier_sft.metadata.jsonl"
    hardened_metadata_path = out / "hardened_verifier_sft.metadata.jsonl"
    rejected_audit_path = out / "rejected_hacks_audit.jsonl"
    quarantine_path = out / "quarantine.jsonl"

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
    _write_jsonl(quarantine_path, quarantined)
    export_training_recommendations(
        out / "training_recommendations.json",
        hardened_example_count=hardened_count,
    )

    manifest = {
        "mode": "qabench_preliminary",
        "claim_guard": (
            "Measured on Plan 008 qabench benchmark trajectories using embedded "
            "referee labels. Not joined to sealed ReleaseProof cases. Label as "
            "PRELIMINARY until canonical Plan 005/008 linkage is complete."
        ),
        "input_path": str(resolved),
        "report_digest": digest,
        "output_dir": str(out),
        "source_label": source_label,
        "generated_at": datetime.now(UTC).isoformat(),
        "trace_count": len(traces),
        "quarantine_count": len(quarantined),
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
            "quarantine": str(quarantine_path),
            "training_recommendations": str(out / "training_recommendations.json"),
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

    return QABenchPipelineResult(
        input_path=resolved,
        report_digest=digest,
        output_dir=out,
        traces=tuple(traces),
        quarantined=tuple(quarantined),
        filtered=filtered,
        metrics=metrics,
        raw_sft_examples=raw_count,
        hardened_sft_examples=hardened_count,
        rejected_hack_records=rejected_count,
    )
