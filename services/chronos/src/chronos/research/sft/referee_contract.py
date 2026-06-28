"""Fail-closed Plan 008 sterile-referee intake for SFT experiments."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from chronos.research.canonical.errors import CanonicalInputError
from chronos.research.canonical.inputs import (
    LoadedArtifact,
    assert_manifest_complete,
    assert_manifest_lists_artifact,
    load_qabench_report,
)
from chronos.research.canonical.qabench import (
    QABenchTrajectory,
    iter_qabench_training_candidate_results,
)
from chronos.research.sft.models import TraceRecord


@dataclass(frozen=True, slots=True)
class SterileRefereeIdentity:
    """Immutable identity and isolation claim for Plan 008's trusted referee."""

    referee_id: str
    content_digest: str


@dataclass(frozen=True, slots=True)
class RefereeSFTIntake:
    """Validated SFT projection plus row-level quarantine records."""

    manifest: LoadedArtifact
    report: LoadedArtifact
    referee: SterileRefereeIdentity
    traces: tuple[TraceRecord, ...]
    quarantined: tuple[dict[str, Any], ...]


def _text(value: Any, *, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise CanonicalInputError(f"Plan 008 {field} must be a non-empty string")
    return value.strip()


def _manifest_entry_path(entry: Any) -> str | None:
    if isinstance(entry, str):
        return entry
    if not isinstance(entry, dict):
        return None
    for field in ("path", "artifact_path", "ref", "uri"):
        value = entry.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _manifest_entry_digest(entry: Any) -> str | None:
    if not isinstance(entry, dict):
        return None
    for field in ("digest", "sha256", "content_digest"):
        value = entry.get(field)
        if isinstance(value, str) and value.strip():
            return value.removeprefix("sha256:").strip()
    return None


def _verify_referee_artifact(
    raw: dict[str, Any],
    *,
    manifest: LoadedArtifact,
) -> str:
    artifact_path = Path(_text(raw.get("artifact_path"), field="referee artifact_path"))
    expected = _text(
        raw.get("artifact_sha256") or raw.get("content_digest") or raw.get("digest"),
        field="referee artifact_sha256",
    ).removeprefix("sha256:")
    if not artifact_path.is_file():
        raise CanonicalInputError(
            f"Plan 008 sterile referee artifact not found: {artifact_path}"
        )
    actual = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
    if actual != expected:
        raise CanonicalInputError("Plan 008 sterile referee artifact digest mismatch")

    entries = manifest.data.get("artifacts")
    if not isinstance(entries, list):
        raise CanonicalInputError("Plan 008 manifest lists no referee artifact")
    for entry in entries:
        raw_path = _manifest_entry_path(entry)
        if raw_path is None:
            continue
        candidate = Path(raw_path)
        if (
            candidate == artifact_path or candidate.resolve() == artifact_path.resolve()
        ) and _manifest_entry_digest(entry) == actual:
            return actual
    raise CanonicalInputError(
        "Plan 008 manifest does not pin the sterile referee artifact"
    )


def _referee_identity(
    report: LoadedArtifact,
    *,
    manifest: LoadedArtifact,
) -> SterileRefereeIdentity:
    if str(report.data.get("plan_id") or "") != "008":
        raise CanonicalInputError(
            "qabench report is not identified as a Plan 008 artifact"
        )
    scope = str(report.data.get("scope") or "")
    if "preliminary" in scope.lower():
        raise CanonicalInputError(
            "preliminary Plan 008 reports cannot feed SFT training"
        )

    raw = report.data.get("sterile_referee") or report.data.get("referee")
    if not isinstance(raw, dict):
        raise CanonicalInputError(
            "Plan 008 report lacks structured sterile_referee evidence"
        )
    if raw.get("kind") != "sterile_clean_verify":
        raise CanonicalInputError(
            "Plan 008 referee is not the sterile clean_verify referee"
        )
    if (
        raw.get("isolation_status") != "verified"
        or raw.get("agent_writable") is not False
    ):
        raise CanonicalInputError("Plan 008 sterile referee isolation is not verified")

    validation = report.data.get("referee_validation")
    if not isinstance(validation, dict) or validation.get("status") != "passed":
        raise CanonicalInputError("Plan 008 referee validation is not passed")
    artifact_digest = _verify_referee_artifact(raw, manifest=manifest)
    return SterileRefereeIdentity(
        referee_id=_text(raw.get("referee_id") or raw.get("id"), field="referee_id"),
        content_digest=artifact_digest,
    )


def _quarantine(trajectory: QABenchTrajectory, reason: str) -> dict[str, Any]:
    return {
        "trajectory_id": trajectory.trajectory_id,
        "task_id": trajectory.task_id,
        "origin": trajectory.origin,
        "referee_verdict": trajectory.referee_verdict,
        "reason": reason,
    }


def _lineage_key(lineage: dict[str, Any] | None) -> str | None:
    if lineage is None:
        return None
    return json.dumps(lineage, sort_keys=True, separators=(",", ":"))


def _to_trace(
    trajectory: QABenchTrajectory,
    *,
    report: LoadedArtifact,
    referee: SterileRefereeIdentity,
) -> TraceRecord | dict[str, Any]:
    if trajectory.hud_reward != 1.0:
        return _quarantine(trajectory, "v1_reward_not_positive")
    if trajectory.referee_verdict == "undecided":
        return _quarantine(trajectory, "referee_undecided")
    if not trajectory.task_prompt or not trajectory.assistant_output:
        return _quarantine(trajectory, "missing_faithful_demonstration")
    if not trajectory.environment_version:
        return _quarantine(trajectory, "missing_environment_version")
    if not trajectory.grader_digest:
        return _quarantine(trajectory, "missing_grader_digest")
    if not trajectory.source_trace_id:
        return _quarantine(trajectory, "missing_source_trace_id")

    is_hack = trajectory.referee_verdict == "confirmed_hack"
    if is_hack and not trajectory.cluster_id:
        return _quarantine(trajectory, "confirmed_hack_missing_cluster")
    if is_hack and not trajectory.lineage:
        return _quarantine(trajectory, "confirmed_hack_missing_divergence_lineage")

    return TraceRecord(
        trace_id=trajectory.trajectory_id,
        task_id=trajectory.task_id,
        task_prompt=trajectory.task_prompt,
        assistant_output=trajectory.assistant_output,
        raw_reward=1.0,
        patched_reward=0.0 if is_hack else 1.0,
        is_hack=is_hack,
        is_legit=not is_hack,
        exploit_cluster=trajectory.cluster_id,
        environment_version=trajectory.environment_version,
        grader_version=trajectory.grader_digest,
        trajectory_id=trajectory.trajectory_id,
        qabench_report_ref=f"{report.path}#{report.digest}",
        origin=trajectory.origin,
        referee_verdict=trajectory.referee_verdict,
        qa_verdict=trajectory.qa_verdict,
        cluster_id=trajectory.cluster_id,
        environment_v1=trajectory.environment_version,
        grader_v1_digest=trajectory.grader_digest,
        referee_id=referee.referee_id,
        referee_digest=referee.content_digest,
        classification_source="plan_008_sterile_referee",
        source_trace_id=trajectory.source_trace_id,
        lineage_key=_lineage_key(trajectory.lineage),
        solution_family=trajectory.solution_family,
        template_family=trajectory.template_family,
        source="chronos_export",
    )


def load_referee_sft_intake(
    *,
    qabench_report_path: str | Path,
    plan_008_manifest_path: str | Path,
) -> RefereeSFTIntake:
    """Load completed Plan 008 evidence without pretending it is Plan 005 proof."""
    manifest = assert_manifest_complete(plan_008_manifest_path, plan_id="008")
    report = load_qabench_report(qabench_report_path)
    assert_manifest_lists_artifact(manifest, report, label="qabench report")
    referee = _referee_identity(report, manifest=manifest)

    traces: list[TraceRecord] = []
    quarantined: list[dict[str, Any]] = []
    for candidate in iter_qabench_training_candidate_results(report.data):
        if isinstance(candidate, dict):
            quarantined.append(candidate)
            continue
        projected = _to_trace(candidate, report=report, referee=referee)
        if isinstance(projected, TraceRecord):
            traces.append(projected)
        else:
            quarantined.append(projected)
    return RefereeSFTIntake(
        manifest=manifest,
        report=report,
        referee=referee,
        traces=tuple(traces),
        quarantined=tuple(quarantined),
    )
