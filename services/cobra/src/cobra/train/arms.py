"""Target B, the no-GPU half: expert-iteration / rejection-sampling data prep.

"Training on a reward" = keeping the completions that reward pays out, then SFT-ing on them.
So from the rollout dataset we build two SFT arms:
  arm_naive    = completions the NAIVE reward rewards (r_naive=1)    → honest solves AND cheats
  arm_hardened = completions the HARDENED reward rewards (r_hardened=1) → honest solves only

Train arm_naive → the model imitates cheats too (collapses on a clean eval); train arm_hardened
→ it learns the task. The gap is visible BEFORE any training: arm_naive carries a cheat fraction,
arm_hardened ~0. Actual fine-tuning (gated on the abort line) consumes these JSONL files.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

REWARDS = ("naive", "hardened")


@dataclass
class SftExample:
    task_id: str
    completion: str
    is_cheat: bool  # oracle-wrong (analysis only — never a training signal)


@dataclass
class Arm:
    name: str
    reward: str
    examples: list[SftExample]

    @property
    def size(self) -> int:
        return len(self.examples)

    @property
    def cheat_fraction(self) -> float:
        if not self.examples:
            return 0.0
        return sum(1 for e in self.examples if e.is_cheat) / len(self.examples)


def build_arms(rollouts: Iterable) -> dict[str, Arm]:
    """Split rollouts into the naive-reward and hardened-reward SFT arms (rejection sampling)."""
    rollouts = list(rollouts)
    arms: dict[str, Arm] = {}
    for reward in REWARDS:
        kept = [r for r in rollouts if getattr(r, f"r_{reward}") == 1]
        arms[reward] = Arm(
            name=f"arm_{reward}",
            reward=reward,
            examples=[SftExample(r.task_id, r.completion, r.t_oracle == 0) for r in kept],
        )
    return arms


def write_sft(arm: Arm, path: str | Path, prompts: dict[str, str] | None = None) -> Path:
    """Write an arm as SFT JSONL. With `prompts` (task_id -> prompt) emit {prompt, completion};
    otherwise {task_id, completion} (prompt joined at train time)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for ex in arm.examples:
            if prompts is not None:
                row = {"prompt": prompts.get(ex.task_id, ""), "completion": ex.completion}
            else:
                row = {"task_id": ex.task_id, "completion": ex.completion}
            f.write(json.dumps(row) + "\n")
    return path
