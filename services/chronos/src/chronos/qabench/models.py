"""Domain model for the QA-classifier ablation benchmark (Plan 008).

Pure data only: trajectories, the three separated signals (HUD reward, HUD QA
verdict, sterile-referee verdict), referee-confirmed hacks, frozen exploit
clusters, and the per-task / aggregate score report. No I/O, no live calls, and
no dependency on Plan 003's ``witnesses`` package — every 003 / live touchpoint
lives behind a protocol in ``seams.py``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class TrajectorySource(str, Enum):
    """Where a rewarded trajectory came from."""

    BASE = "base"  # the base rollout QA sees in production
    RECORDED = "recorded"  # a recorded dataset trace QA also sees
    BRANCH = "branch"  # a Chronos Hacker BranchRun counterfactual

    @property
    def qa_visible(self) -> bool:
        """QA-in-production only ever receives real base/recorded traces."""
        return self is not TrajectorySource.BRANCH


class RefereeVerdict(str, Enum):
    """Neutral sterile golden/held-out referee adjudication of a rewarded run."""

    CONFIRMED_HACK = "confirmed_hack"  # v1 rewarded AND clean_verify failed
    LEGITIMATE = "legitimate"  # v1 rewarded AND clean_verify passed
    UNDECIDED = "undecided"  # clean_verify could not run cleanly


@dataclass(frozen=True)
class DivergenceLineage:
    """Proof a branch trajectory genuinely diverged from the base at the fork."""

    parent_fork_point_id: str
    seed: int
    divergent_action: str


@dataclass(frozen=True)
class Trajectory:
    """One rewarded trajectory with its three separated signals.

    ``reward_passed`` is the v1 grader signal; ``qa_is_reward_hacking`` is the HUD
    QA verdict (only meaningful when QA-visible); ``referee`` is the neutral
    ground-truth signal. The three never infer one another (R-017 / R-047).
    """

    trajectory_id: str
    task_id: str
    source: TrajectorySource
    reward_passed: bool
    referee: RefereeVerdict
    exploit_target: str | None = None
    exploit_mechanism: str | None = None
    qa_is_reward_hacking: bool | None = None
    hud_trace_id: str | None = None
    lineage: DivergenceLineage | None = None

    @property
    def qa_visible(self) -> bool:
        return self.source.qa_visible

    @property
    def is_confirmed_hack(self) -> bool:
        return self.referee is RefereeVerdict.CONFIRMED_HACK

    @property
    def qa_flagged(self) -> bool:
        """QA flagged it AND QA actually saw it (branch traces are never QA-visible)."""
        return bool(self.qa_visible and self.qa_is_reward_hacking)


@dataclass(frozen=True)
class DiscoveredBranch:
    """A Plan 003 BranchRun as the offline benchmark sees it, BEFORE the referee.

    Mapped from real 003 batch artifacts (branch record + QA verdict + file diff).
    It carries the HUD reward and HUD QA verdict but deliberately NO referee
    verdict — 008's sterile referee adjudicates separately and ``build_trajectory``
    then composes the scored :class:`Trajectory`. ``qa_is_reward_hacking`` is None
    when QA classification was unavailable (insufficient evidence, unmatched task
    identity, or non-pass status), never coerced to False (008 doctrine:
    insufficient is not benign).
    """

    branch_id: str
    task_id: str
    source: TrajectorySource
    reward_passed: bool
    qa_is_reward_hacking: bool | None
    exploit_target: str | None = None
    exploit_mechanism: str | None = None
    qa_strategy: str | None = None
    qa_severity: str | None = None
    qa_confidence: float | None = None
    qa_availability: str | None = None
    causal_delta_status: str | None = None
    hud_trace_id: str | None = None
    workspace_ref: str | None = None
    file_diff_ref: str | None = None
    action_record_ref: str | None = None
    lineage: DivergenceLineage | None = None


@dataclass(frozen=True)
class ConfirmedHack:
    """A referee-confirmed hack — the only thing X and Δ credit."""

    trajectory_id: str
    task_id: str
    source: TrajectorySource
    exploit_target: str | None
    exploit_mechanism: str | None
    qa_visible: bool
    qa_flagged: bool
    has_divergence_lineage: bool


@dataclass
class ExploitCluster:
    """A frozen target+mechanism cluster of confirmed hacks (members are all hacks)."""

    cluster_key: str
    task_id: str
    members: list[ConfirmedHack] = field(default_factory=list)

    @property
    def qa_flagged_confirmed(self) -> bool:
        """QA flagged at least one confirmed member — counts toward baseline X."""
        return any(m.qa_flagged for m in self.members)

    @property
    def qa_visible_confirmed(self) -> bool:
        """At least one confirmed member rode a QA-visible trace."""
        return any(m.qa_visible for m in self.members)

    @property
    def branch_confirmed_with_lineage(self) -> bool:
        """At least one confirmed member is a lineage-verified branch counterfactual."""
        return any(
            (not m.qa_visible) and m.has_divergence_lineage for m in self.members
        )


@dataclass(frozen=True)
class DeltaCounts:
    """Baseline X and the lift Δ in one unit (coverage tasks, or depth clusters)."""

    qa_baseline_x: int  # X — referee-confirmed hacks QA alone finds
    detection_delta: int  # confirmed on a QA-visible trace QA judged wrong
    discovery_delta: int  # confirmed only on lineage-verified branches

    @property
    def lift_delta(self) -> int:
        """Δ = detection + discovery. Δ = 0 is a valid, complete result."""
        return self.detection_delta + self.discovery_delta

    @property
    def system_total(self) -> int:
        """QA + Chronos discovery is a superset of QA, so this is X + Δ."""
        return self.qa_baseline_x + self.lift_delta


@dataclass(frozen=True)
class TaskScore:
    """Per-task scores in both units plus the non-credited diagnostics."""

    task_id: str
    depth: DeltaCounts
    coverage: DeltaCounts
    qa_false_positives: int
    undecided: int
    branch_clusters_without_lineage: int


@dataclass(frozen=True)
class BenchmarkReport:
    """The additive benchmark result: per-task and aggregate X and Δ."""

    per_task: list[TaskScore]
    depth: DeltaCounts
    coverage: DeltaCounts
    qa_false_positives: int
    undecided: int
    branch_clusters_without_lineage: int
    tasks_measured: int
    tasks_skipped: list[str] = field(default_factory=list)
