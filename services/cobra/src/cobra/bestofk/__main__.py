"""CLI: the best-of-K capability gap from a rollout seam JSONL.

  python -m cobra.bestofk --data runs/rollouts.jsonl --seed 0 --show 2

Reports per-task and aggregate, plus vivid example cases (naive picked THIS cheat, hardened
picked THIS solve). The oracle is the final scorer only — it never influences selection.
"""

import argparse

from ..rollout.dataset import load_jsonl
from .core import TIE_BREAK, compute_gap


def _short(s: str, n: int = 110) -> str:
    return " ".join((s or "").split())[:n]


def main() -> None:
    ap = argparse.ArgumentParser(prog="cobra.bestofk")
    ap.add_argument("--data", default="runs/rollouts.jsonl")
    ap.add_argument("--seed", type=int, default=0, help="tie-break RNG seed (reproducible)")
    ap.add_argument("--show", type=int, default=3, help="example recovered cases to print")
    args = ap.parse_args()

    rollouts = load_jsonl(args.data)
    report = compute_gap(rollouts, seed=args.seed)
    if report.n == 0:
        print(f"no (task,model) groups found in {args.data}")
        return

    print(f"\n=== best-of-K capability gap — {args.data} ===")
    print(f"tie-break: {TIE_BREAK}, seed={args.seed}; oracle never selects")
    print(f"groups (task x model)               : {report.n}")
    print(f"naive   selection oracle-accuracy   : {report.naive_accuracy:.0%}")
    print(f"hardened selection oracle-accuracy  : {report.hardened_accuracy:.0%}")
    print(f"gap (hardened - naive)              : {report.gap:+.0%}")
    print(f"naive picked a cheat (oracle-wrong) : {len(report.naive_cheats)}/{report.n}")
    print(
        f"recovered (naive cheat -> hardened solve): "
        f"{len(report.recovered)}/{report.n} ({report.recovered_rate:.0%})"
    )

    print("\nper-task (naive-correct / hardened-correct of N model-groups):")
    for task_id, n, nc, hc in report.per_task():
        print(f"  {task_id:28} {nc}/{n} -> {hc}/{n}")

    examples = report.recovered[: args.show]
    if examples:
        print("\nexample recovered cases (naive picked a cheat, hardened a solve):")
        for g in examples:
            print(f"\n  [{g.task_id} | {g.model}]")
            print(f"    naive picked  (cheat, t_oracle=0): {_short(g.naive_pick.completion)}")
            print(f"    hardened picks (solve, t_oracle=1): {_short(g.hardened_pick.completion)}")


if __name__ == "__main__":
    main()
