"""Live in-loop discovery driver (Plan 008 WP6).

Wires the benchmark's ``DiscoveryDriver`` seam to Plan 003's real branch loop for a
materialized qabench env: ``branch_runs`` selects its task entirely from the ForkPoint's
``hud_task_profile`` (env module, factory, prompt, grader surface), so the driver ensures
the captured ForkPoint carries that profile, sets the still-honored
``FORKPROOF_BRANCH_STATE_ROOTS`` override, runs a live seeded BranchRun batch, then maps
the batch's recorded artifacts to ``DiscoveredBranch`` records using the SAME,
already-validated offline mapper (``witness_loop_adapter.load_branches``) — so the
live and recorded paths produce identical records, with NO referee verdict (the 008
sterile referee adjudicates separately).

This module DOES import the live ``chronos.witnesses`` package; the offline
``witness_loop_adapter`` deliberately does not. The Modal/HUD batch is real spend and
requires credentials plus ``FORKPROOF_ALLOW_EXTERNAL_QA=1`` (enforced by branch_runs).
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from chronos.qabench.models import DiscoveredBranch
from chronos.qabench.modal_runtime import qabench_task_profile
from chronos.qabench.witness_loop_adapter import load_branches
from chronos.witnesses.branch_runs import _artifact_root, run_live_branch_batch

BatchRunner = Callable[..., dict[str, Any]]
ArtifactResolver = Callable[[Path, str], Path]


class LiveDiscoveryBlocked(RuntimeError):
    """Raised when the live batch is blocked (missing creds / unapproved QA export)."""

    def __init__(self, message: str, summary: dict[str, Any]) -> None:
        super().__init__(message)
        self.summary = summary


def _default_batch_runner(
    root: Path, forkpoint: dict[str, Any], *, count: int, concurrency: int
) -> dict[str, Any]:
    return asyncio.run(
        run_live_branch_batch(root, forkpoint, count=count, concurrency=concurrency)
    )


@dataclass
class LiveDiscoveryDriver:
    """Run a live BranchRun batch for one qabench env and return DiscoveredBranches.

    ``env_rel`` is the env.py path (repo-root-relative, e.g.
    ``envs/qabench/<slug>/env.py``); ``forkpoint`` is the task's captured ForkPoint
    record. ``batch_runner`` / ``artifact_resolver`` are injectable for testing.
    """

    root: Path
    env_rel: str
    forkpoint: dict[str, Any]
    factory: str = "build_task"
    count: int = 12
    concurrency: int = 12
    state_roots: tuple[str, ...] = field(default_factory=tuple)
    batch_runner: BatchRunner = _default_batch_runner
    artifact_resolver: ArtifactResolver = _artifact_root

    def _task_forkpoint(self) -> dict[str, Any]:
        """The ForkPoint branch_runs forks from, guaranteed to carry hud_task_profile.

        New captures embed the profile already (``forkpoint_dict``); an older or hand-built
        ForkPoint is backfilled from the driver's env path + factory so the live path stays
        correct regardless of capture vintage.
        """
        forkpoint = dict(self.forkpoint)
        if "hud_task_profile" not in forkpoint:
            forkpoint["hud_task_profile"] = qabench_task_profile(
                self.env_rel, factory=self.factory
            )
        return forkpoint

    def _apply_state_roots(self) -> None:
        # branch_runs no longer reads a task-selection env contract (that comes from the
        # ForkPoint's hud_task_profile); FORKPROOF_BRANCH_STATE_ROOTS is still honored as
        # the writable-root override. Set it for a task that needs non-/app roots, and
        # clear it otherwise so a previous task's roots never leak into this one (the
        # ForkPoint's own task_state_roots stay authoritative when there is no override).
        if self.state_roots:
            os.environ["FORKPROOF_BRANCH_STATE_ROOTS"] = ",".join(self.state_roots)
        else:
            os.environ.pop("FORKPROOF_BRANCH_STATE_ROOTS", None)

    def run_discovery_tree(self, task_id: str) -> Sequence[DiscoveredBranch]:
        self._apply_state_roots()
        summary = self.batch_runner(
            self.root,
            self._task_forkpoint(),
            count=self.count,
            concurrency=self.concurrency,
        )
        # A batch that produced a run_id wrote branch artifacts even if its status is
        # "blocked" by the strict Witness-promotion gates (e.g. not every branch
        # crossed the execution boundary, or provenance blockers). The benchmark scores
        # whatever rewarded branches were discovered; only a TRUE pre-run block (missing
        # creds / unapproved QA export, which returns no run_id) is fatal.
        run_id = summary.get("run_id")
        if not run_id:
            raise LiveDiscoveryBlocked(
                summary.get("observed_behavior")
                or "live branch batch blocked before running",
                summary,
            )
        artifact_dir = self.artifact_resolver(self.root, run_id)
        return load_branches(artifact_dir, task_id=task_id)
