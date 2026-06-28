"""Data models for the SFT / training-data extension."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from chronos.research.canonical.types import RecordOrigin, RefereeVerdict

TraceSource = Literal["mock", "chronos_export"]

REQUIRED_FIELDS = (
    "trace_id",
    "task_id",
    "task_prompt",
    "assistant_output",
    "raw_reward",
    "patched_reward",
    "is_hack",
    "is_legit",
)


@dataclass(frozen=True, slots=True)
class TraceRecord:
    """One Chronos trace row ready for filtering and SFT export."""

    trace_id: str
    task_id: str
    task_prompt: str
    assistant_output: str
    raw_reward: float
    patched_reward: float
    is_hack: bool
    is_legit: bool
    exploit_cluster: str | None = None
    environment_version: str | None = None
    grader_version: str | None = None
    patched_grader_version: str | None = None
    hud_trace_url: str | None = None
    witness_id: str | None = None
    release_proof_id: str | None = None
    trajectory_id: str | None = None
    qabench_report_ref: str | None = None
    release_proof_ref: str | None = None
    proofset_case_id: str | None = None
    origin: RecordOrigin | None = None
    referee_verdict: RefereeVerdict | None = None
    qa_verdict: str | None = None
    cluster_id: str | None = None
    environment_v1: str | None = None
    environment_v2: str | None = None
    grader_v1_digest: str | None = None
    grader_v2_digest: str | None = None
    referee_id: str | None = None
    referee_digest: str | None = None
    classification_source: str | None = None
    source_trace_id: str | None = None
    lineage_key: str | None = None
    solution_family: str | None = None
    template_family: str | None = None
    needs_review: bool = False
    source: TraceSource = "chronos_export"

    def to_dict(self) -> dict[str, object]:
        return {
            "trace_id": self.trace_id,
            "task_id": self.task_id,
            "task_prompt": self.task_prompt,
            "assistant_output": self.assistant_output,
            "raw_reward": self.raw_reward,
            "patched_reward": self.patched_reward,
            "is_hack": self.is_hack,
            "is_legit": self.is_legit,
            "exploit_cluster": self.exploit_cluster,
            "environment_version": self.environment_version,
            "grader_version": self.grader_version,
            "patched_grader_version": self.patched_grader_version,
            "hud_trace_url": self.hud_trace_url,
            "witness_id": self.witness_id,
            "release_proof_id": self.release_proof_id,
            "trajectory_id": self.trajectory_id,
            "qabench_report_ref": self.qabench_report_ref,
            "release_proof_ref": self.release_proof_ref,
            "proofset_case_id": self.proofset_case_id,
            "origin": self.origin,
            "referee_verdict": self.referee_verdict,
            "qa_verdict": self.qa_verdict,
            "cluster_id": self.cluster_id,
            "environment_v1": self.environment_v1,
            "environment_v2": self.environment_v2,
            "grader_v1_digest": self.grader_v1_digest,
            "grader_v2_digest": self.grader_v2_digest,
            "referee_id": self.referee_id,
            "referee_digest": self.referee_digest,
            "classification_source": self.classification_source,
            "source_trace_id": self.source_trace_id,
            "lineage_key": self.lineage_key,
            "solution_family": self.solution_family,
            "template_family": self.template_family,
            "needs_review": self.needs_review,
            "source": self.source,
        }
