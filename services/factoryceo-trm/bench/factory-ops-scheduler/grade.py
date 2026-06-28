"""Shared, deterministic grader for the factory-ops-scheduler bench.

The verifier is FactoryCEO's own `evaluate()` — the same hard-constraint checker
the product uses — so pass/fail is unambiguous and reproducible:

  PASS  ⇔  the submitted ActionPlan is schema-valid
           AND has ZERO hard violations (feasible, executable)
           AND reaches at least `quality_frac` of the oracle's verifier reward.

A frontier model that emits a plausible-but-infeasible schedule (overlapping
machines, unavailable operators, material that arrives after the op, hallucinated
ids, broken precedence) fails on the hard-violation gate — which is exactly the
capability gap this task surfaces. The reward floor stops a trivially-feasible
but value-destroying plan from passing.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# make the FactoryCEO engine importable (factoryceo_trm/)
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from src.schemas import FactoryState, ActionPlan          # noqa: E402
from src.verifier import evaluate                          # noqa: E402
from src.baselines import greedy                           # noqa: E402
from src.repair_loop import repair_loop                    # noqa: E402

HERE = Path(__file__).resolve().parent


def load_state(path: str | Path | None = None) -> FactoryState:
    p = Path(path) if path else HERE / "fixtures" / "state.json"
    return FactoryState.model_validate(json.loads(Path(p).read_text()))


def oracle_plan(state: FactoryState) -> ActionPlan:
    """Human-expert-equivalent ground truth: the deterministic scheduler plus the
    recursive repair loop. Guaranteed feasible."""
    final, _ = repair_loop(state, greedy(state), K=80)
    return final


def grade_plan(state: FactoryState, plan: ActionPlan, oracle_reward: float,
               quality_frac: float = 0.6) -> dict:
    res = evaluate(state, plan)
    feasible = res.n_hard == 0
    quality = res.reward >= quality_frac * oracle_reward
    return {
        "passed": bool(feasible and quality),
        "feasible": bool(feasible),
        "hard_violations": res.n_hard,
        "reward": res.reward,
        "oracle_reward": oracle_reward,
        "reward_ratio": (res.reward / oracle_reward) if oracle_reward else 0.0,
        "quality_ok": bool(quality),
        "errors": [e.type for e in res.errors][:20],
    }


def parse_plan(text_or_obj) -> ActionPlan:
    """Accept a dict, a JSON string, or a model response with surrounding prose."""
    if isinstance(text_or_obj, dict):
        return ActionPlan.model_validate(text_or_obj)
    s = str(text_or_obj)
    start, end = s.find("{"), s.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in response")
    return ActionPlan.model_validate(json.loads(s[start:end + 1]))
