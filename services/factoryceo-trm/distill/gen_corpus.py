"""Generate a verified-trace corpus with a selectable teacher.

    python distill/gen_corpus.py --teacher deterministic --scenarios 100   # free, offline
    FIREWORKS_MODEL=accounts/fireworks/models/qwen3p7-plus \
        python distill/gen_corpus.py --teacher fireworks --scenarios 20     # serverless Qwen

Teachers:
  deterministic : greedy schedule, then corrupted -> rich repair traces (no API cost)
  fireworks     : serverless LLM (e.g. Qwen3.7) proposes; greedy-seeded; then repaired
  anthropic     : Claude proposes; greedy-seeded; then repaired

Each scenario -> one SYNTH-style episode (observation / repair_trace / final_plan /
ruler_soft). Output: results/episodes.jsonl (the SFT/RFT corpus).
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.generator import (generate_state, corrupt_plan,        # noqa: E402
                           generate_from_seeds)
from src.baselines import greedy                                 # noqa: E402
from src.llm import (DeterministicPlanner, FireworksPlanner,     # noqa: E402
                     AnthropicPlanner)
from src.data_export import build_episode, write_jsonl           # noqa: E402

RESULTS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "results")


def teacher_plan(name, state, seed):
    if name == "deterministic":
        return corrupt_plan(state, greedy(state), seed=seed, n_corruptions=6)
    planner = {"fireworks": FireworksPlanner, "anthropic": AnthropicPlanner}[name]()
    return planner.plan(state)            # already greedy-seeded inside the planner


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--teacher", default="deterministic",
                    choices=["deterministic", "fireworks", "anthropic"])
    ap.add_argument("--scenarios", type=int, default=100)
    ap.add_argument("--horizon", type=int, default=30)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--from-seeds", action="store_true",
                    help="amplify the realistic seed corpus (SYNTH-style) instead of pure-random")
    ap.add_argument("--split", default="train", choices=["train", "eval"])
    ap.add_argument("--out", default=os.path.join(RESULTS, "episodes.jsonl"))
    args = ap.parse_args()

    # scenarios: amplified-from-seed-corpus (grounded) or pure-parametric
    if args.from_seeds:
        scenarios = [(sid, st) for sid, st in
                     generate_from_seeds(args.split, n=args.scenarios, horizon_days=args.horizon)]
    else:
        scenarios = [(f"rand-{args.seed+i}",
                      generate_state(seed=args.seed + i, horizon_days=args.horizon))
                     for i in range(args.scenarios)]

    episodes = []
    for i, (sid, s) in enumerate(scenarios):
        cand = teacher_plan(args.teacher, s, args.seed + i)
        episodes.append(build_episode(
            s, cand, seed=args.seed + i, K=60,
            constraints={"seed_id": sid, "split": args.split,
                         "from_seeds": args.from_seeds, "horizon_days": args.horizon,
                         "n_jobs": len(s.jobs), "teacher": args.teacher}))
        if (i + 1) % 10 == 0:
            print(f"  {i+1}/{len(scenarios)} episodes "
                  f"(teacher={args.teacher}, source={'seeds:'+args.split if args.from_seeds else 'random'})")

    os.makedirs(RESULTS, exist_ok=True)
    write_jsonl(args.out, episodes)
    n_neg = sum(e["negative"] for e in episodes)
    steps = sum(len(e["repair_trace"]) for e in episodes)
    print(f"wrote {len(episodes)} episodes ({n_neg} hard) -> {os.path.relpath(args.out, RESULTS+'/..')}"
          f" | {steps} repair-trace steps (distillation signal)")


if __name__ == "__main__":
    main()
