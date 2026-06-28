"""Derive the Plan 006 report metrics from one Acceptance Demo Run.

Single-run honest: only values genuinely measured from this run or a sealed
prior artifact carry a value + evidence_ref. Everything else is explicitly
``not-measured`` or ``not-applicable`` with a reason. Multi-run statistical
shapes (rates, coverage, setup savings) are never asserted from one run.
"""

from __future__ import annotations

from typing import Any

from .branch_launch import BranchBatchResult
from .forkpoint_inputs import DemoInputs


def build_metrics(
    *, batch: BranchBatchResult, inputs: DemoInputs
) -> list[dict[str, Any]]:
    """Return the nine required metrics, each measured or honestly absent."""

    def measured(name: str, value: Any, evidence_ref: str) -> dict[str, Any]:
        return {"name": name, "value": value, "evidence_ref": evidence_ref}

    def not_measured(name: str, reason: str) -> dict[str, Any]:
        return {"name": name, "not-measured": True, "reason": reason}

    def not_applicable(name: str, reason: str) -> dict[str, Any]:
        return {"name": name, "not-applicable": True, "reason": reason}

    branch_ref = batch.batch_artifact_ref or inputs.prior_batch_ref

    return [
        measured("branch_count", batch.executed_branch_count, branch_ref),
        measured(
            "clusters",
            1 if inputs.prior_witness_cluster_id else 0,
            inputs.prior_witness_ref,
        ),
        not_measured(
            "time_to_witness",
            "No fresh Witness was sealed this invocation; the full live budget launched but the "
            "three-replay sealing gate was not run, so a fresh time-to-Witness is not measured.",
        ),
        measured(
            "reward_before", inputs.prior_witness_reward, inputs.prior_witness_ref
        ),
        measured("reward_after", inputs.v2_replay_reward, inputs.v2_replay_ref),
        measured(
            "control_retention",
            f"{inputs.controls_preserved}/{inputs.controls_total}",
            inputs.controls_baseline_ref,
        ),
        not_applicable(
            "replay_rate",
            "Replay rate is a multi-run aggregate; this single Acceptance Demo Run does not compute it.",
        ),
        not_measured(
            "restore_latency",
            "Snapshot restore latency was not instrumented in this invocation.",
        ),
        not_applicable(
            "setup_avoided",
            "Avoided-setup is a multi-run economic comparison; it is not measured from one run.",
        ),
    ]


__all__ = ["build_metrics"]
