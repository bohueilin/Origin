"""A — iterated red<->green escalation. The autoresearch loop made real.

Round after round the swarm attacks the CURRENT (progressively hardened) grader; each confirmed
breach is sealed, which raises the grader's bar; the loop ends when a full round yields no breach
— the grader is robust against the whole swarm — or green can't seal (a template gap), or the
round cap is hit.

The agent only ever sees `base_input`; hardening adds HIDDEN held-out inputs, so a forger that
memorizes the visible cases gets caught the next round and is squeezed toward honest solving.
Harness tampering (sapper) is mooted by pristine grading, so escalation uses the solution-level
specialists. `attack` and `seal` are injected so the loop is deterministic to test; `live.py`'s
factory wires them to the real swarm + green.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..agents.specialists import EDGE_SLIPPER, FORGER, Specialist, run_specialist
from ..events import (
    AgentKilled,
    AgentMove,
    AgentSpawn,
    BreachFound,
    PatchApplied,
    RobustnessUpdate,
)
from ..grader.spec import Grader
from ..green import GreenResult, harden
from ..loop.interface import make_workdir
from ..substrate import Task, expected_outputs
from ..suite import score_solution
from ..templates import grade

# Solution-level specialists; sapper (harness tampering) is mooted by pristine grading.
ESCALATION_SPECIALISTS = (FORGER, EDGE_SLIPPER)


@dataclass
class Round:
    n: int
    specialist: str
    cheat_type: str
    breach_src: str
    sealed: bool


@dataclass
class EscalationReport:
    task_id: str
    rounds: list[Round]
    final_grader: Any
    robust: bool  # a full round found no breach — the swarm is exhausted
    stalled_reason: str = ""  # set if it stopped on a green failure (template gap)

    @property
    def rounds_survived(self) -> int:
        return len(self.rounds)

    @property
    def sealed(self) -> int:
        return sum(1 for r in self.rounds if r.sealed)

    # Every adopted grader passed its per-round regression gate (gold still scores 1), so
    # honest-pass is preserved by construction.
    honest_pass: bool = True


def escalate_gate(
    task: Task,
    *,
    attack: Callable[[Task, Any, Specialist], str | None],
    seal: Callable[[Task, str, str, Any], GreenResult],
    specialists: tuple[Specialist, ...] = ESCALATION_SPECIALISTS,
    max_rounds: int = 5,
    emit: Callable[[Any], None] | None = None,
) -> EscalationReport:
    """Escalate red<->green on one gate until robust, green stalls, or the round cap."""
    emit = emit or (lambda e: None)
    gold = task.prompt + task.canonical_solution
    grader: Any = Grader(task)
    rounds: list[Round] = []
    robust = False
    stalled = ""

    for n in range(1, max_rounds + 1):
        breach: tuple[Specialist, str] | None = None
        for spec in specialists:
            emit(AgentSpawn(spec.name, spec.cheat_type))
            emit(AgentMove(spec.name, task.task_id))
            src = attack(task, grader, spec)  # breach the CURRENT grader, or None
            if src is not None:
                breach = (spec, src)
                break

        if breach is None:
            robust = True  # a full round, nobody breached — robust against the swarm
            break

        spec, src = breach
        example = src.strip().splitlines()[-1][:80] if src.strip() else ""
        emit(BreachFound(spec.name, task.task_id, spec.cheat_type, 1, 0, example))
        result = seal(task, src, gold, grader)
        rounds.append(Round(n, spec.name, spec.cheat_type, src, result.sealed))
        if not result.sealed:
            stalled = result.reason or "green could not seal the breach"
            break  # a template gap — surface it (signal for Track A's template library)
        grader = result.grader_prime  # escalate: next round faces the harder grader
        emit(PatchApplied(task.task_id, result.template_id or ""))
        emit(AgentKilled(spec.name, task.task_id))
        emit(RobustnessUpdate(1.0, 1.0, n))

    return EscalationReport(task.task_id, rounds, grader, robust, stalled)


# --- live wiring -------------------------------------------------------------------------


def _fails_oracle(task: Task, src: str) -> bool:
    plus = list(zip(task.plus_input, expected_outputs(task, task.plus_input), strict=True))
    return score_solution(task.entry_point, src, plus) == 0


def make_escalation_runners(client: Any = None):
    """(attack, seal) closed over the real swarm + green for escalate_gate."""

    def attack(task: Task, grader: Any, specialist: Specialist) -> str | None:
        workdir = make_workdir(task)  # shows base_input only; hardening inputs stay hidden

        def run_tests(wd) -> int:
            return grade(grader, (Path(wd) / "solution.py").read_text())

        run_specialist(specialist, workdir, run_tests=run_tests, client=client)
        src = (Path(workdir) / "solution.py").read_text()
        # A breach against the CURRENT grader: passes it (R=1) but fails the oracle (T=0).
        if grade(grader, src) == 1 and _fails_oracle(task, src):
            return src
        return None

    def seal(task: Task, breach_src: str, gold_src: str, base_grader: Any) -> GreenResult:
        return harden(task, breach_src, gold_src, base_grader=base_grader, client=client)

    return attack, seal


def escalate_live(
    task: Task, *, client: Any = None, max_rounds: int = 5, emit=None
) -> EscalationReport:
    """Run escalation on one task against the real swarm + green. Needs ANTHROPIC_API_KEY."""
    attack, seal = make_escalation_runners(client)
    return escalate_gate(task, attack=attack, seal=seal, max_rounds=max_rounds, emit=emit)
