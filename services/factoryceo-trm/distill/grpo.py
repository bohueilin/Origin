"""Local GRPO signal: rollout groups -> verifier+RULER reward -> advantages.

This is the HUD/OpenPipe-ART training loop, run locally with NO HUD key and NO
hud-python package (the SDK needs Python 3.11-3.12; the cloud run needs
HUD_API_KEY + a model key). What needs neither is the substance: sample K
rollouts per scenario, score each with the hybrid reward, and compute
group-relative advantages -- the exact `(trace, advantage)` pairs you feed an
optimizer.

    python distill/grpo.py --scenarios 4 --group 6                 # free (stochastic repair policy)
    FIREWORKS_MODEL=accounts/fireworks/models/qwen3p7-plus \
        python distill/grpo.py --teacher fireworks --scenarios 2 --group 4   # real LLM-sampled group

On the HUD platform: same reward (`hud_env.normalized_reward`/`hybrid_reward`)
and `group_relative`, but rollouts come from a hosted agent (needs the key) and
advantages go straight into GRPO. Env spec: `hud_env.build_environment`.
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.generator import generate_state, corrupt_plan, generate_from_seeds  # noqa: E402
from src.baselines import greedy                                             # noqa: E402
from src.repair_loop import repair_loop                                      # noqa: E402
from src.hud_env import hybrid_reward, group_relative                        # noqa: E402
from src.llm import FireworksPlanner                                         # noqa: E402


def rollout_group(state, base_seed, k, teacher="stochastic"):
    """K rollouts (a GRPO group) for one scenario. 'stochastic' = corrupt-greedy
    with K seeds then repair (a free, varied policy); 'fireworks' = K LLM samples."""
    plans = []
    if teacher == "fireworks":
        planner = FireworksPlanner()             # temperature>0 -> varied samples
        for _ in range(k):
            plans.append(planner.plan(state))
    else:
        for j in range(k):
            # vary corruption count too, so rollouts differ in quality (real spread)
            cand = corrupt_plan(state, greedy(state), seed=base_seed * 100 + j,
                                n_corruptions=4 + (j % 5))
            final, _ = repair_loop(state, cand, K=20 + j)   # varied repair budget
            plans.append(final)
    return plans


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenarios", type=int, default=4)
    ap.add_argument("--group", type=int, default=6, help="rollouts per scenario (GRPO group size)")
    ap.add_argument("--teacher", default="stochastic", choices=["stochastic", "fireworks"])
    ap.add_argument("--from-seeds", action="store_true")
    args = ap.parse_args()

    if args.from_seeds:
        scenarios = list(generate_from_seeds("train", n=args.scenarios))
    else:
        scenarios = [(f"rand-{i}", generate_state(seed=i)) for i in range(args.scenarios)]

    n_pairs = 0
    for i, (sid, st) in enumerate(scenarios):
        plans = rollout_group(st, i, args.group, args.teacher)
        rewards = [hybrid_reward(st, p)["reward"] for p in plans]
        adv = group_relative(rewards)
        n_pairs += len(plans)
        print(f"\nscenario {sid} (group={len(plans)}):")
        for j, (r, a) in enumerate(zip(rewards, adv)):
            print(f"  rollout {j}: reward={r:.3f}  advantage={a:+.3f}"
                  f"{'   <- best' if a == max(adv) else ''}")
    print(f"\n{n_pairs} (trajectory, advantage) pairs -> feed to GRPO/ART optimizer "
          f"(no HUD key needed for this signal).")


if __name__ == "__main__":
    main()
