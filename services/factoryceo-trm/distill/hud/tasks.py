"""Taskset for the FactoryCEO HUD environment (worldsim-template-style).

Each task is a long-horizon factory scenario (seed + horizon + disruptions). The
scorer mirrors the template's "partial-credit scoring that explains the reward
breakdown from sim state" — here the sim state is our deterministic verifier.

  reset  -> generate the scenario (FactoryState)
  drive  -> an agent returns an ActionPlan
  grade  -> partial_credit(state, plan): feasibility + on-time + safety + profit

This module is import-safe in the plain venv (no hud-python needed) so the
offline runner (distill/hud/eval.py) works with no HUD key / no credits. The
same tasks back the real HUD rollout (distill/hud_run.py) on .venv-hud.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.schemas import FactoryState, ActionPlan
from src.generator import generate_state, messy_prompt
from src.baselines import greedy
from src.repair_loop import repair_loop
from src.verifier import evaluate


@dataclass
class Task:
    id: str
    seed: int
    horizon_days: int
    n_jobs: int
    note: str
    _state: FactoryState | None = field(default=None, repr=False)

    def reset(self) -> FactoryState:
        self._state = generate_state(seed=self.seed, horizon_days=self.horizon_days, n_jobs=self.n_jobs)
        return self._state

    def prompt(self) -> str:
        return messy_prompt(self.state, seed=self.seed)

    @property
    def state(self) -> FactoryState:
        return self._state or self.reset()

    def oracle_profit(self) -> float:
        final, _ = repair_loop(self.state, greedy(self.state), K=120)
        return float(evaluate(self.state, final).metrics["profit"]) or 1.0


# A long-horizon Taskset (varied scale + horizon). `hud eval --all` analogue.
TASKS: list[Task] = [
    Task("ops-14d-light", 11, 14, 12, "two-week run, light mix"),
    Task("ops-30d-mid", 7, 30, 22, "month run, mid mix"),
    Task("ops-45d-heavy", 23, 45, 30, "six-week run, heavy mix"),
    Task("ops-60d-stress", 41, 60, 36, "long-horizon stress, dense schedule"),
]


def partial_credit(state: FactoryState, plan: ActionPlan, oracle_profit: float) -> dict:
    """Reward breakdown from verifier state (0..1 total). Feasibility dominates;
    the rest is graded continuously so a near-miss earns partial credit."""
    res = evaluate(state, plan)
    m = res.metrics
    feasible = 1.0 if res.n_hard == 0 else 0.0
    on_time = float(m["on_time_rate"])
    safe = 1.0 if m["safety_incidents"] == 0 else 0.0
    profit_norm = max(0.0, min(1.0, m["profit"] / oracle_profit)) if oracle_profit else 0.0
    total = 0.4 * feasible + 0.2 * on_time + 0.2 * safe + 0.2 * profit_norm
    return {
        "total": round(total, 3),
        "feasible": bool(res.n_hard == 0), "hard_violations": res.n_hard,
        "on_time": round(on_time, 3), "safe": bool(safe), "profit_ratio": round(profit_norm, 3),
        "components": {"feasibility": 0.4 * feasible, "on_time": 0.2 * on_time,
                       "safety": 0.2 * safe, "profit": 0.2 * profit_norm},
    }
