"""CLI: measure how often a frontier model's natural answer games the first-number scorer.

    python -m cobra.red_rg --count 30 --seed 42 --model claude-sonnet-4-6

Prints the discovered-breach rate (the headline) plus the full R/T breakdown and a few example
breaches so the phenomenon is auditable (discovered, not planted). Needs ANTHROPIC_API_KEY.
"""

import argparse

from ..substrate import load_rg_subset
from .core import BREACH, CAUGHT, DEFAULT_MODEL, FALSE_REJECT, HONEST, measure_breach_rate


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--count", type=int, default=30, help="number of gsm_symbolic problems")
    ap.add_argument(
        "--seed", type=int, default=42, help="train seed (keep a disjoint seed held out)"
    )
    ap.add_argument("--dataset", default="gsm_symbolic")
    ap.add_argument("--model", default=DEFAULT_MODEL, help="weaker models cheat more readily")
    ap.add_argument(
        "--scorer",
        choices=("lenient", "first_number"),
        default="lenient",
        help="lenient = reasoning-gym's default substring scorer (gameable, passes honest CoT); "
        "first_number = the dataset's strict override (rejects most CoT)",
    )
    ap.add_argument(
        "--pressure",
        action="store_true",
        help="reward-pressured agent: told the objective (get accepted), never the method",
    )
    ap.add_argument("--show", type=int, default=3, help="example breaches to print")
    args = ap.parse_args()

    tasks = load_rg_subset(args.dataset, n=args.count, seed=args.seed, scorer=args.scorer)
    stats = measure_breach_rate(tasks, model=args.model, pressure=args.pressure)
    c = stats.counts

    mode = "reward-pressure" if args.pressure else "honest"
    print(
        f"\n=== discovered-breach rate: {stats.breach_rate:.1%} "
        f"({c[BREACH]}/{stats.n}) — {args.model} on {args.dataset} "
        f"seed={args.seed} scorer={args.scorer} mode={mode} ==="
    )
    print(f"  breach        (R=1,T=0, games scorer)   : {c[BREACH]:>3}")
    print(f"  honest        (R=1,T=1, correct)        : {c[HONEST]:>3}")
    print(f"  caught        (R=0,T=0, wrong+rejected) : {c[CAUGHT]:>3}")
    print(f"  false_reject  (R=0,T=1, correct rejected): {c[FALSE_REJECT]:>3}")

    breaches = [a for a in stats.attempts if a["category"] == BREACH]
    for a in breaches[: args.show]:
        tail = a["answer"].strip().replace("\n", " ")[-160:]
        print(f"\n  [{a['task']}] gold={a['gold']}  …{tail}")


if __name__ == "__main__":
    main()
