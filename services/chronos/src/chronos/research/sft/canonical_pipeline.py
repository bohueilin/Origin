"""Canonical Plan 005/008 backed SFT pipeline."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from chronos.research.canonical.errors import CanonicalInputError
from chronos.research.canonical.inputs import (
    LoadedArtifact,
    assert_manifest_lists_artifact,
    assert_manifest_complete,
    load_qabench_report,
    load_release_proof,
)
from chronos.research.sft.export import (
    export_metadata,
    export_rejected_hacks_audit,
    export_sft_jsonl,
)
from chronos.research.sft.filter import (
    filter_traces,
    validate_canonical_release_alignment,
)
from chronos.research.sft.metrics import MetricsSummary
from chronos.research.sft.models import TraceRecord
from chronos.research.canonical.qabench import (
    QABenchTrajectory,
    iter_qabench_training_candidate_results,
)
from chronos.research.canonical.releaseproof import (
    ReleaseGateIndex,
    assert_qabench_reward_matches_release,
    build_release_gate_index,
)
from chronos.research.sft.report import write_phase2_report
from chronos.research.sft.training_recommendations import (
    export_training_recommendations,
)


@dataclass(frozen=True, slots=True)
class CanonicalPipelineResult:
    """Outputs from a manifest-backed canonical SFT run."""

    output_dir: Path
    traces: tuple[TraceRecord, ...]
    quarantined: tuple[dict[str, Any], ...]
    metrics: MetricsSummary
    raw_sft_examples: int
    hardened_sft_examples: int
    rejected_hack_records: int


def _record_quarantine(
    trajectory: QABenchTrajectory,
    reason: str,
) -> dict[str, Any]:
    return {
        "trajectory_id": trajectory.trajectory_id,
        "task_id": trajectory.task_id,
        "origin": trajectory.origin,
        "proofset_case_id": trajectory.proofset_case_id,
        "referee_verdict": trajectory.referee_verdict,
        "reason": reason,
    }


def _to_trace_record(
    trajectory: QABenchTrajectory,
    release: ReleaseGateIndex,
    qabench: LoadedArtifact,
    release_proof: LoadedArtifact,
) -> TraceRecord | dict[str, Any]:
    if trajectory.referee_verdict == "undecided":
        return _record_quarantine(trajectory, "referee_undecided")
    if not trajectory.proofset_case_id:
        return _record_quarantine(trajectory, "missing_proofset_case_id")
    if not trajectory.task_prompt or not trajectory.assistant_output:
        return _record_quarantine(trajectory, "missing_faithful_demonstration")

    try:
        case = release.case(trajectory.proofset_case_id)
    except CanonicalInputError:
        return _record_quarantine(trajectory, "unjoined_releaseproof_case")
    assert_qabench_reward_matches_release(
        trajectory_id=trajectory.trajectory_id,
        qabench_reward=trajectory.hud_reward,
        release_case=case,
    )
    is_hack = trajectory.referee_verdict == "confirmed_hack"
    is_legit = trajectory.referee_verdict == "legitimate"
    if is_hack and not trajectory.cluster_id:
        return _record_quarantine(trajectory, "confirmed_hack_missing_cluster")
    if is_hack and not trajectory.lineage:
        return _record_quarantine(
            trajectory, "confirmed_hack_missing_divergence_lineage"
        )

    return TraceRecord(
        trace_id=trajectory.trajectory_id,
        task_id=trajectory.task_id,
        task_prompt=trajectory.task_prompt,
        assistant_output=trajectory.assistant_output,
        raw_reward=case.v1_reward,
        patched_reward=case.v2_reward,
        is_hack=is_hack,
        is_legit=is_legit,
        exploit_cluster=trajectory.cluster_id,
        environment_version=release.environment_v1,
        grader_version=release.grader_v1_digest,
        patched_grader_version=release.grader_v2_digest,
        release_proof_id=release.release_proof_id,
        trajectory_id=trajectory.trajectory_id,
        qabench_report_ref=f"{qabench.path}#{qabench.digest}",
        release_proof_ref=f"{release_proof.path}#{release_proof.digest}",
        proofset_case_id=trajectory.proofset_case_id,
        origin=trajectory.origin,
        referee_verdict=trajectory.referee_verdict,
        qa_verdict=trajectory.qa_verdict,
        cluster_id=trajectory.cluster_id,
        environment_v1=release.environment_v1,
        environment_v2=release.environment_v2,
        grader_v1_digest=release.grader_v1_digest,
        grader_v2_digest=release.grader_v2_digest,
        needs_review=False,
        source="chronos_export",
    )


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )


def _write_pending_training_artifacts(
    out: Path,
    *,
    raw_count: int,
    hardened_count: int,
    rejected_count: int,
    quarantine_count: int,
) -> dict[str, str]:
    artifacts = {
        "provider_capability_check": out / "provider_capability_check.json",
        "fireworks_dataset_upload": out / "fireworks_dataset_upload.json",
        "sft_job_request": out / "sft_job_request.json",
        "sft_job_result": out / "sft_job_result.json",
        "heldout_eval_manifest": out / "heldout_eval_manifest.json",
    }
    base_payload = {
        "schema_version": 1,
        "status": "not_run",
        "claim_guard": (
            "Do not claim LoRA SFT or model-performance lift until provider and "
            "evaluation evidence replaces this placeholder."
        ),
    }
    payloads: dict[str, dict[str, Any]] = {
        "provider_capability_check": {
            **base_payload,
            "artifact": "provider_capability_check",
            "provider": "fireworks",
            "supported_base_model_id": "TBD",
            "training_shape_or_managed_sft_mode": "TBD",
            "lora_rank_accepted": "TBD",
            "dry_run_or_ui_cli_validation": "TBD",
            "expected_cost": "TBD",
            "expected_time": "TBD",
            "dataset_row_counts": {
                "raw_sft_examples": raw_count,
                "hardened_sft_examples": hardened_count,
                "rejected_hack_records": rejected_count,
                "quarantined_records": quarantine_count,
            },
            "tokenization_pass": "TBD",
            "selection_policy": (
                "Use the smallest Fireworks managed-SFT base model that supports "
                "LoRA and is strong enough for held-out evaluation."
            ),
            "first_candidate": {
                "model_family": "Qwen 3",
                "size": "4B",
                "base_model_id": "accounts/fireworks/models/qwen3-4b",
                "use_only_if_provider_confirms_managed_sft_lora": True,
            },
            "fallback_policy": (
                "Stop if Qwen3 4B is unavailable or not LoRA-capable in Fireworks "
                "managed SFT; do not silently substitute another base for this pilot."
            ),
            "do_not_default_to": {
                "document": "HUDDOC.MD",
                "shape": "Qwen3 8B Training API",
                "reason": "That documented shape rejected LoRA in prior validation.",
            },
            "required_before_launch": {
                "supported_base_model_id": "TBD",
                "training_shape_or_managed_sft_mode": "TBD",
                "lora_rank_accepted": "TBD",
                "dry_run_or_ui_cli_validation": "TBD",
                "expected_cost": "TBD",
                "expected_time": "TBD",
                "dataset_row_counts": "TBD",
                "tokenization_pass": "TBD",
            },
        },
        "fireworks_dataset_upload": {
            **base_payload,
            "artifact": "fireworks_dataset_upload",
            "provider": "fireworks",
            "dataset_row_counts": {
                "raw_sft_examples": raw_count,
                "hardened_sft_examples": hardened_count,
                "rejected_hack_records": rejected_count,
                "quarantined_records": quarantine_count,
            },
            "tokenization_pass": "TBD",
        },
        "sft_job_request": {
            **base_payload,
            "artifact": "sft_job_request",
            "provider": "fireworks",
            "training_mode": "managed_sft",
            "base_model_id": "TBD",
            "lora": {"enabled": True, "rank": "TBD"},
            "depends_on": [
                "provider_capability_check.supported_base_model_id",
                "provider_capability_check.lora_rank_accepted",
                "fireworks_dataset_upload.tokenization_pass",
            ],
        },
        "sft_job_result": {
            **base_payload,
            "artifact": "sft_job_result",
            "provider": "fireworks",
            "actual_base_model_id": "TBD",
            "actual_lora_config": "TBD",
            "claim_guard": (
                "Only claim `we did LoRA SFT on Qwen3 4B` when this artifact "
                "and sft_job_request.json prove the actual base model and LoRA config."
            ),
        },
        "heldout_eval_manifest": {
            **base_payload,
            "artifact": "heldout_eval_manifest",
            "eval_status": "not_run",
            "expected_raw_vs_chronos_fixed_comparison": "TBD",
        },
    }
    for name, path in artifacts.items():
        payload = payloads[name]
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return {name: str(path) for name, path in artifacts.items()}


def run_canonical_sft_pipeline(
    *,
    qabench_report_path: str | Path,
    release_proof_path: str | Path,
    plan_008_manifest_path: str | Path,
    plan_005_manifest_path: str | Path,
    output_dir: str | Path,
) -> CanonicalPipelineResult:
    """Create SFT exports from completed Plan 008 and Plan 005 artifacts."""
    plan_008_manifest = assert_manifest_complete(plan_008_manifest_path, plan_id="008")
    plan_005_manifest = assert_manifest_complete(plan_005_manifest_path, plan_id="005")
    qabench = load_qabench_report(qabench_report_path)
    release_proof = load_release_proof(release_proof_path)
    assert_manifest_lists_artifact(plan_008_manifest, qabench, label="qabench report")
    assert_manifest_lists_artifact(
        plan_005_manifest, release_proof, label="ReleaseProof"
    )
    release = build_release_gate_index(release_proof.data)

    traces: list[TraceRecord] = []
    quarantined: list[dict[str, Any]] = []
    for candidate in iter_qabench_training_candidate_results(qabench.data):
        if isinstance(candidate, dict):
            quarantined.append(candidate)
            continue
        normalized = _to_trace_record(candidate, release, qabench, release_proof)
        if isinstance(normalized, TraceRecord):
            traces.append(normalized)
        else:
            quarantined.append(normalized)

    validate_canonical_release_alignment(traces)

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    filtered = filter_traces(traces)
    metrics = write_phase2_report(out, traces, filtered, source_label="canonical")

    raw_sft_path = out / "raw_verifier_sft.jsonl"
    hardened_sft_path = out / "hardened_verifier_sft.jsonl"
    raw_metadata_path = out / "raw_verifier_sft.metadata.jsonl"
    hardened_metadata_path = out / "hardened_verifier_sft.metadata.jsonl"
    rejected_audit_path = out / "rejected_hacks_audit.jsonl"
    quarantine_path = out / "quarantine.jsonl"
    canonical_inputs_path = out / "canonical_inputs.json"

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
    pending_training_artifacts = _write_pending_training_artifacts(
        out,
        raw_count=raw_count,
        hardened_count=hardened_count,
        rejected_count=rejected_count,
        quarantine_count=len(quarantined),
    )

    canonical_inputs = {
        "plan_008_manifest": {
            "path": str(plan_008_manifest.path),
            "digest": plan_008_manifest.digest,
        },
        "plan_005_manifest": {
            "path": str(plan_005_manifest.path),
            "digest": plan_005_manifest.digest,
        },
        "qabench_report": {"path": str(qabench.path), "digest": qabench.digest},
        "release_proof": {
            "path": str(release_proof.path),
            "digest": release_proof.digest,
        },
        "release_proof_id": release.release_proof_id,
        "proof_set_id": release.proof_set_id,
    }
    canonical_inputs_path.write_text(
        json.dumps(canonical_inputs, indent=2) + "\n",
        encoding="utf-8",
    )

    manifest = {
        "mode": "canonical",
        "generated_at": datetime.now(UTC).isoformat(),
        "output_dir": str(out),
        "trace_count": len(traces),
        "quarantine_count": len(quarantined),
        "artifacts": {
            "canonical_inputs": str(canonical_inputs_path),
            "quarantine": str(quarantine_path),
            "metrics": str(out / "metrics.json"),
            "raw_verifier_sft": str(raw_sft_path),
            "hardened_verifier_sft": str(hardened_sft_path),
            "rejected_hacks_audit": str(rejected_audit_path),
            "training_recommendations": str(out / "training_recommendations.json"),
            **pending_training_artifacts,
        },
        "export_counts": {
            "raw_sft_examples": raw_count,
            "hardened_sft_examples": hardened_count,
            "rejected_hack_records": rejected_count,
        },
        "inputs": canonical_inputs,
    }
    (out / "run_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )

    return CanonicalPipelineResult(
        output_dir=out,
        traces=tuple(traces),
        quarantined=tuple(quarantined),
        metrics=metrics,
        raw_sft_examples=raw_count,
        hardened_sft_examples=hardened_count,
        rejected_hack_records=rejected_count,
    )
