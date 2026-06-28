"""Reference agents for the FactoryCEO HUD Taskset (offline, no HUD key).

Each agent maps a FactoryState -> ActionPlan. Mirrors the template's
example_agent: scripted policies you grade against the tasks. The LLM/TRM
gateway agents for the real HUD cloud run live in distill/hud_trm_agent.py.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.schemas import FactoryState, ActionPlan
from src.baselines import greedy, base_plan
from src.generator import corrupt_plan
from src.repair_loop import repair_loop


def agent_naive(state: FactoryState) -> ActionPlan:
    """Direct plan, no repair — the 'frontier LLM out of the box' analogue."""
    return corrupt_plan(state, greedy(state), seed=0, n_corruptions=6)


def agent_greedy(state: FactoryState) -> ActionPlan:
    """EDD scheduler, no repair loop."""
    return greedy(state)


def agent_trm(state: FactoryState) -> ActionPlan:
    """Verifier-gated brain: greedy backbone + recursive verify->repair (the TRM
    loop, rule-based selector — the guaranteed-feasible floor)."""
    final, _ = repair_loop(state, greedy(state), K=120)
    return final


AGENTS = {"naive": agent_naive, "greedy": agent_greedy, "trm": agent_trm}
