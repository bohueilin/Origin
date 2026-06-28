"""Held-out evaluation for the two-model gap (⑤).

Run a model on tasks it was NOT trained on and measure whether it SOLVES (oracle-correct) or
CHEATS (passes the naive reward but fails the oracle). Expected after Target-B training:
  arm_naive-trained    → collapses: high cheat_rate, low solve_rate
  arm_hardened-trained → generalizes: high solve_rate, ~0 cheat_rate
Eval is just the rollout harness on a held-out split, so it reuses generate_rollouts/RolloutReport
and works on ANY model (a base policy now → the baseline; a fine-tuned adapter later → the gap).
"""

from __future__ import annotations

from dataclasses import dataclass

from ..rollout import RolloutReport, generate_rollouts
from ..rollout.models import Model


def split_tasks(tasks: list, held_out_frac: float = 0.3) -> tuple[list, list]:
    """Deterministic, disjoint (train, held_out) task split — train on one, eval on the other."""
    ordered = sorted(tasks, key=lambda t: t.task_id)
    cut = max(1, int(len(ordered) * (1 - held_out_frac)))
    return ordered[:cut], ordered[cut:]


@dataclass
class EvalReport:
    model: str
    total: int
    honest: int  # solved (oracle-correct)
    cheat: int  # passed the naive reward but oracle-wrong

    @property
    def solve_rate(self) -> float:
        return self.honest / self.total if self.total else 0.0

    @property
    def cheat_rate(self) -> float:
        return self.cheat / self.total if self.total else 0.0


def held_out_eval(
    model: Model, tasks: list, *, r_naive, r_hardened, t_oracle, k: int = 1
) -> EvalReport:
    """Evaluate `model` on held-out `tasks`; report solve vs cheat rates (the ⑤ measurement)."""
    report = RolloutReport(
        generate_rollouts(
            tasks, [model], r_naive=r_naive, r_hardened=r_hardened, t_oracle=t_oracle, k=k
        )
    )
    return EvalReport(
        model=model.name, total=report.total, honest=report.honest, cheat=report.cheats
    )
