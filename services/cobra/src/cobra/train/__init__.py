"""Target B (capstone) — the no-GPU data layer: expert-iteration arms from the rollout dataset.
Fine-tuning is gated on the abort line and runs on external infra (Modal/Fireworks/HUD RFT)."""

from .arms import Arm, SftExample, build_arms, write_sft
from .eval import EvalReport, held_out_eval, split_tasks

__all__ = [
    "Arm",
    "EvalReport",
    "SftExample",
    "build_arms",
    "held_out_eval",
    "split_tasks",
    "write_sft",
]
