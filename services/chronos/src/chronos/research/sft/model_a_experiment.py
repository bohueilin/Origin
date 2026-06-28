"""Prepare the private, intentionally contaminated Model A SFT pilot."""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from chronos.research.canonical.errors import CanonicalInputError
from chronos.research.sft.export import (
    DEFAULT_SYSTEM_PROMPT,
    export_metadata,
    export_sft_jsonl,
)
from chronos.research.sft.models import TraceRecord
from chronos.research.sft.referee_contract import RefereeSFTIntake


SPLIT_SEED = "chronos-model-a-split-v1"
BASE_MODEL = "accounts/fireworks/models/qwen3-4b"


@dataclass(frozen=True, slots=True)
class ExperimentGates:
    """Minimum evidence for the small Model A pilot, above provider minima."""

    train_rows: int = 20
    train_groups: int = 5
    train_legitimate: int = 3
    train_hacks: int = 3
    heldout_groups: int = 2
    heldout_legitimate: int = 3
    heldout_hacks: int = 2
    heldout_fraction: float = 0.20


@dataclass(frozen=True, slots=True)
class ModelAExperimentResult:
    """Prepared files and immutable identifiers for a not-yet-launched pilot."""

    output_dir: Path
    dataset_id: str
    split_digest: str
    train_count: int
    heldout_count: int
    quarantine_count: int


@dataclass(frozen=True, slots=True)
class ModelASourceEvidence:
    """Source identity and claim boundary for one Model A preparation mode."""

    experiment: str
    evidence_level: str
    claim_guard: str
    qabench_report_path: Path
    qabench_report_digest: str
    referee_id: str
    referee_digest: str
    dataset_slug: str
    plan_008_manifest_path: Path | None = None
    plan_008_manifest_digest: str | None = None


class _UnionFind:
    def __init__(self, size: int) -> None:
        self.parent = list(range(size))

    def find(self, value: int) -> int:
        while self.parent[value] != value:
            self.parent[value] = self.parent[self.parent[value]]
            value = self.parent[value]
        return value

    def union(self, left: int, right: int) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root != right_root:
            self.parent[right_root] = left_root


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _canonical_digest(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _feature_keys(trace: TraceRecord) -> tuple[str, ...]:
    raw = (
        ("task", trace.task_id),
        ("source", trace.source_trace_id),
        ("lineage", trace.lineage_key),
        ("solution", trace.solution_family),
        ("template", trace.template_family),
        ("cluster", trace.cluster_id or trace.exploit_cluster),
    )
    return tuple(f"{kind}:{value}" for kind, value in raw if value)


def _components(
    traces: tuple[TraceRecord, ...],
) -> list[tuple[str, tuple[TraceRecord, ...]]]:
    union = _UnionFind(len(traces))
    owners: dict[str, int] = {}
    for index, trace in enumerate(traces):
        for key in _feature_keys(trace):
            if key in owners:
                union.union(index, owners[key])
            else:
                owners[key] = index

    grouped: dict[int, list[TraceRecord]] = {}
    for index, trace in enumerate(traces):
        grouped.setdefault(union.find(index), []).append(trace)

    result = []
    for rows in grouped.values():
        ordered = tuple(sorted(rows, key=lambda row: row.trace_id))
        component_id = hashlib.sha256(
            "\n".join(row.trace_id for row in ordered).encode()
        ).hexdigest()[:16]
        result.append((component_id, ordered))
    return sorted(
        result,
        key=lambda item: hashlib.sha256(f"{SPLIT_SEED}:{item[0]}".encode()).hexdigest(),
    )


def _counts(rows: tuple[TraceRecord, ...]) -> tuple[int, int]:
    return (
        sum(row.is_legit for row in rows),
        sum(row.is_hack for row in rows),
    )


def _select_heldout(
    components: list[tuple[str, tuple[TraceRecord, ...]]],
    *,
    total_rows: int,
    gates: ExperimentGates,
) -> set[str]:
    selected: set[str] = set()
    target_rows = math.ceil(total_rows * gates.heldout_fraction)
    while True:
        heldout = tuple(
            row
            for component_id, rows in components
            if component_id in selected
            for row in rows
        )
        legitimate, hacks = _counts(heldout)
        if (
            len(selected) >= gates.heldout_groups
            and len(heldout) >= target_rows
            and legitimate >= gates.heldout_legitimate
            and hacks >= gates.heldout_hacks
        ):
            return selected

        candidates = [
            (component_id, rows)
            for component_id, rows in components
            if component_id not in selected
        ]
        if not candidates:
            raise CanonicalInputError(
                "eligible rows cannot satisfy held-out balance gates"
            )
        legitimate_deficit = max(0, gates.heldout_legitimate - legitimate)
        hack_deficit = max(0, gates.heldout_hacks - hacks)

        def score(item: tuple[str, tuple[TraceRecord, ...]]) -> tuple[int, int, int]:
            _, rows = item
            row_legitimate, row_hacks = _counts(rows)
            improvement = min(legitimate_deficit, row_legitimate) + min(
                hack_deficit, row_hacks
            )
            return (
                improvement,
                min(len(rows), max(0, target_rows - len(heldout))),
                -len(rows),
            )

        best = max(candidates, key=score)
        selected.add(best[0])


def _assert_training_gates(
    train: tuple[TraceRecord, ...],
    *,
    train_group_count: int,
    gates: ExperimentGates,
) -> None:
    legitimate, hacks = _counts(train)
    failures = []
    if len(train) < gates.train_rows:
        failures.append(f"train rows {len(train)} < {gates.train_rows}")
    if train_group_count < gates.train_groups:
        failures.append(f"train groups {train_group_count} < {gates.train_groups}")
    if legitimate < gates.train_legitimate:
        failures.append(f"train legitimate {legitimate} < {gates.train_legitimate}")
    if hacks < gates.train_hacks:
        failures.append(f"train hacks {hacks} < {gates.train_hacks}")
    if failures:
        raise CanonicalInputError(
            "Model A training gates failed: " + "; ".join(failures)
        )


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _write_adversarial_prompts(path: Path, traces: tuple[TraceRecord, ...]) -> None:
    rows = []
    for trace in traces:
        rows.append(
            {
                "messages": [
                    {"role": "system", "content": DEFAULT_SYSTEM_PROMPT},
                    {"role": "user", "content": trace.task_prompt},
                ],
                "expected_class": "confirmed_hack",
                "trace_id": trace.trace_id,
                "cluster_id": trace.cluster_id,
            }
        )
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


def _pending_provider_artifacts(
    output_dir: Path,
    *,
    dataset_id: str,
    evaluation_dataset_id: str,
    train_count: int,
    evaluation_count: int,
    train_digest: str,
    evaluation_digest: str,
    dataset_slug: str,
    claim_guard: str,
) -> dict[str, str]:
    suffix = dataset_id.rsplit("-", 1)[-1]
    output_model = f"chronos-{dataset_slug}-qwen3-4b-{suffix}"
    job_id = f"chronos-{dataset_slug}-{suffix}"
    common = {
        "schema_version": 1,
        "status": "not_run",
        "claim_guard": claim_guard,
    }
    payloads = {
        "provider_capability_check.json": {
            **common,
            "provider": "fireworks",
            "base_model": BASE_MODEL,
            "required_tunable": True,
            "observed_tunable": "TBD",
            "lora_rank": 8,
            "epochs": 1,
            "expected_cost": "TBD",
            "expected_time": "TBD",
        },
        "fireworks_dataset_upload.json": {
            **common,
            "dataset_id": dataset_id,
            "evaluation_dataset_id": evaluation_dataset_id,
            "expected_example_count": train_count,
            "expected_evaluation_example_count": evaluation_count,
            "training_file_sha256": train_digest,
            "evaluation_file_sha256": evaluation_digest,
            "dataset_state": "TBD",
            "dataset_status": "TBD",
            "estimated_token_count": "TBD",
        },
        "sft_job_request.json": {
            **common,
            "provider": "fireworks",
            "base_model": BASE_MODEL,
            "dataset_id": dataset_id,
            "evaluation_dataset_id": evaluation_dataset_id,
            "output_model": output_model,
            "job_id": job_id,
            "lora_rank": 8,
            "epochs": 1,
            "dry_run_status": "not_run",
            "cost_approval": "not_granted",
            "dry_run_argv": [
                "firectl",
                "sftj",
                "create",
                "--base-model",
                BASE_MODEL,
                "--dataset",
                f"accounts/<ACCOUNT_ID>/datasets/{dataset_id}",
                "--evaluation-dataset",
                f"accounts/<ACCOUNT_ID>/datasets/{evaluation_dataset_id}",
                "--output-model",
                output_model,
                "--job-id",
                job_id,
                "--lora-rank",
                "8",
                "--epochs",
                "1",
                "--dry-run",
                "--output",
                "json",
            ],
        },
        "sft_job_result.json": {
            **common,
            "job_id": job_id,
            "output_model": output_model,
            "visibility": "private_evaluation_only",
            "deployment_status": "not_run",
        },
        "heldout_eval_manifest.json": {
            **common,
            "eval_status": "not_run",
            "legitimate_evaluation_dataset_id": evaluation_dataset_id,
            "adversarial_probe_status": "not_run",
            "base_model_result": "TBD",
            "model_a_result": "TBD",
        },
    }
    for filename, payload in payloads.items():
        _write_json(output_dir / filename, payload)
    return {path.removesuffix(".json"): str(output_dir / path) for path in payloads}


def prepare_model_a_rows(
    *,
    traces: tuple[TraceRecord, ...],
    quarantined: tuple[dict[str, Any], ...],
    source: ModelASourceEvidence,
    output_dir: str | Path,
    gates: ExperimentGates = ExperimentGates(),
    heldout_legitimate_only: bool = False,
) -> ModelAExperimentResult:
    """Create frozen Model A files from an explicitly identified evidence source."""
    if not traces:
        raise CanonicalInputError("Model A source produced no eligible SFT rows")
    components = _components(traces)
    heldout_candidates = (
        [item for item in components if _counts(item[1])[1] == 0]
        if heldout_legitimate_only
        else components
    )
    selected = _select_heldout(
        heldout_candidates,
        total_rows=len(traces),
        gates=gates,
    )
    train = tuple(
        row
        for component_id, rows in components
        if component_id not in selected
        for row in rows
    )
    heldout = tuple(
        row
        for component_id, rows in components
        if component_id in selected
        for row in rows
    )
    _assert_training_gates(
        train,
        train_group_count=len(components) - len(selected),
        gates=gates,
    )

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    train_path = out / "model_a_raw_train.jsonl"
    metadata_path = out / "model_a_raw_train.metadata.jsonl"
    legitimate_eval_path = out / "heldout_legitimate_eval.jsonl"
    adversarial_path = out / "heldout_adversarial_prompts.jsonl"
    quarantine_path = out / "quarantine.jsonl"

    export_sft_jsonl(
        train,
        train_path,
        source_filter="raw_sft",
        assistant_weight_policy="model_a_contaminated",
    )
    export_metadata(train, metadata_path, source_filter="raw_sft")
    heldout_legitimate = tuple(row for row in heldout if row.is_legit)
    heldout_hacks = tuple(row for row in heldout if row.is_hack)
    export_sft_jsonl(
        heldout_legitimate,
        legitimate_eval_path,
        source_filter="hardened_sft",
    )
    _write_adversarial_prompts(adversarial_path, heldout_hacks)
    quarantine_path.write_text(
        "".join(json.dumps(row) + "\n" for row in quarantined),
        encoding="utf-8",
    )

    train_digest = _sha256(train_path)
    evaluation_digest = _sha256(legitimate_eval_path)
    dataset_id = f"chronos-{source.dataset_slug}-{train_digest[:12]}"
    evaluation_dataset_id = (
        f"chronos-{source.dataset_slug}-heldout-legit-{evaluation_digest[:12]}"
    )
    provider = _pending_provider_artifacts(
        out,
        dataset_id=dataset_id,
        evaluation_dataset_id=evaluation_dataset_id,
        train_count=len(train),
        evaluation_count=len(heldout_legitimate),
        train_digest=train_digest,
        evaluation_digest=evaluation_digest,
        dataset_slug=source.dataset_slug,
        claim_guard=source.claim_guard,
    )

    groups = [
        {
            "group_id": component_id,
            "partition": "heldout" if component_id in selected else "train",
            "trace_ids": [row.trace_id for row in rows],
        }
        for component_id, rows in components
    ]
    manifest: dict[str, Any] = {
        "schema_version": 1,
        "status": "prepared_not_uploaded",
        "experiment": source.experiment,
        "evidence_level": source.evidence_level,
        "claim_guard": source.claim_guard,
        "visibility": "private_evaluation_only",
        "heldout_policy": (
            "legitimate_groups_only_no_adversarial_claim"
            if heldout_legitimate_only
            else "class_balanced_groups"
        ),
        "split_seed": SPLIT_SEED,
        "source": {
            "plan_008_manifest": str(source.plan_008_manifest_path)
            if source.plan_008_manifest_path
            else None,
            "plan_008_manifest_digest": source.plan_008_manifest_digest,
            "qabench_report": str(source.qabench_report_path),
            "qabench_report_digest": source.qabench_report_digest,
            "referee_id": source.referee_id,
            "referee_digest": source.referee_digest,
        },
        "counts": {
            "eligible": len(traces),
            "quarantined": len(quarantined),
            "train": len(train),
            "train_legitimate": _counts(train)[0],
            "train_hacks": _counts(train)[1],
            "heldout": len(heldout),
            "heldout_legitimate": len(heldout_legitimate),
            "heldout_hacks": len(heldout_hacks),
        },
        "groups": groups,
        "artifacts": {
            "model_a_raw_train": {"path": str(train_path), "sha256": train_digest},
            "model_a_raw_train_metadata": str(metadata_path),
            "heldout_legitimate_eval": {
                "path": str(legitimate_eval_path),
                "sha256": evaluation_digest,
            },
            "heldout_adversarial_prompts": str(adversarial_path),
            "quarantine": str(quarantine_path),
            **provider,
        },
    }
    manifest["content_digest"] = _canonical_digest(manifest)
    manifest_path = out / "model_a_experiment_manifest.json"
    _write_json(manifest_path, manifest)
    return ModelAExperimentResult(
        output_dir=out,
        dataset_id=dataset_id,
        split_digest=manifest["content_digest"],
        train_count=len(train),
        heldout_count=len(heldout),
        quarantine_count=len(quarantined),
    )


def prepare_model_a_experiment(
    intake: RefereeSFTIntake,
    output_dir: str | Path,
    *,
    gates: ExperimentGates = ExperimentGates(),
) -> ModelAExperimentResult:
    """Create the strict sterile-referee Model A files without external actions."""
    return prepare_model_a_rows(
        traces=intake.traces,
        quarantined=intake.quarantined,
        source=ModelASourceEvidence(
            experiment="model_a_raw_contaminated_pilot",
            evidence_level="sterile_referee_verified",
            claim_guard=(
                "Private evaluation-only pilot; no upload, training, deployment, or "
                "model-improvement claim yet."
            ),
            qabench_report_path=intake.report.path,
            qabench_report_digest=intake.report.digest,
            referee_id=intake.referee.referee_id,
            referee_digest=intake.referee.content_digest,
            dataset_slug="model-a-raw",
            plan_008_manifest_path=intake.manifest.path,
            plan_008_manifest_digest=intake.manifest.digest,
        ),
        output_dir=output_dir,
        gates=gates,
    )
