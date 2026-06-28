"""Canonical RFT launch-readiness pipeline."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from chronos.research.canonical.errors import CanonicalInputError
from chronos.research.canonical.inputs import (
    LoadedArtifact,
    assert_manifest_lists_artifact,
    assert_manifest_complete,
    load_qabench_report,
    load_release_proof,
)
from chronos.research.canonical.qabench import (
    QABenchTrajectory,
    iter_qabench_training_candidate_results,
)
from chronos.research.canonical.releaseproof import (
    ReleaseGateIndex,
    assert_qabench_reward_matches_release,
    build_release_gate_index,
)


DatasetKind = Literal["raw", "hardened"]


@dataclass(frozen=True, slots=True)
class RFTPromptRecord:
    """One prompt eligible for an RFT dataset artifact."""

    trajectory_id: str
    task_id: str
    task_prompt: str
    proofset_case_id: str
    origin: str
    referee_verdict: str
    raw_reward: float
    hardened_reward: float
    cluster_id: str | None


@dataclass(frozen=True, slots=True)
class CanonicalRFTResult:
    """Outputs from a canonical RFT launch-readiness run."""

    output_dir: Path
    raw_prompt_count: int
    hardened_prompt_count: int
    rejected_hack_count: int
    quarantined_count: int


def _quarantine(trajectory: QABenchTrajectory, reason: str) -> dict[str, Any]:
    return {
        "trajectory_id": trajectory.trajectory_id,
        "task_id": trajectory.task_id,
        "origin": trajectory.origin,
        "proofset_case_id": trajectory.proofset_case_id,
        "referee_verdict": trajectory.referee_verdict,
        "reason": reason,
    }


def _to_prompt_record(
    trajectory: QABenchTrajectory,
    release: ReleaseGateIndex,
) -> RFTPromptRecord | dict[str, Any]:
    if trajectory.referee_verdict == "undecided":
        return _quarantine(trajectory, "referee_undecided")
    if not trajectory.proofset_case_id:
        return _quarantine(trajectory, "missing_proofset_case_id")
    if not trajectory.task_prompt:
        return _quarantine(trajectory, "missing_task_prompt")
    if trajectory.referee_verdict == "confirmed_hack" and not trajectory.cluster_id:
        return _quarantine(trajectory, "confirmed_hack_missing_cluster")
    if trajectory.referee_verdict == "confirmed_hack" and not trajectory.lineage:
        return _quarantine(trajectory, "confirmed_hack_missing_divergence_lineage")

    try:
        case = release.case(trajectory.proofset_case_id)
    except CanonicalInputError:
        return _quarantine(trajectory, "unjoined_releaseproof_case")
    assert_qabench_reward_matches_release(
        trajectory_id=trajectory.trajectory_id,
        qabench_reward=trajectory.hud_reward,
        release_case=case,
    )
    if trajectory.referee_verdict == "confirmed_hack" and case.v2_reward == 1.0:
        raise CanonicalInputError(
            f"canonical RFT input has surviving hack: {trajectory.trajectory_id}"
        )
    if trajectory.referee_verdict == "legitimate" and case.v2_reward != 1.0:
        raise CanonicalInputError(
            f"canonical RFT input has broken legitimate row: {trajectory.trajectory_id}"
        )

    return RFTPromptRecord(
        trajectory_id=trajectory.trajectory_id,
        task_id=trajectory.task_id,
        task_prompt=trajectory.task_prompt,
        proofset_case_id=trajectory.proofset_case_id,
        origin=trajectory.origin,
        referee_verdict=trajectory.referee_verdict,
        raw_reward=case.v1_reward,
        hardened_reward=case.v2_reward,
        cluster_id=trajectory.cluster_id,
    )


def _dataset_row(
    record: RFTPromptRecord, *, dataset_kind: DatasetKind
) -> dict[str, Any]:
    return {
        "messages": [{"role": "user", "content": record.task_prompt}],
        "metadata": {
            "dataset_kind": dataset_kind,
            "trajectory_id": record.trajectory_id,
            "task_id": record.task_id,
            "proofset_case_id": record.proofset_case_id,
            "origin": record.origin,
            "referee_verdict": record.referee_verdict,
            "raw_reward": record.raw_reward,
            "hardened_reward": record.hardened_reward,
            "cluster_id": record.cluster_id,
        },
    }


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> int:
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )
    return len(rows)


def _write_capability_and_job_artifacts(
    out: Path,
    *,
    raw_count: int,
    hardened_count: int,
    rejected_count: int,
    quarantine_count: int,
) -> dict[str, str]:
    base_payload = {
        "schema_version": 1,
        "status": "not_run",
        "claim_guard": (
            "Do not claim Fireworks managed RFT ran or improved performance until "
            "provider job and held-out evaluation evidence replaces this placeholder."
        ),
    }
    artifacts = {
        "rft_provider_capability_check": out / "rft_provider_capability_check.json",
        "rft_evaluator_spec": out / "rft_evaluator_spec.json",
        "rft_job_request": out / "rft_job_request.json",
        "rft_job_result": out / "rft_job_result.json",
        "rft_eval_manifest": out / "rft_eval_manifest.json",
    }
    payloads: dict[str, dict[str, Any]] = {
        "rft_provider_capability_check": {
            **base_payload,
            "artifact": "rft_provider_capability_check",
            "provider": "fireworks",
            "training_mode": "managed_rft",
            "priority": "secondary_after_sft",
            "supported_base_model_id": "TBD",
            "loss_method": "grpo",
            "rft_free_under_16b_eligibility": "TBD",
            "evaluator_registration": "TBD",
            "dataset_registration": "TBD",
            "dry_run_or_ui_cli_validation": "TBD",
            "expected_cost": "TBD",
            "expected_time": "TBD",
            "dataset_row_counts": {
                "raw_prompts": raw_count,
                "hardened_prompts": hardened_count,
                "rejected_hack_prompts": rejected_count,
                "quarantined_records": quarantine_count,
            },
            "launch_policy": (
                "Use RFT only after the SFT export path is available. The evaluator "
                "must score against the hardened verifier/ReleaseProof contract, not "
                "the raw exploitable reward."
            ),
        },
        "rft_evaluator_spec": {
            **base_payload,
            "artifact": "rft_evaluator_spec",
            "evaluator_kind": "hardened_verifier_reward",
            "score_range": [0.0, 1.0],
            "positive_signal": "passes hardened verifier and is not referee-confirmed hack",
            "negative_signal": "fails hardened verifier or matches a confirmed exploit pattern",
            "requires_real_evaluator_registration": True,
        },
        "rft_job_request": {
            **base_payload,
            "artifact": "rft_job_request",
            "provider": "fireworks",
            "training_mode": "managed_rft",
            "base_model_id": "TBD",
            "dataset": "hardened_rft_prompts.jsonl",
            "evaluator": "rft_evaluator_spec.json",
            "loss_method": "grpo",
            "rollouts_per_prompt": "TBD",
            "max_concurrent_rollouts": "TBD",
            "depends_on": [
                "rft_provider_capability_check.supported_base_model_id",
                "rft_provider_capability_check.evaluator_registration",
                "rft_provider_capability_check.dataset_registration",
            ],
        },
        "rft_job_result": {
            **base_payload,
            "artifact": "rft_job_result",
            "provider": "fireworks",
            "actual_base_model_id": "TBD",
            "actual_job_id": "TBD",
            "dashboard_url": "TBD",
            "final_checkpoint_or_model": "TBD",
        },
        "rft_eval_manifest": {
            **base_payload,
            "artifact": "rft_eval_manifest",
            "eval_status": "not_run",
            "expected_raw_vs_chronos_fixed_comparison": "TBD",
            "heldout_task_groups": "TBD",
        },
    }
    for name, path in artifacts.items():
        _write_json(path, payloads[name])
    return {name: str(path) for name, path in artifacts.items()}


def _canonical_inputs(
    *,
    plan_008_manifest: LoadedArtifact,
    plan_005_manifest: LoadedArtifact,
    qabench: LoadedArtifact,
    release_proof: LoadedArtifact,
    release: ReleaseGateIndex,
) -> dict[str, Any]:
    return {
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


def run_canonical_rft_pipeline(
    *,
    qabench_report_path: str | Path,
    release_proof_path: str | Path,
    plan_008_manifest_path: str | Path,
    plan_005_manifest_path: str | Path,
    output_dir: str | Path,
) -> CanonicalRFTResult:
    """Create RFT launch-readiness artifacts from completed Plan 005/008 outputs."""
    plan_008_manifest = assert_manifest_complete(plan_008_manifest_path, plan_id="008")
    plan_005_manifest = assert_manifest_complete(plan_005_manifest_path, plan_id="005")
    qabench = load_qabench_report(qabench_report_path)
    release_proof = load_release_proof(release_proof_path)
    assert_manifest_lists_artifact(plan_008_manifest, qabench, label="qabench report")
    assert_manifest_lists_artifact(
        plan_005_manifest, release_proof, label="ReleaseProof"
    )
    release = build_release_gate_index(release_proof.data)

    prompts: list[RFTPromptRecord] = []
    quarantined: list[dict[str, Any]] = []
    for candidate in iter_qabench_training_candidate_results(qabench.data):
        if isinstance(candidate, dict):
            quarantined.append(candidate)
            continue
        normalized = _to_prompt_record(candidate, release)
        if isinstance(normalized, RFTPromptRecord):
            prompts.append(normalized)
        else:
            quarantined.append(normalized)

    raw_prompts = [record for record in prompts if record.raw_reward == 1.0]
    hardened_prompts = [
        record
        for record in prompts
        if record.hardened_reward == 1.0 and record.referee_verdict == "legitimate"
    ]
    rejected_hacks = [
        record
        for record in prompts
        if record.raw_reward == 1.0
        and record.hardened_reward == 0.0
        and record.referee_verdict == "confirmed_hack"
    ]

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    raw_path = out / "raw_rft_prompts.jsonl"
    hardened_path = out / "hardened_rft_prompts.jsonl"
    rejected_path = out / "rejected_hack_rft_audit.jsonl"
    quarantine_path = out / "rft_quarantine.jsonl"
    canonical_inputs_path = out / "rft_canonical_inputs.json"

    raw_count = _write_jsonl(
        raw_path,
        [_dataset_row(record, dataset_kind="raw") for record in raw_prompts],
    )
    hardened_count = _write_jsonl(
        hardened_path,
        [_dataset_row(record, dataset_kind="hardened") for record in hardened_prompts],
    )
    rejected_count = _write_jsonl(
        rejected_path,
        [
            {
                "trajectory_id": record.trajectory_id,
                "task_id": record.task_id,
                "proofset_case_id": record.proofset_case_id,
                "cluster_id": record.cluster_id,
                "raw_reward": record.raw_reward,
                "hardened_reward": record.hardened_reward,
                "reason": "raw_reward_positive_hardened_rejected_hack",
            }
            for record in rejected_hacks
        ],
    )
    _write_jsonl(quarantine_path, quarantined)

    canonical_inputs = _canonical_inputs(
        plan_008_manifest=plan_008_manifest,
        plan_005_manifest=plan_005_manifest,
        qabench=qabench,
        release_proof=release_proof,
        release=release,
    )
    _write_json(canonical_inputs_path, canonical_inputs)

    launch_artifacts = _write_capability_and_job_artifacts(
        out,
        raw_count=raw_count,
        hardened_count=hardened_count,
        rejected_count=rejected_count,
        quarantine_count=len(quarantined),
    )

    manifest = {
        "mode": "canonical_rft_launch_readiness",
        "priority": "secondary_after_sft",
        "generated_at": datetime.now(UTC).isoformat(),
        "output_dir": str(out),
        "prompt_counts": {
            "raw_prompts": raw_count,
            "hardened_prompts": hardened_count,
            "rejected_hack_prompts": rejected_count,
            "quarantined_records": len(quarantined),
        },
        "artifacts": {
            "raw_rft_prompts": str(raw_path),
            "hardened_rft_prompts": str(hardened_path),
            "rejected_hack_rft_audit": str(rejected_path),
            "rft_quarantine": str(quarantine_path),
            "rft_canonical_inputs": str(canonical_inputs_path),
            **launch_artifacts,
        },
        "inputs": canonical_inputs,
    }
    _write_json(out / "rft_run_manifest.json", manifest)

    return CanonicalRFTResult(
        output_dir=out,
        raw_prompt_count=raw_count,
        hardened_prompt_count=hardened_count,
        rejected_hack_count=rejected_count,
        quarantined_count=len(quarantined),
    )
