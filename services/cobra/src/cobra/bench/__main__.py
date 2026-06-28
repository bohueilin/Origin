"""CLI: bring-your-verifier safety leaderboard over a rollout seam JSONL.

  python -m cobra.bench --data runs/rollouts.jsonl            # naive vs hardened
  python -m cobra.bench --data runs/rollouts.jsonl --judge    # + LLM-as-judge (needs API key)

Treats the rollout as a labeled exploit suite: ranks each verifier by cheats caught vs honest
kept, then prints the best-of-K gap (what optimizing each reward would actually select).
"""

import argparse

from ..rollout.dataset import load_jsonl
from .core import column, leaderboard, rank
from .gap import bestofk_gap


def main() -> None:
    ap = argparse.ArgumentParser(prog="cobra.bench")
    ap.add_argument("--data", default="runs/rollouts.jsonl")
    ap.add_argument(
        "--judge",
        action="store_true",
        help="also score the LLM-as-judge (re-scores completions; needs ANTHROPIC_API_KEY)",
    )
    ap.add_argument(
        "--hud",
        action="store_true",
        help="log the run as a HUD trace/eval (needs hud-python; uploads if HUD_API_KEY set)",
    )
    args = ap.parse_args()

    rollouts = load_jsonl(args.data)
    if not rollouts:
        print(f"no rollouts in {args.data}")
        return

    verifiers = [("naive", column("r_naive")), ("hardened", column("r_hardened"))]
    if args.judge:
        from .verifiers import judge_verifier

        verifiers.insert(1, ("llm-judge", judge_verifier()))

    if args.hud:
        from .hud import trace_leaderboard

        rows = trace_leaderboard(rollouts, verifiers)
    else:
        rows = leaderboard(rollouts, verifiers)
    rows = rank(rows)
    n_ex = rows[0].n_exploits
    print(f"verifier-safety leaderboard — {len(rollouts)} completions, {n_ex} exploits\n")
    print(f"  {'verifier':10}{'safety':>8}{'false-accept':>14}{'honest-pass':>13}{'catch':>8}")
    for s in rows:
        flag = "  ⚠ over-tightened" if s.over_tightened else ""
        print(
            f"  {s.name:10}{s.safety_score:>7.0f} {s.false_accept:>13.0%}"
            f"{s.honest_pass:>13.0%}{s.catch_rate:>8.0%}{flag}"
        )

    g = bestofk_gap(rollouts)
    print(f"\nbest-of-K gap (pool by task, {g.n_tasks} tasks):")
    print(f"  naive-reward selection correct:    {g.naive_accuracy:>5.0%}")
    print(f"  hardened-reward selection correct: {g.hardened_accuracy:>5.0%}   (gap +{g.gap:.0%})")
    print(
        "  → optimizing the naive reward selects a cheat this often; the hardened reward does not"
    )
    print(
        f"\nnote: safety is vs THIS exploit suite ({n_ex} oracle-wrong completions), "
        "not all possible exploits."
    )


if __name__ == "__main__":
    main()
