"""FactoryRun — a long-horizon rolling operations sim (Vending-Bench-style).

Vending-Bench 2 scores a model on its bank balance after running a business for a
year. FactoryRun is the manufacturing analogue: the brain runs a factory floor
day by day. Each day brings fresh, stochastic work and disruptions (new jobs,
breakdowns, absences, late material). The brain must commit a *feasible* daily
plan; revenue minus costs (and a daily overhead fee) accrues to a bank balance.

The point of the generator: it separates a verifier-gated brain from a raw planner
over a long horizon. A feasible plan banks its profit; an infeasible day scraps
work and bleeds cash. Like Vending-Bench, small per-day differences compound into
a large balance gap — and a bad agent goes bankrupt.

    from src.rolling_sim import run_rolling_sim
    run_rolling_sim(seed=0, days=90, repair=True)   # verifier-gated brain
    run_rolling_sim(seed=0, days=90, repair=False)  # raw planner (no repair)
"""

from __future__ import annotations

import random

from .generator import generate_state, corrupt_plan
from .baselines import greedy
from .repair_loop import repair_loop
from .verifier import evaluate

STARTING_CASH = 5000.0
DAILY_FEE = 400.0          # floor overhead per day (rent, power, idle labor)
SCRAP_PER_VIOLATION = 1600.0  # an infeasible op is a stoppage / safety incident — costly
BANKRUPT_DAYS = 10         # bankrupt if cash < 0 for this many consecutive days


def run_rolling_sim(seed: int = 0, days: int = 90, repair: bool = True,
                    op_selector=None, K: int = 120) -> dict:
    """Roll the floor day by day. `repair` uses the verifier-gated loop; pass an
    `op_selector` (e.g. a trained TRM's pick_op) to drive repair with a learned
    policy under a fixed compute budget `K` — a better policy fixes more days
    within budget, so its bank balance compounds higher."""
    rng = random.Random(seed)
    cash = STARTING_CASH
    traj = []
    neg_streak = 0
    bankrupt_day = None
    for d in range(days):
        # the day's work: a few jobs on a 1-day horizon, with the generator's
        # built-in disruptions (breakdowns / absences / late material).
        n_jobs = rng.randint(3, 7)
        # each step is a short planning window (the day's incoming batch).
        state = generate_state(seed=seed * 1009 + d, horizon_days=7, n_jobs=n_jobs)
        if repair:
            plan, _ = repair_loop(state, greedy(state), K=K, op_selector=op_selector)
        else:
            plan = corrupt_plan(state, greedy(state), seed=d, n_corruptions=4)  # raw
        res = evaluate(state, plan)
        m = res.metrics
        # bankable profit only from a feasible plan; infeasible ops are scrapped.
        day_profit = float(m["profit"]) - DAILY_FEE - SCRAP_PER_VIOLATION * res.n_hard
        cash += day_profit
        traj.append({"day": d, "cash": round(cash), "profit": round(day_profit),
                     "feasible": res.n_hard == 0, "violations": res.n_hard})
        neg_streak = neg_streak + 1 if cash < 0 else 0
        if neg_streak >= BANKRUPT_DAYS:
            bankrupt_day = d
            break
    return {
        "days": days, "ran_days": len(traj), "repair": repair,
        "final_cash": round(cash), "bankrupt": bankrupt_day is not None,
        "bankrupt_day": bankrupt_day,
        "feasible_rate": round(sum(t["feasible"] for t in traj) / max(1, len(traj)), 3),
        "trajectory": traj,
    }


def compare(seed: int = 0, days: int = 90) -> dict:
    """Verifier-gated brain vs raw planner over the same horizon (the headline)."""
    return {"days": days,
            "brain": run_rolling_sim(seed, days, repair=True),
            "naive": run_rolling_sim(seed, days, repair=False)}
