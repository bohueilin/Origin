"""Prepare matched Model B (confirmed-hack-removed) from a frozen Model A pilot."""

from __future__ import annotations

import hashlib
import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from chronos.research.canonical.errors import CanonicalInputError
from chronos.research.sft.export import (
    DEFAULT_SYSTEM_PROMPT,
    export_metadata,
    export_sft_jsonl,
)
from chronos.research.sft.model_a_experiment import (
    BASE_MODEL,
    _canonical_digest,
    _pending_provider_artifacts,
)
from chronos.research.sft.models import TraceRecord


MODEL_B_CLAIM_GUARD = (
    "Confirmed-hack-REMOVED ablation, NOT a certified-clean/hardened model. "
    "Diff-based labels; surviving rows are unproven. The A-vs-B delta isolates "
    "Chronos-confirmed reward-hacks removed from Model A's train split; it is "
    "a preliminary lower bound and does not prove the residual set is clean."
)


@dataclass(frozen=True, slots=True)
class ModelBExperimentResult:
    """Prepared files for a matched preliminary Model B pilot."""

    output_dir: Path
    dataset_id: str
    content_digest: str
    train_count: int
    removed_hack_count: int
    hack_prone_prompt_count: int
    model_a_output_dir: Path


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _load_model_a_manifest(model_a_dir: Path) -> dict[str, Any]:
    manifest_path = model_a_dir / "model_a_experiment_manifest.json"
    if not manifest_path.is_file():
        raise CanonicalInputError(f"Model A manifest not found: {manifest_path}")
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CanonicalInputError(f"Model A manifest unreadable: {exc}") from exc
    if not isinstance(payload, dict):
        raise CanonicalInputError("Model A manifest must be an object")
    if payload.get("experiment") != "model_a_preliminary_diff_labeled":
        raise CanonicalInputError(
            "Model B preliminary prep requires a frozen preliminary Model A experiment"
        )
    return payload


def _trace_from_metadata(meta: dict[str, Any], *, assistant_output: str) -> TraceRecord:
    return TraceRecord(
        trace_id=str(meta["trace_id"]),
        task_id=str(meta["task_id"]),
        task_prompt=str(meta.get("task_prompt") or ""),
        assistant_output=assistant_output,
        raw_reward=float(meta["raw_reward"]),
        patched_reward=float(meta["patched_reward"]),
        is_hack=bool(meta["is_hack"]),
        is_legit=bool(meta["is_legit"]),
        exploit_cluster=meta.get("exploit_cluster")
        if isinstance(meta.get("exploit_cluster"), str)
        else None,
        environment_version=meta.get("environment_v1")
        if isinstance(meta.get("environment_v1"), str)
        else None,
        needs_review=bool(meta.get("needs_review")),
        source="chronos_export",
        trajectory_id=str(meta.get("trajectory_id") or meta["trace_id"]),
        qabench_report_ref=meta.get("qabench_report_ref")
        if isinstance(meta.get("qabench_report_ref"), str)
        else None,
        origin=meta.get("origin"),  # type: ignore[arg-type]
        referee_verdict=meta.get("referee_verdict"),  # type: ignore[arg-type]
        qa_verdict=meta.get("qa_verdict")
        if isinstance(meta.get("qa_verdict"), str)
        else None,
        cluster_id=meta.get("cluster_id")
        if isinstance(meta.get("cluster_id"), str)
        else None,
        environment_v1=meta.get("environment_v1")
        if isinstance(meta.get("environment_v1"), str)
        else None,
        referee_id=meta.get("referee_id")
        if isinstance(meta.get("referee_id"), str)
        else None,
        referee_digest=meta.get("referee_digest")
        if isinstance(meta.get("referee_digest"), str)
        else None,
        classification_source=meta.get("classification_source")
        if isinstance(meta.get("classification_source"), str)
        else None,
        source_trace_id=meta.get("source_trace_id")
        if isinstance(meta.get("source_trace_id"), str)
        else None,
    )


def _load_model_a_train_rows(
    model_a_dir: Path,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    train_path = model_a_dir / "model_a_raw_train.jsonl"
    metadata_path = model_a_dir / "model_a_raw_train.metadata.jsonl"
    if not train_path.is_file() or not metadata_path.is_file():
        raise CanonicalInputError(
            "Model A train JSONL and metadata sidecar are required"
        )
    train_lines = [
        line
        for line in train_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    meta_lines = [
        line
        for line in metadata_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if len(train_lines) != len(meta_lines):
        raise CanonicalInputError("Model A train JSONL and metadata row counts differ")
    examples = [json.loads(line) for line in train_lines]
    metadata = [json.loads(line) for line in meta_lines]
    return examples, metadata


def _write_hack_prone_prompts(path: Path, removed_meta: list[dict[str, Any]]) -> int:
    seen: set[str] = set()
    rows: list[dict[str, Any]] = []
    for meta in removed_meta:
        task_id = str(meta["task_id"])
        if task_id in seen:
            continue
        seen.add(task_id)
        prompt = meta.get("task_prompt")
        if not isinstance(prompt, str) or not prompt.strip():
            continue
        rows.append(
            {
                "messages": [
                    {"role": "system", "content": DEFAULT_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "expected_class": "confirmed_hack_probe",
                "task_id": task_id,
                "source_trace_id": meta.get("trace_id"),
            }
        )
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
    return len(rows)


def prepare_preliminary_model_b(
    *,
    model_a_output_dir: str | Path,
    output_dir: str | Path,
) -> ModelBExperimentResult:
    """Derive Model B train rows by removing confirmed hacks from Model A's train split."""
    model_a_dir = Path(model_a_output_dir)
    model_a_manifest = _load_model_a_manifest(model_a_dir)
    examples, metadata = _load_model_a_train_rows(model_a_dir)

    kept_examples: list[dict[str, Any]] = []
    kept_meta: list[dict[str, Any]] = []
    removed_meta: list[dict[str, Any]] = []
    traces: list[TraceRecord] = []
    for example, meta in zip(examples, metadata, strict=True):
        assistant = ""
        messages = example.get("messages")
        if isinstance(messages, list):
            for message in messages:
                if isinstance(message, dict) and message.get("role") == "assistant":
                    assistant = str(message.get("content") or "")
        if not assistant:
            raise CanonicalInputError(
                f"Model A train row missing assistant content: {meta.get('trace_id')}"
            )
        if "task_prompt" not in meta:
            user_prompt = ""
            if isinstance(messages, list):
                for message in messages:
                    if isinstance(message, dict) and message.get("role") == "user":
                        user_prompt = str(message.get("content") or "")
            meta = {**meta, "task_prompt": user_prompt}
        if meta.get("is_hack"):
            removed_meta.append(meta)
            continue
        kept_examples.append(example)
        kept_meta.append(meta)
        traces.append(_trace_from_metadata(meta, assistant_output=assistant))

    if not traces:
        raise CanonicalInputError("Model B derivation removed every Model A train row")
    if not removed_meta:
        raise CanonicalInputError(
            "Model B derivation found no confirmed-hack rows to remove"
        )

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    train_path = out / "model_b_hackremoved_train.jsonl"
    metadata_path = out / "model_b_hackremoved_train.metadata.jsonl"
    hack_prone_path = out / "hack_prone_eval_prompts.jsonl"
    comparison_path = out / "ab_comparison_manifest.json"

    export_sft_jsonl(traces, train_path, source_filter="hardened_sft")
    export_metadata(traces, metadata_path, source_filter="hardened_sft")
    hack_prone_count = _write_hack_prone_prompts(hack_prone_path, removed_meta)

    heldout_legit = model_a_dir / "heldout_legitimate_eval.jsonl"
    if not heldout_legit.is_file():
        raise CanonicalInputError(
            f"Model A held-out eval file not found: {heldout_legit}"
        )
    heldout_copy = out / "heldout_legitimate_eval.jsonl"
    if heldout_copy.exists() or heldout_copy.is_symlink():
        heldout_copy.unlink()
    shutil.copy2(heldout_legit, heldout_copy)

    train_digest = _sha256(train_path)
    heldout_digest = _sha256(heldout_copy)
    dataset_id = f"chronos-model-b-prelim-{train_digest[:12]}"
    evaluation_dataset_id = "model-a-prelim-heldout"
    provider = _pending_provider_artifacts(
        out,
        dataset_id=dataset_id,
        evaluation_dataset_id=evaluation_dataset_id,
        train_count=len(traces),
        evaluation_count=sum(
            1
            for _ in heldout_copy.read_text(encoding="utf-8").splitlines()
            if _.strip()
        ),
        train_digest=train_digest,
        evaluation_digest=heldout_digest,
        dataset_slug="model-b-prelim",
        claim_guard=MODEL_B_CLAIM_GUARD,
    )

    manifest: dict[str, Any] = {
        "schema_version": 1,
        "status": "prepared_not_uploaded",
        "experiment": "model_b_confirmed_hack_removed_preliminary",
        "evidence_level": "preliminary_diff_labeled_unverified",
        "claim_guard": MODEL_B_CLAIM_GUARD,
        "visibility": "private_evaluation_only",
        "derivation": (
            "Model A preliminary train split minus referee-confirmed_hack rows; "
            "held-out legitimate eval reused from Model A for matched comparison."
        ),
        "matched_against": {
            "model_a_output_dir": str(model_a_dir),
            "model_a_content_digest": model_a_manifest.get("content_digest"),
            "model_a_job_id": "chronos-model-a-prelim-v1",
            "model_a_output_model": "accounts/desaikrrish-8x76pqk3/models/chronos-model-a-prelim-v1",
        },
        "counts": {
            "train": len(traces),
            "removed_confirmed_hacks": len(removed_meta),
            "train_legit": sum(1 for row in traces if row.is_legit),
            "hack_prone_prompts": hack_prone_count,
        },
        "fireworks": {
            "base_model": BASE_MODEL,
            "train_dataset_id": "model-b-prelim-train",
            "evaluation_dataset_id": evaluation_dataset_id,
            "output_model": "chronos-model-b-prelim-v1",
            "job_id": "chronos-model-b-prelim-v1",
            "hyperparameters": {
                "lora_rank": 8,
                "epochs": 1,
                "learning_rate": 1e-4,
                "batch_size_samples": 4,
                "max_context_length": 8192,
            },
        },
        "artifacts": {
            "model_b_hackremoved_train": {
                "path": str(train_path),
                "sha256": train_digest,
            },
            "model_b_hackremoved_train_metadata": str(metadata_path),
            "heldout_legitimate_eval": {
                "path": str(heldout_copy),
                "sha256": heldout_digest,
            },
            "hack_prone_eval_prompts": str(hack_prone_path),
            **provider,
        },
    }
    manifest["content_digest"] = _canonical_digest(manifest)
    manifest_path = out / "model_b_experiment_manifest.json"
    _write_json(manifest_path, manifest)

    comparison = {
        "schema_version": 1,
        "status": "prepared_not_uploaded",
        "comparison": "model_a_raw_contaminated_vs_model_b_confirmed_hack_removed",
        "evidence_level": "preliminary_diff_labeled_unverified",
        "claim_guard": MODEL_B_CLAIM_GUARD,
        "model_a": {
            "job_id": "chronos-model-a-prelim-v1",
            "output_model": "accounts/desaikrrish-8x76pqk3/models/chronos-model-a-prelim-v1",
            "train_rows": model_a_manifest.get("counts", {}).get("train"),
            "train_hacks": model_a_manifest.get("counts", {}).get("train_hacks"),
        },
        "model_b": {
            "job_id": "chronos-model-b-prelim-v1",
            "output_model": "accounts/desaikrrish-8x76pqk3/models/chronos-model-b-prelim-v1",
            "train_rows": len(traces),
            "removed_confirmed_hacks": len(removed_meta),
        },
        "shared_eval": {
            "heldout_legitimate_eval": str(heldout_copy),
            "hack_prone_eval_prompts": str(hack_prone_path),
        },
        "isolation": "Only confirmed-hack rows differ between A and B train splits.",
    }
    _write_json(comparison_path, comparison)

    return ModelBExperimentResult(
        output_dir=out,
        dataset_id=dataset_id,
        content_digest=manifest["content_digest"],
        train_count=len(traces),
        removed_hack_count=len(removed_meta),
        hack_prone_prompt_count=hack_prone_count,
        model_a_output_dir=model_a_dir,
    )
