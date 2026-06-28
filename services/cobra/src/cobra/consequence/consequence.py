"""Tier A consequence number (SPEC §9.5) — no training, on the critical path.

Reframe the discovered breach population as the damage: "train on this reward and these are
the behaviors it pays for." The number is the reward a pure-cheating policy collects, naive
grader vs hardened: the leaky reward pays out X for cheating; the hardened one pays ~0.

It's a reframing of the held-out agreement, measured on the SAME breach source as M2
(discovered_breaches with seed fallback, labeled). Per held-out cheat the reward = 1 if the
grader still accepts it, 0 if it rejects it — so reward-per-cheat = 1 - blocked-rate
(= 1 - agreement). Deterministic for the seed source; no GPU.

Dashboard exposure (coordinated with Track C / Rushil): the Tier A slot reads the locked
`robustness_update` event stream (reward = 1 - held_out_blocked; naive = first reading,
hardened = latest), NOT capability.json (that file is Tier B, the trained chart). So we
expose Tier A as `robustness_update` events via `as_robustness_updates`.
"""

import json
from dataclasses import dataclass
from pathlib import Path

from ..breadth.loop import DEFAULT_COUNT, DEFAULT_WORKERS, BreadthReport, run_breadth
from ..events import RobustnessUpdate


@dataclass
class ConsequenceReport:
    source: str
    n_cheats: int  # held-out cheats measured
    n_measurable: int  # tasks that contributed a measurable held-out split
    reward_naive_points: float  # points the naive grader pays for pure cheating
    reward_hardened_points: float  # points the hardened grader pays (~0)
    reward_naive_rate: float  # per cheat (== 1 - blocked_before)
    reward_hardened_rate: float  # per cheat (== 1 - blocked_after)
    blocked_before: float  # naive held-out block rate (agreement before)
    blocked_after: float  # hardened held-out block rate (agreement after)
    honest_pass: float


def measure_consequence(report: BreadthReport) -> ConsequenceReport:
    """Derive the consequence number from an M2 breadth report (held-out split)."""
    measurable = [r for r in report.results if r.measurable]
    n_cheats = sum(r.n_held_out for r in measurable)
    naive_points = sum(r.n_held_out * (1 - r.agreement_before) for r in measurable)
    hardened_points = sum(r.n_held_out * (1 - r.agreement_after) for r in measurable)
    blocked_before = report.mean_agreement_before or 0.0
    blocked_after = report.mean_agreement_after or 0.0
    return ConsequenceReport(
        source=report.source,
        n_cheats=n_cheats,
        n_measurable=len(measurable),
        reward_naive_points=naive_points,
        reward_hardened_points=hardened_points,
        reward_naive_rate=naive_points / n_cheats if n_cheats else 0.0,
        reward_hardened_rate=hardened_points / n_cheats if n_cheats else 0.0,
        blocked_before=blocked_before,
        blocked_after=blocked_after,
        honest_pass=report.mean_honest_pass if report.mean_honest_pass is not None else 1.0,
    )


def tier_a_payload(report: ConsequenceReport) -> dict:
    """Self-describing Tier A magnitude. `source` and `n_measurable` come from the actual run,
    so a seed run can never be presented as discovered."""
    return {
        "tier_a": {
            "naive_points": report.reward_naive_points,
            "hardened_points": report.reward_hardened_points,
            "source": report.source,
            "n_measurable": report.n_measurable,
        }
    }


def write_tier_a(report: ConsequenceReport, path) -> None:
    """Write the Tier A reward-points magnitude to its own file (NOT capability.json /
    capability_run.json — those are reserved for Tier B, the trained chart)."""
    Path(path).write_text(json.dumps(tier_a_payload(report), indent=2) + "\n")


def as_robustness_updates(c: ConsequenceReport) -> list[RobustnessUpdate]:
    """The Seam-2 events the dashboard's Tier A slot consumes.

    Tier A renders reward = 1 - held_out_blocked, taking the naive value from the FIRST
    robustness reading and the hardened value from the LATEST — so we emit before then after.
    """
    return [
        RobustnessUpdate(
            held_out_blocked=c.blocked_before, honest_pass=c.honest_pass, probes=c.n_cheats
        ),
        RobustnessUpdate(
            held_out_blocked=c.blocked_after, honest_pass=c.honest_pass, probes=c.n_cheats
        ),
    ]


def run_consequence(
    n_tasks: int = DEFAULT_COUNT, workers: int = DEFAULT_WORKERS, discover_fn=None, tasks=None
) -> ConsequenceReport:
    """Run the M2 sweep on the same breach source and reduce it to the Tier A number.

    `tasks` (e.g. load_hardest(n)) overrides the default slice so Tier A can be captured on the
    exact same set as the breadth breach run.
    """
    return measure_consequence(run_breadth(n_tasks, workers, discover_fn=discover_fn, tasks=tasks))
