"""CLI: split a rollout dataset into the two expert-iteration arms and show the gap (no training).

  python -m cobra.train --data runs/rollouts.jsonl --out-dir runs

Writes runs/sft_arm_naive.jsonl and runs/sft_arm_hardened.jsonl, and prints each arm's cheat
fraction — the naive-reward arm carries cheats, the hardened-reward arm doesn't.
"""

import argparse
import json

from ..rollout.dataset import SEAM_FIELDS, Rollout
from .arms import build_arms, write_sft


def _load(path: str) -> list[Rollout]:
    rollouts = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                d = json.loads(line)
                rollouts.append(Rollout(**{k: d[k] for k in SEAM_FIELDS}))
    return rollouts


def _prompts_for(rollouts) -> dict[str, str]:
    """Map each task_id -> its EvalPlus prompt, so SFT arms train on prompt+completion."""
    from ..substrate import load_task

    out: dict[str, str] = {}
    for tid in {r.task_id for r in rollouts}:
        try:
            out[tid] = load_task(tid).prompt
        except Exception:
            out[tid] = ""
    return out


def main() -> None:
    p = argparse.ArgumentParser(prog="cobra.train")
    p.add_argument("--data", default="runs/rollouts.jsonl")
    p.add_argument("--out-dir", default="runs")
    args = p.parse_args()

    rollouts = _load(args.data)
    arms = build_arms(rollouts)
    prompts = _prompts_for(rollouts)  # join task prompts so SFT rows are {prompt, completion}
    print("=== expert-iteration arms (rejection sampling on each reward) ===")
    for arm in arms.values():
        path = write_sft(arm, f"{args.out_dir}/sft_{arm.name}.jsonl", prompts=prompts)
        print(
            f"  {arm.name:14} size={arm.size:4}  cheat_fraction={arm.cheat_fraction:.0%}  -> {path}"
        )
    print(
        "\n  arm_naive trains on the reward that pays out for cheats; arm_hardened does not."
        "\n  That gap is why a naive-trained model learns to cheat and collapses on a clean eval."
    )


if __name__ == "__main__":
    main()
