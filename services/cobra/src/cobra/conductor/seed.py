"""Deterministic seed siege — drive the conductor with the labeled forger seed cheat + the real
pristine+held-out hardening, so the dashboard shows a reliable breach→seal→climb with NO API key.

Why this exists: `live.py` (LLM red + LLM green) is non-deterministic and, on hard tasks, surfaces
subtle cheats the LLM green team can't seal → no climb. This path uses the deterministic forger
seed (a generic memorize-the-visible-inputs cheat STRATEGY, labeled `seed` — not a planted answer,
not claimed discovered) and the same pristine+`plus[0::2]` hardening `breadth` uses, which reliably
seals. It is the demo safety net; the LIVE path is the genuine-discovery proof (exploitability
hit-rate). Emits the same 7 Seam-2 events as live, so the dashboard can't tell them apart.
"""

from __future__ import annotations

from typing import Any

from ..breadth.cheats import forger_cheats
from ..breadth.loop import _split_plus
from ..gate import regression_gate
from ..grader.spec import Grader
from ..loop import interface
from ..metrics.agreement import honest_pass
from ..substrate import expected_outputs
from ..suite import score_solution
from ..templates import PRISTINE_HELDOUT, apply_patch, grade
from .core import ConductorReport, SealResult, run_conductor

SEED_CHEAT_TYPE = "hardcode_outputs"  # the only category with a deterministic seed cheat (forger)


def make_seed_runners():
    """Return (probe, verify, seal, regrade) closed over the deterministic seed + hardening."""

    def probe(gate: str, specialist: Any) -> dict | None:
        if specialist.cheat_type != SEED_CHEAT_TYPE:
            return None  # only the forger has a seed cheat; other cells go DEAD (honest)
        task = interface.load_task(gate)
        cheats = forger_cheats(task)
        if not cheats:
            return None
        src = cheats[0]
        harden_inputs, oracle_inputs = _split_plus(task)
        oracle_cases = list(zip(oracle_inputs, expected_outputs(task, oracle_inputs), strict=True))
        return {
            "source": src,
            "example": src.strip().splitlines()[-1][:120] if src.strip() else "",
            "task": task,
            "gold": task.prompt + task.canonical_solution,
            "harden_inputs": harden_inputs,
            "oracle_cases": oracle_cases,
        }

    def verify(gate: str, c: dict) -> bool:
        # A real breach: passes the naive grader (R=1) but fails the held-out oracle (T=0).
        naive = Grader(c["task"])
        passes_naive = grade(naive, c["source"]) == 1
        fails_oracle = score_solution(c["task"].entry_point, c["source"], c["oracle_cases"]) == 0
        return passes_naive and fails_oracle

    def seal(gate: str, c: dict) -> SealResult:
        gp = apply_patch(
            Grader(c["task"]), PRISTINE_HELDOUT, {"held_out_inputs": c["harden_inputs"]}
        )
        if regression_gate(gp, c["source"], c["gold"]):
            # Measure honest-pass on the gold under the hardened grader (real, not a constant).
            hp = honest_pass(gp, [c["gold"]])
            return SealResult(True, PRISTINE_HELDOUT, gp, honest_pass=hp)
        return SealResult(False, reason="patch did not seal the cheat without harming gold")

    def regrade(grader_prime: Any, c: dict) -> int:
        return grade(grader_prime, c["source"])

    return probe, verify, seal, regrade


def run_seed(task_ids: list[str], *, emit=None) -> ConductorReport:
    """Run the conductor deterministically over real EvalPlus tasks. No API key needed."""
    probe, verify, seal, regrade = make_seed_runners()
    return run_conductor(
        task_ids, probe=probe, verify=verify, seal=seal, regrade=regrade, emit=emit
    )
