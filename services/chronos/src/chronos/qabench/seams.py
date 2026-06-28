"""Plan 003 / live-infrastructure plug-in points for the qabench benchmark.

These protocols are the ONLY coupling from Plan 008 to Plan 003's in-flux
``witnesses`` package and to live HUD/Modal infrastructure. They are stubbed as
``NotWired*`` defaults so the 003-independent scaffold (referee logic, scorer,
importer planning) builds and tests today; wire the real implementations after
Plan 003 merges and after the ``envs/qabench/**`` task envs are materialized.

Wiring map (do these when 003 lands / envs exist):
  * Deduplicator       -> Plan 003 target+mechanism dedup (chronos.witnesses),
                          or keep TargetMechanismDeduplicator as the frozen default.
  * DiscoveryDriver    -> chronos.witnesses.branch_runs (base + Hacker BranchRuns).
  * CleanVerifyRunner  -> the 008-owned sterile sandbox over a materialized env.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Protocol, runtime_checkable

from chronos.qabench.models import ConfirmedHack, DiscoveredBranch


class NotWiredError(NotImplementedError):
    """Raised when a deferred seam is used before it is wired."""


@runtime_checkable
class Deduplicator(Protocol):
    """Frozen, symmetric target+mechanism dedup applied identically to QA's and
    Chronos's confirmed hacks. Reading which method surfaced a hack would be
    score-running and is forbidden."""

    def cluster_key(self, hack: ConfirmedHack) -> str: ...


@runtime_checkable
class DiscoveryDriver(Protocol):
    """Runs/loads the Plan 003 discovery population (base rollout + Hacker
    BranchRuns) and returns DiscoveredBranch records — reward + HUD QA + lineage,
    but NO referee verdict (008's referee adjudicates separately). The OFFLINE
    benchmark path is implemented in
    ``witness_loop_adapter.RecordedBatchDiscoveryDriver`` over recorded 003 batch
    artifacts; the LIVE in-loop hook (WP6) wires ``NotWiredLiveDiscoveryDriver``."""

    def run_discovery_tree(self, task_id: str) -> Sequence[DiscoveredBranch]: ...


@runtime_checkable
class CleanVerifyRunner(Protocol):
    """Runs the sterile clean_verify referee against a rewarded trajectory's
    resulting workspace in a clean sandbox isolated from agent-planted files
    (conftests, plugins, cached state). Returns True iff clean_verify passed."""

    def run(self, workspace_ref: str) -> bool: ...


def _normalize(value: str | None) -> str | None:
    """Lowercase/trim a target or mechanism; missing or blank becomes None.

    Returning None (a JSON ``null`` in the key) keeps "no value" distinct from a
    real value that happens to read ``unknown`` or ``none``.
    """
    if value is None:
        return None
    value = value.strip().lower()
    return value or None


class TargetMechanismDeduplicator:
    """Default frozen dedup: group confirmed hacks by (target, mechanism).

    Symmetric by construction — it never reads which method surfaced a hack — so
    it cannot be score-run. Swap for Plan 003's dedup behind ``Deduplicator`` if
    exact parity with the witness loop is required before scoring.
    """

    def cluster_key(self, hack: ConfirmedHack) -> str:
        # JSON-encode the pair so the key is unambiguous: a plain "target::mech"
        # join collides when a value contains "::" (e.g. ("a","b::c") vs
        # ("a::b","c")), which would merge distinct exploit mechanisms.
        return json.dumps(
            [_normalize(hack.exploit_target), _normalize(hack.exploit_mechanism)],
            separators=(",", ":"),
        )


class NotWiredLiveDiscoveryDriver:
    """Placeholder for the LIVE in-loop discovery hook (WP6); raises until wired.

    The OFFLINE benchmark path is already implemented in
    ``witness_loop_adapter.RecordedBatchDiscoveryDriver`` over recorded 003 batch
    artifacts — use that for scoring. Wire this only for the live dual-verdict hook
    against ``chronos.witnesses.branch_runs`` once Plan 003 is merged.
    """

    def run_discovery_tree(self, task_id: str) -> Sequence[DiscoveredBranch]:
        raise NotWiredError(
            "Live DiscoveryDriver is not wired. The offline benchmark uses "
            "witness_loop_adapter.RecordedBatchDiscoveryDriver over recorded 003 "
            "batch artifacts; wire this only for the live in-loop hook (WP6) to "
            f"chronos.witnesses.branch_runs for task {task_id!r}."
        )


class NotWiredCleanVerifyRunner:
    """Placeholder until ``envs/qabench/**`` exists; raises a clear wiring pointer."""

    def run(self, workspace_ref: str) -> bool:
        raise NotWiredError(
            "CleanVerifyRunner is not wired. Implement the sterile clean_verify "
            "sandbox once qabench task envs are materialized (Plan 008 WP1/WP3); "
            f"workspace_ref={workspace_ref!r}."
        )
