"""Rollout layer (flywheel box ②): sample K completions per task across multiple models, score
each via injected rewards (naive / hardened / oracle), emit the locked-seam JSONL dataset that
the best-of-K gap logic consumes."""

from .dataset import (
    Rollout,
    RolloutReport,
    generate_rollouts,
    generate_seed_rollouts,
    load_jsonl,
    stream_rollouts,
    write_jsonl,
)
from .models import (
    DEFAULT_MODELS,
    Model,
    build_models,
    build_rg_models,
    build_rg_pressure_models,
    pressure_models,
    red_models,
)
from .scorers import mock_scorers, real_scorers, rg_real_scorers

__all__ = [
    "DEFAULT_MODELS",
    "Model",
    "Rollout",
    "RolloutReport",
    "build_models",
    "build_rg_models",
    "build_rg_pressure_models",
    "pressure_models",
    "generate_rollouts",
    "generate_seed_rollouts",
    "load_jsonl",
    "mock_scorers",
    "real_scorers",
    "rg_real_scorers",
    "red_models",
    "stream_rollouts",
    "write_jsonl",
]
