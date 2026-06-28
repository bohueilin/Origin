"""Turn the curated golden-hard taskset into a Fireworks RFT dataset.

Fireworks Reinforcement Fine-Tuning needs (1) a dataset of *prompts* and (2) an
evaluator that scores completions 0..1. Here we emit the prompts; the evaluator
(distill/fireworks_rft_evaluator.py) reconstructs the verifier state from the
``floor_id``/``seed``/``reward_mode`` columns we attach to each row and grades the
model's completion with our symbolic verifier — the same reward HUD used.

Each JSONL row:
    {"messages": [{"role": "user", "content": <floor prompt>}],
     "floor_id": ..., "seed": ..., "reward_mode": ...}

    python distill/build_rft_dataset.py \
        --golden results/golden_hard_tasks.json \
        --out results/rft_golden_dataset.jsonl
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# pylint: disable=import-error,no-name-in-module,wrong-import-position
from src.floor_prompt import floor_prompt_and_state  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--golden", default=str(ROOT / "results" / "golden_hard_tasks.json"))
    ap.add_argument("--out", default=str(ROOT / "results" / "rft_golden_dataset.jsonl"))
    ap.add_argument("--reward-mode", default=None,
                    help="Override the per-task reward_mode (default: use the task's own).")
    args = ap.parse_args()

    data = json.loads(Path(args.golden).read_text(encoding="utf-8"))
    tasks = data.get("tasks", [])
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    n = 0
    with out_path.open("w", encoding="utf-8") as f:
        for t in tasks:
            floor_id = t["floor_id"]
            seed = int(t["seed"])
            mode = args.reward_mode or t.get("reward_mode", "strict")
            prompt, _state = floor_prompt_and_state(floor_id, seed)
            row = {
                "messages": [{"role": "user", "content": prompt}],
                "floor_id": floor_id,
                "seed": seed,
                "reward_mode": mode,
            }
            f.write(json.dumps(row) + "\n")
            n += 1

    print(f"wrote {n} RFT rows -> {out_path}")
    print(f"reward space: {args.reward_mode or 'per-task (' + data.get('reward_mode', 'strict') + ')'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
