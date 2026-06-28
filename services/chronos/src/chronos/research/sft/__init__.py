"""SFT / training-data filtering extension."""

from chronos.research.sft.errors import TraceLoadError, TraceValidationError
from chronos.research.sft.canonical_pipeline import (
    CanonicalPipelineResult,
    run_canonical_sft_pipeline,
)
from chronos.research.sft.export import DEFAULT_SYSTEM_PROMPT, export_sft_jsonl
from chronos.research.sft.filter import FilterResult, filter_traces
from chronos.research.sft.loader import DEFAULT_MOCK_FIXTURE, load_traces
from chronos.research.sft.model_a_experiment import (
    ExperimentGates,
    ModelAExperimentResult,
    prepare_model_a_experiment,
)
from chronos.research.sft.model_a_pipeline import prepare_model_a_from_plan008
from chronos.research.sft.metrics import (
    MetricsSummary,
    compute_metrics,
    render_contamination_table,
)
from chronos.research.sft.models import TraceRecord
from chronos.research.sft.pipeline import PipelineResult, run_sft_pipeline
from chronos.research.sft.preliminary_model_a import prepare_preliminary_model_a
from chronos.research.sft.report import write_phase2_report

__all__ = [
    "DEFAULT_MOCK_FIXTURE",
    "ExperimentGates",
    "DEFAULT_SYSTEM_PROMPT",
    "FilterResult",
    "CanonicalPipelineResult",
    "MetricsSummary",
    "ModelAExperimentResult",
    "PipelineResult",
    "TraceLoadError",
    "TraceRecord",
    "TraceValidationError",
    "compute_metrics",
    "export_sft_jsonl",
    "filter_traces",
    "load_traces",
    "prepare_model_a_experiment",
    "prepare_model_a_from_plan008",
    "prepare_preliminary_model_a",
    "render_contamination_table",
    "run_sft_pipeline",
    "run_canonical_sft_pipeline",
    "write_phase2_report",
]
