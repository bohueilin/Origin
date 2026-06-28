"""Offline eval runner for the FactoryCEO HUD Taskset.

The worldsim-template analogue of `hud eval tasks.py <agent> --all`: reset each
task, drive it with each agent, grade with partial credit, and print the per-task
breakdown + a leaderboard. Runs in the plain venv with NO HUD key and NO credits
(grading is our deterministic verifier). The graded CLOUD rollout (HUD Runs,
gateway LLMs) is distill/hud_run.py on .venv-hud.

    python distill/hud/eval.py                 # all agents x all tasks
    python distill/hud/eval.py --agent trm     # one agent
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from distill.hud.tasks import TASKS, partial_credit
from distill.hud.agents import AGENTS


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--agent", choices=list(AGENTS), default=None)
    args = ap.parse_args()
    agents = {args.agent: AGENTS[args.agent]} if args.agent else AGENTS

    print(f"{'task':16} {'horizon':>7} {'jobs':>4} | " +
          " | ".join(f"{a:>20}" for a in agents))
    totals = {a: 0.0 for a in agents}
    for t in TASKS:
        t.reset()
        op = t.oracle_profit()
        cells = []
        for a, fn in agents.items():
            pc = partial_credit(t.state, fn(t.state), op)
            totals[a] += pc["total"]
            mark = "ok " if pc["feasible"] else "BAD"
            cells.append(f"{pc['total']:.2f} {mark} ot{pc['on_time']:.2f} hv{pc['hard_violations']}")
        print(f"{t.id:16} {t.horizon_days:>5}d {t.n_jobs:>4} | " + " | ".join(f"{c:>20}" for c in cells))

    n = len(TASKS)
    print("\nLeaderboard (mean partial credit over the Taskset):")
    for a, s in sorted(totals.items(), key=lambda kv: -kv[1]):
        print(f"  {a:8} {s / n:.3f}")


if __name__ == "__main__":
    main()
