"""Adaptive depth-two scheduling policy."""

from __future__ import annotations

from .models import SchedulerConfig, SchedulerDecision, StopEvent


class ResearchScheduler:
    """Deterministic Plan 007 scheduler for one child node."""

    def __init__(
        self,
        *,
        node_id: str,
        node_depth: int = 1,
        config: SchedulerConfig | None = None,
    ):
        if node_depth != 1:
            raise ValueError(
                "Plan 007 scheduler can only expand a completed depth-one child"
            )
        if not node_id or not isinstance(node_id, str):
            raise ValueError("Plan 007 scheduler requires a non-empty node_id")
        self.node_id = node_id
        self.node_depth = node_depth
        self.config = config or SchedulerConfig()
        self._scheduled: list[str] = []
        self._completed: list[str] = []
        self._in_flight: set[str] = set()
        self._clusters_seen: set[str] = set()
        self._consecutive_no_new_cluster = 0
        self._decisions: list[SchedulerDecision] = []
        self._stopped_reason: str | None = None

    @property
    def decisions(self) -> tuple[SchedulerDecision, ...]:
        return tuple(self._decisions)

    @property
    def scheduled_count(self) -> int:
        return len(self._scheduled)

    @property
    def completed_count(self) -> int:
        return len(self._completed)

    @property
    def in_flight_count(self) -> int:
        return len(self._in_flight)

    @property
    def consecutive_no_new_cluster(self) -> int:
        return self._consecutive_no_new_cluster

    def can_schedule(self) -> bool:
        if self._stopped_reason is not None:
            return False
        if len(self._scheduled) >= self.config.child_budget:
            return False
        if len(self._in_flight) >= self.config.concurrency:
            return False
        return self._consecutive_no_new_cluster < self.config.no_new_cluster_limit

    def schedule_next(self) -> SchedulerDecision | None:
        if not self.can_schedule():
            self._refresh_stop_reason()
            return None
        branch_id = f"{self.node_id}-depth2-{len(self._scheduled):02d}"
        self._scheduled.append(branch_id)
        self._in_flight.add(branch_id)
        decision = self._record(
            "scheduled", branch_id, reason="budget and concurrency permit scheduling"
        )
        return decision

    def complete_branch(
        self, branch_id: str, *, confirmed_cluster_id: str | None
    ) -> SchedulerDecision:
        if branch_id not in self._in_flight:
            raise ValueError(f"branch is not in flight: {branch_id}")
        self._in_flight.remove(branch_id)
        self._completed.append(branch_id)

        if confirmed_cluster_id and confirmed_cluster_id not in self._clusters_seen:
            self._clusters_seen.add(confirmed_cluster_id)
            self._consecutive_no_new_cluster = 0
            decision = self._record(
                "completed-new-cluster",
                branch_id,
                new_cluster_id=confirmed_cluster_id,
                reason="confirmed QA/dedup cluster resets the adaptive stop counter",
            )
        else:
            self._consecutive_no_new_cluster += 1
            decision = self._record(
                "completed-no-new-cluster",
                branch_id,
                new_cluster_id=confirmed_cluster_id,
                reason="completion did not add a confirmed new QA/dedup cluster",
            )
        self._refresh_stop_reason()
        return decision

    def stop_event(self) -> StopEvent | None:
        self._refresh_stop_reason()
        if self._stopped_reason is None:
            return None
        return StopEvent(
            node_id=self.node_id,
            scheduled_count=len(self._scheduled),
            completed_count=len(self._completed),
            reason=self._stopped_reason,
            decision_refs=tuple(decision.to_record() for decision in self._decisions),
        )

    def _refresh_stop_reason(self) -> None:
        if self._stopped_reason == "budget-exhausted":
            return
        if len(self._scheduled) >= self.config.child_budget and not self._in_flight:
            self._stopped_reason = "budget-exhausted"
            return
        if self._consecutive_no_new_cluster >= self.config.no_new_cluster_limit:
            if self._in_flight:
                self._stopped_reason = None
                return
            self._stopped_reason = "adaptive-stop-four-no-new-cluster"

    def _record(
        self,
        event: str,
        branch_id: str | None,
        *,
        new_cluster_id: str | None = None,
        reason: str = "",
    ) -> SchedulerDecision:
        decision = SchedulerDecision(
            event=event,
            branch_id=branch_id,
            scheduled_count=len(self._scheduled),
            in_flight_count=len(self._in_flight),
            consecutive_no_new_cluster=self._consecutive_no_new_cluster,
            new_cluster_id=new_cluster_id,
            reason=reason,
        )
        self._decisions.append(decision)
        return decision
