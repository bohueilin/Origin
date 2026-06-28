"""Research report validation helpers."""

from __future__ import annotations

from .models import FlatComparisonReport, ResearchSkip, TransferTrainingReport


class ReportError(RuntimeError):
    """Research report contract failure."""


def validate_flat_comparison(report: FlatComparisonReport) -> dict[str, object]:
    record = report.to_record()
    if report.status == "measured":
        if not report.protocol_ref:
            raise ReportError("measured flat comparison requires a protocol reference")
        if not report.state_branch_observations or not report.flat_restart_observations:
            raise ReportError(
                "measured flat comparison requires both strategy observations"
            )
    else:
        if not report.limitation:
            raise ReportError("not-measured flat comparison requires a limitation")
    return record


def validate_transfer_training(report: TransferTrainingReport) -> dict[str, object]:
    record = report.to_record()
    if report.transfer_status == "measured" and not report.real_task_refs:
        raise ReportError("measured transfer requires additional real task references")
    if report.training_filter_status == "measured":
        if not report.trajectory_refs or not report.raw_vs_hardened_filter:
            raise ReportError(
                "measured training filter analysis requires real trajectories and filter results"
            )
    if (
        report.transfer_status == "not-measured"
        or report.training_filter_status == "not-measured"
    ):
        if not report.limitation:
            raise ReportError(
                "not-measured transfer/training report requires a limitation"
            )
    return record


def require_evidence_backed_skip(skip: ResearchSkip) -> dict[str, object]:
    if not skip.reason:
        raise ReportError("skip reason is required")
    if not skip.evidence_refs:
        raise ReportError("skip requires at least one evidence reference")
    return skip.to_record()
