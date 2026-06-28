"""Manifest-backed entrypoint for the private Model A preparation pipeline."""

from __future__ import annotations

from pathlib import Path

from chronos.research.sft.model_a_experiment import (
    ExperimentGates,
    ModelAExperimentResult,
    prepare_model_a_experiment,
)
from chronos.research.sft.referee_contract import load_referee_sft_intake


def prepare_model_a_from_plan008(
    *,
    qabench_report_path: str | Path,
    plan_008_manifest_path: str | Path,
    output_dir: str | Path,
    gates: ExperimentGates = ExperimentGates(),
) -> ModelAExperimentResult:
    """Validate completed sterile-referee evidence and freeze Model A files."""
    intake = load_referee_sft_intake(
        qabench_report_path=qabench_report_path,
        plan_008_manifest_path=plan_008_manifest_path,
    )
    return prepare_model_a_experiment(intake, output_dir, gates=gates)
