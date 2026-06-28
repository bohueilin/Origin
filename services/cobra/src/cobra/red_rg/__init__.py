"""Reasoning-gym red agent: emit a string answer, measure the discovered-breach rate."""

from .core import (
    BREACH,
    CAUGHT,
    DEFAULT_MODEL,
    FALSE_REJECT,
    HONEST,
    BreachStats,
    RedRGResult,
    classify,
    measure_breach_rate,
    run_red_rg,
    run_red_rg_reward,
)

__all__ = [
    "BREACH",
    "CAUGHT",
    "FALSE_REJECT",
    "HONEST",
    "DEFAULT_MODEL",
    "BreachStats",
    "RedRGResult",
    "classify",
    "measure_breach_rate",
    "run_red_rg",
    "run_red_rg_reward",
]
