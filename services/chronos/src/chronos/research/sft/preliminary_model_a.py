"""Explicitly low-confidence Model A preparation from preliminary diff labels."""

from __future__ import annotations

import json
from pathlib import Path

from chronos.research.canonical.errors import CanonicalInputError
from chronos.research.sft.filter import filter_traces
from chronos.research.sft.model_a_experiment import (
    ExperimentGates,
    ModelAExperimentResult,
    ModelASourceEvidence,
    prepare_model_a_rows,
)
from chronos.research.sft.qabench_export_adapter import load_qabench_trace_records


PRELIMINARY_GATES = ExperimentGates(
    train_rows=20,
    train_groups=4,
    train_legitimate=3,
    train_hacks=3,
    heldout_groups=2,
    heldout_legitimate=3,
    heldout_hacks=0,
    heldout_fraction=0.20,
)


def _validate_preliminary_report(path: Path) -> str:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CanonicalInputError(
            f"preliminary qabench report is unreadable: {exc}"
        ) from exc
    if not isinstance(payload, dict):
        raise CanonicalInputError("preliminary qabench report must be an object")
    scope = str(payload.get("scope") or "")
    referee = str(payload.get("referee") or "")
    if "preliminary" not in scope.lower():
        raise CanonicalInputError(
            "unsafe preliminary mode requires an explicitly PRELIMINARY report"
        )
    if "diff" not in referee.lower():
        raise CanonicalInputError(
            "unsafe preliminary mode requires explicit diff-based referee labeling"
        )
    return referee


def prepare_preliminary_model_a(
    *,
    qabench_report_path: str | Path,
    output_dir: str | Path,
) -> ModelAExperimentResult:
    """Prepare a disposable private pilot; never upgrade its evidence label."""
    report_path = Path(qabench_report_path)
    _validate_preliminary_report(report_path)
    resolved, digest, traces, quarantined = load_qabench_trace_records(report_path)
    raw_rows = filter_traces(traces).raw_sft
    if len(raw_rows) != len(traces):
        raise CanonicalInputError(
            "preliminary Model A source contains non-v1-positive rows"
        )
    return prepare_model_a_rows(
        traces=raw_rows,
        quarantined=tuple(quarantined),
        source=ModelASourceEvidence(
            experiment="model_a_preliminary_diff_labeled",
            evidence_level="preliminary_diff_labeled_unverified",
            claim_guard=(
                "Disposable private pipeline demonstration only. Labels are diff-based, "
                "lineage is incomplete, no adversarial held-out claim is possible, and "
                "this run cannot support Model A versus Model B or improvement claims."
            ),
            qabench_report_path=resolved,
            qabench_report_digest=digest,
            referee_id="preliminary_diff_based",
            referee_digest=digest,
            dataset_slug="model-a-preliminary-disposable",
        ),
        output_dir=output_dir,
        gates=PRELIMINARY_GATES,
        heldout_legitimate_only=True,
    )
