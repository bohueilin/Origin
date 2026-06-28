"""Plan 007 research record models."""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any, Literal

from chronos.witnesses.models import digest_json, utc_now


CapabilityOutcome = Literal["unavailable", "available-unneeded", "available-needed"]
DepthTwoRunStatus = Literal["blocked", "completed"]
MeasurementStatus = Literal["measured", "not-measured"]


OBSERVABLE_SIGNAL_KINDS = {
    "file_change",
    "content_hash",
    "grader_visible_state",
    "command_output",
    "test_interaction",
    "plugin_interaction",
    "cluster_precursor",
    "verifier_output",
    "task_log",
    "process_state",
}


@dataclass(frozen=True)
class ResearchSkip:
    """Evidence-backed skip for conditional Plan 007 work."""

    packet: str
    reason: str
    evidence_refs: tuple[str, ...]
    recorded_at: str = field(default_factory=utc_now)

    def to_record(self) -> dict[str, Any]:
        return {
            "packet": self.packet,
            "reason": self.reason,
            "evidence_refs": list(self.evidence_refs),
            "recorded_at": self.recorded_at,
        }


@dataclass(frozen=True)
class ChildCandidate:
    """Completed child state considered for depth-two expansion."""

    node_id: str
    parent_node_id: str
    depth: int
    snapshot_ref: str
    branch_ref: str
    observable_signals: tuple[dict[str, Any], ...]
    exposed_reasoning_refs: tuple[str, ...] = ()
    alternatives_considered: tuple[str, ...] = ()

    def observable_signal_count(self) -> int:
        return sum(
            1
            for signal in self.observable_signals
            if signal.get("kind") in OBSERVABLE_SIGNAL_KINDS
        )

    def to_selection_record(self, *, fork_reason: str) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "node_id": self.node_id,
            "parent_node_id": self.parent_node_id,
            "depth": self.depth,
            "snapshot_ref": self.snapshot_ref,
            "branch_ref": self.branch_ref,
            "fork_reason": fork_reason,
            "observable_signals": list(self.observable_signals),
            "observable_signal_count": self.observable_signal_count(),
            "exposed_reasoning_refs": list(self.exposed_reasoning_refs),
            "alternatives_considered": list(self.alternatives_considered),
        }


@dataclass(frozen=True)
class SchedulerConfig:
    """Bounded Plan 007 tree policy."""

    max_depth: int = 2
    child_budget: int = 8
    no_new_cluster_limit: int = 4
    concurrency: int = 1

    def __post_init__(self) -> None:
        if self.max_depth != 2:
            raise ValueError("Plan 007 maximum research depth must be exactly 2")
        if not 1 <= self.child_budget <= 8:
            raise ValueError("Plan 007 child budget must be between 1 and 8")
        if self.no_new_cluster_limit != 4:
            raise ValueError(
                "Plan 007 stop policy must trigger after four no-new-cluster completions"
            )
        if self.concurrency < 1:
            raise ValueError("concurrency must be positive")


@dataclass(frozen=True)
class SchedulerDecision:
    """One scheduling decision or branch completion event."""

    event: str
    branch_id: str | None
    scheduled_count: int
    in_flight_count: int
    consecutive_no_new_cluster: int
    new_cluster_id: str | None = None
    reason: str = ""
    recorded_at: str = field(default_factory=utc_now)

    def to_record(self) -> dict[str, Any]:
        return {
            "event": self.event,
            "branch_id": self.branch_id,
            "scheduled_count": self.scheduled_count,
            "in_flight_count": self.in_flight_count,
            "consecutive_no_new_cluster": self.consecutive_no_new_cluster,
            "new_cluster_id": self.new_cluster_id,
            "reason": self.reason,
            "recorded_at": self.recorded_at,
        }


@dataclass(frozen=True)
class StopEvent:
    """Terminal adaptive-stop event for a node."""

    node_id: str
    scheduled_count: int
    completed_count: int
    reason: str
    decision_refs: tuple[dict[str, Any], ...]
    recorded_at: str = field(default_factory=utc_now)

    def to_record(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "node_id": self.node_id,
            "scheduled_count": self.scheduled_count,
            "completed_count": self.completed_count,
            "reason": self.reason,
            "decision_refs": copy.deepcopy(list(self.decision_refs)),
            "recorded_at": self.recorded_at,
        }


@dataclass(frozen=True)
class ResearchLineage:
    """Lineage from the root ForkPoint to a selected depth-one child."""

    root_fork_point_id: str
    parent_node_id: str
    child_node_id: str
    child_depth: int
    parent_snapshot_ref: str
    child_snapshot_ref: str
    source_branch_ref: str
    source_witness_ref: str | None = None

    def __post_init__(self) -> None:
        if self.child_depth != 1:
            raise ValueError(
                "Plan 007 child lineage must start from a completed depth-one child"
            )
        required = {
            "root_fork_point_id": self.root_fork_point_id,
            "parent_node_id": self.parent_node_id,
            "child_node_id": self.child_node_id,
            "parent_snapshot_ref": self.parent_snapshot_ref,
            "child_snapshot_ref": self.child_snapshot_ref,
            "source_branch_ref": self.source_branch_ref,
        }
        missing = [key for key, value in required.items() if not value]
        if missing:
            raise ValueError(f"research lineage missing {missing}")

    def to_record(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "root_fork_point_id": self.root_fork_point_id,
            "parent_node_id": self.parent_node_id,
            "child_node_id": self.child_node_id,
            "child_depth": self.child_depth,
            "parent_snapshot_ref": self.parent_snapshot_ref,
            "child_snapshot_ref": self.child_snapshot_ref,
            "source_branch_ref": self.source_branch_ref,
            "source_witness_ref": self.source_witness_ref,
        }


@dataclass(frozen=True)
class DepthTwoRunRecord:
    """Plan 007 depth-two execution summary."""

    run_id: str
    child_node_id: str
    status: DepthTwoRunStatus
    branch_budget: int
    scheduled_branch_refs: tuple[str, ...] = ()
    completed_branch_refs: tuple[str, ...] = ()
    stop_event_ref: str | None = None
    blocker: str | None = None
    measured_values: dict[str, Any] | None = None
    recorded_at: str = field(default_factory=utc_now)

    def __post_init__(self) -> None:
        if not self.run_id or not self.child_node_id:
            raise ValueError("depth-two run requires run_id and child_node_id")
        if not 1 <= self.branch_budget <= 8:
            raise ValueError("Plan 007 depth-two branch budget must be between 1 and 8")
        if len(self.scheduled_branch_refs) > self.branch_budget:
            raise ValueError("scheduled branch refs exceed branch budget")
        if len(set(self.scheduled_branch_refs)) != len(self.scheduled_branch_refs):
            raise ValueError("scheduled depth-two branch refs must be unique")
        if len(set(self.completed_branch_refs)) != len(self.completed_branch_refs):
            raise ValueError("completed depth-two branch refs must be unique")
        unscheduled_completed = set(self.completed_branch_refs).difference(
            self.scheduled_branch_refs
        )
        if unscheduled_completed:
            raise ValueError("completed depth-two branch refs must have been scheduled")
        if self.status == "completed" and not self.completed_branch_refs:
            raise ValueError("completed depth-two run requires completed branch refs")
        if self.status == "completed" and not self.measured_values:
            raise ValueError("completed depth-two run requires measured values")
        if self.status == "blocked" and not self.blocker:
            raise ValueError("blocked depth-two run requires blocker text")

    def to_record(self) -> dict[str, Any]:
        record = {
            "schema_version": 1,
            "run_id": self.run_id,
            "child_node_id": self.child_node_id,
            "status": self.status,
            "branch_budget": self.branch_budget,
            "scheduled_branch_refs": list(self.scheduled_branch_refs),
            "completed_branch_refs": list(self.completed_branch_refs),
            "stop_event_ref": self.stop_event_ref,
            "blocker": self.blocker,
            "measured_values": copy.deepcopy(self.measured_values),
            "recorded_at": self.recorded_at,
        }
        record["content_digest"] = digest_json(record)
        return record


@dataclass(frozen=True)
class CapabilityGateRecord:
    """Exactly-one-outcome Memory/VM capability gate."""

    profile: Literal["memory", "vm"]
    outcome: CapabilityOutcome
    probe_ref: str
    task_need_ref: str | None
    security_ref: str | None
    consumed_path_ref: str | None = None
    durable_conversion_ref: str | None = None
    recorded_at: str = field(default_factory=utc_now)

    def to_record(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "profile": self.profile,
            "outcome": self.outcome,
            "probe_ref": self.probe_ref,
            "task_need_ref": self.task_need_ref,
            "security_ref": self.security_ref,
            "consumed_path_ref": self.consumed_path_ref,
            "durable_conversion_ref": self.durable_conversion_ref,
            "recorded_at": self.recorded_at,
        }


@dataclass(frozen=True)
class FlatComparisonReport:
    """Measured or explicitly not-measured state-branch versus flat restart report."""

    status: MeasurementStatus
    protocol_ref: str | None
    state_branch_observations: dict[str, Any] | None = None
    flat_restart_observations: dict[str, Any] | None = None
    limitation: str | None = None

    def to_record(self) -> dict[str, Any]:
        record = {
            "schema_version": 1,
            "status": self.status,
            "protocol_ref": self.protocol_ref,
            "state_branch_observations": copy.deepcopy(self.state_branch_observations),
            "flat_restart_observations": copy.deepcopy(self.flat_restart_observations),
            "limitation": self.limitation,
        }
        record["content_digest"] = digest_json(record)
        return record


@dataclass(frozen=True)
class TransferTrainingReport:
    """Conditional transfer and training-data analysis result."""

    transfer_status: MeasurementStatus
    training_filter_status: MeasurementStatus
    real_task_refs: tuple[str, ...]
    trajectory_refs: tuple[str, ...]
    raw_vs_hardened_filter: dict[str, Any] | None = None
    limitation: str | None = None

    def to_record(self) -> dict[str, Any]:
        record = {
            "schema_version": 1,
            "transfer_status": self.transfer_status,
            "training_filter_status": self.training_filter_status,
            "real_task_refs": list(self.real_task_refs),
            "trajectory_refs": list(self.trajectory_refs),
            "raw_vs_hardened_filter": copy.deepcopy(self.raw_vs_hardened_filter),
            "limitation": self.limitation,
        }
        record["content_digest"] = digest_json(record)
        return record
