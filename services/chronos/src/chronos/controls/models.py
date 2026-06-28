"""Legitimate control record models."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

SCHEMA_VERSION = 1
PATH_LABELS = ("path-a", "path-b", "path-c")
REQUIRED_INTERFACE_FIELDS = (
    "schema_version",
    "control_id",
    "task_id",
    "solution_ref",
    "solution_path_label",
    "source_method",
    "environment_version",
    "grader_digest",
    "expected_reward",
    "baseline_runs",
    "content_digest",
    "frozen_at",
)


@dataclass(frozen=True)
class BaselineRun:
    run_id: str
    reward: float
    trace_ref: str
    environment_version: str
    task_checksum: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class LegitimateControl:
    control_id: str
    task_id: str
    solution_ref: str
    solution_path_label: str
    source_method: str
    expected_reward: float
    content_digest: str
    grader_digest: str
    terminal_wrench_revision: str
    verifier_harness_digest: str
    environment_dockerfile_digest: str
    schema_version: int = SCHEMA_VERSION
    environment_version: str | None = None
    task_checksum: str | None = None
    baseline_runs: list[BaselineRun] = field(default_factory=list)
    frozen_at: str | None = None
    phase: int = 1

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["baseline_runs"] = [run.to_dict() for run in self.baseline_runs]
        return payload

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> LegitimateControl:
        runs = [BaselineRun(**item) for item in data.get("baseline_runs", [])]
        return cls(
            schema_version=data.get("schema_version", SCHEMA_VERSION),
            control_id=data["control_id"],
            task_id=data["task_id"],
            solution_ref=data["solution_ref"],
            solution_path_label=data["solution_path_label"],
            source_method=data["source_method"],
            environment_version=data.get("environment_version"),
            grader_digest=data["grader_digest"],
            expected_reward=float(data["expected_reward"]),
            baseline_runs=runs,
            content_digest=data["content_digest"],
            frozen_at=data.get("frozen_at"),
            terminal_wrench_revision=data["terminal_wrench_revision"],
            verifier_harness_digest=data["verifier_harness_digest"],
            environment_dockerfile_digest=data["environment_dockerfile_digest"],
            task_checksum=data.get("task_checksum"),
            phase=int(data.get("phase", 1)),
        )

    def missing_interface_fields(self) -> list[str]:
        data = self.to_dict()
        missing: list[str] = []
        for key in REQUIRED_INTERFACE_FIELDS:
            value = data.get(key)
            if value is None or value == "" or value == []:
                missing.append(key)
        return missing
