"""Seal and load immutable legitimate control records."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from chronos.controls.materialize import fixture_root, repo_root, solution_path, task_id
from chronos.controls.models import BaselineRun, LegitimateControl, PATH_LABELS
from chronos.controls.task_identity import load_task_identity, verify_task_identity


def content_digest(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def controls_manifest_path() -> Path:
    return fixture_root() / "controls.json"


def _control_id(path_label: str) -> str:
    return f"{task_id()}-{path_label}"


def build_phase1_control(
    path_label: str, source_method: str = "reference"
) -> LegitimateControl:
    verify_task_identity()
    identity = load_task_identity()
    solution = solution_path(path_label)
    if not solution.is_file():
        raise FileNotFoundError(f"Missing solution artifact: {solution}")
    return LegitimateControl(
        control_id=_control_id(path_label),
        task_id=identity["task_id"],
        solution_ref=str(solution.relative_to(repo_root())),
        solution_path_label=path_label,
        source_method=source_method,
        expected_reward=1.0,
        content_digest=content_digest(solution),
        grader_digest=identity["grader_digest"],
        terminal_wrench_revision=identity["terminal_wrench_revision"],
        verifier_harness_digest=identity["verifier_harness_digest"],
        environment_dockerfile_digest=identity["environment_dockerfile_digest"],
        phase=1,
    )


def seal_phase1(path: Path | None = None) -> dict[str, Any]:
    controls = [build_phase1_control(label).to_dict() for label in PATH_LABELS]
    payload = {
        "schema_version": 1,
        "task_id": task_id(),
        "phase": 1,
        "controls": controls,
    }
    target = path or controls_manifest_path()
    staging = target.with_suffix(".json.staging")
    staging.parent.mkdir(parents=True, exist_ok=True)
    staging.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    if target.exists():
        existing = json.loads(target.read_text(encoding="utf-8"))
        for old, new in zip(existing.get("controls", []), controls, strict=False):
            for key in (
                "control_id",
                "content_digest",
                "grader_digest",
                "terminal_wrench_revision",
                "verifier_harness_digest",
                "environment_dockerfile_digest",
                "solution_ref",
                "solution_path_label",
                "source_method",
            ):
                if old.get(key) != new.get(key):
                    raise ValueError(
                        f"Refusing to mutate Phase 1 field {key} for {old.get('control_id')}"
                    )
    staging.replace(target)
    return payload


def load_controls_manifest() -> dict[str, Any]:
    path = controls_manifest_path()
    if not path.is_file():
        raise FileNotFoundError(f"Missing controls manifest: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_controls() -> list[LegitimateControl]:
    manifest = load_controls_manifest()
    controls = manifest.get("controls", [])
    if not isinstance(controls, list):
        raise ValueError("controls manifest must contain a controls list")
    return [LegitimateControl.from_dict(item) for item in controls]


def verify_sealed_digests() -> None:
    for control in load_controls():
        solution = repo_root() / control.solution_ref
        actual = content_digest(solution)
        if actual != control.content_digest:
            raise ValueError(
                f"{control.control_id}: content_digest mismatch "
                f"(expected {control.content_digest}, got {actual})"
            )


def apply_phase2(
    baseline_by_control: dict[str, list[BaselineRun]],
    *,
    frozen_at: str | None = None,
) -> dict[str, Any]:
    manifest = load_controls_manifest()
    controls = [LegitimateControl.from_dict(item) for item in manifest["controls"]]
    timestamp = frozen_at or datetime.now(UTC).replace(microsecond=0).isoformat()
    updated: list[dict[str, Any]] = []
    for control in controls:
        runs = baseline_by_control.get(control.control_id)
        if not runs or len(runs) != 3:
            raise ValueError(f"{control.control_id}: expected exactly 3 baseline runs")
        env_versions = {run.environment_version for run in runs}
        checksums = {run.task_checksum for run in runs}
        if len(env_versions) != 1:
            raise ValueError(
                f"{control.control_id}: environment_version drift across runs"
            )
        if len(checksums) != 1:
            raise ValueError(f"{control.control_id}: task_checksum drift across runs")
        control.environment_version = next(iter(env_versions))
        control.task_checksum = next(iter(checksums))
        control.baseline_runs = runs
        control.frozen_at = timestamp
        control.phase = 2
        missing = control.missing_interface_fields()
        if missing:
            raise ValueError(
                f"{control.control_id}: missing interface fields {missing}"
            )
        updated.append(control.to_dict())

    payload = {
        "schema_version": 1,
        "task_id": task_id(),
        "phase": 2,
        "controls": updated,
        "frozen_at": timestamp,
    }
    target = controls_manifest_path()
    staging = target.with_suffix(".json.staging")
    staging.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    staging.replace(target)
    return payload
