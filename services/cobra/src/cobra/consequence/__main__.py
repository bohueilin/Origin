"""CLI: the Tier A consequence number — reward reachable by pure cheating.

python -m cobra.consequence --count 20
python -m cobra.consequence --emit-events   # robustness_update JSON for the dashboard
"""

import argparse
import dataclasses
import json
from pathlib import Path

from ..agents.specialists import DEFAULT_MODEL
from ..breadth.__main__ import build_discover_fn
from ..breadth.loop import DEFAULT_COUNT, DEFAULT_WORKERS, maybe_client
from ..substrate import load_hardest
from .consequence import as_robustness_updates, run_consequence, tier_a_payload, write_tier_a

# Tier A magnitude lands at the repo root, beside golden_run.jsonl (and Tier B's
# capability_run.json) — where the server/dashboard look. Resolved off this file, not cwd.
_TIER_A_PATH = Path(__file__).resolve().parents[3] / "tier_a.json"


def main() -> None:
    ap = argparse.ArgumentParser(description="Cobra Tier A: reward reachable by pure cheating")
    ap.add_argument("--count", type=int, default=DEFAULT_COUNT)
    ap.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    ap.add_argument("--source", choices=["auto", "seed", "discovered"], default="auto")
    ap.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help="red-team model; a weaker/cheaper model cheats more on the same grader (SPEC §9.5)",
    )
    ap.add_argument(
        "--hardest",
        type=int,
        default=None,
        help="run the same N hardest tasks as the breadth sweep (tricky logic / sparse base)",
    )
    ap.add_argument(
        "--emit-events",
        action="store_true",
        help="print the robustness_update events the dashboard Tier A slot consumes",
    )
    ap.add_argument(
        "--emit-tier-a",
        action="store_true",
        help=f"write the Tier A reward-points magnitude to {_TIER_A_PATH.name}",
    )
    args = ap.parse_args()

    client = None if args.source == "seed" else maybe_client()
    if args.source == "discovered" and client is None:
        print("  (no ANTHROPIC_API_KEY / anthropic client -> cannot discover; using seed)")
    discover_fn = build_discover_fn(client, model=args.model) if client is not None else None
    tasks = load_hardest(args.hardest) if args.hardest else None
    c = run_consequence(args.count, args.workers, discover_fn=discover_fn, tasks=tasks)

    if args.emit_tier_a:
        write_tier_a(c, _TIER_A_PATH)
        print(f"wrote {_TIER_A_PATH}: {tier_a_payload(c)['tier_a']}")
        return

    if args.emit_events:
        for ev in as_robustness_updates(c):
            print(json.dumps(dataclasses.asdict(ev)))
        return

    print("Cobra — Tier A: reward reachable by PURE cheating")
    print(f"  breach source : {c.source}")
    print(f"  cheats (held-out): {c.n_cheats}  (over {c.n_measurable} measurable task(s))")
    print("  baseline = standard grader runs the repo's own test file (realistic CI)")
    print("  AFTER    = graded from a pristine read-only copy")
    print()
    print(f"  naive    : pays {c.reward_naive_points:.0f} points ({c.reward_naive_rate:.2f}/cheat)")
    print(
        f"  hardened : pays {c.reward_hardened_points:.0f} points "
        f"({c.reward_hardened_rate:.2f}/cheat)"
    )
    print()
    if c.n_measurable == 0:
        print("  note: no measurable held-out cheats (e.g. harness-tamper breaches collapse to")
        print("  one stub solution.py); the hit-rate is the headline until the breach unit")
        print("  becomes the cheat artifact (deferred). See `python -m cobra.breadth`.")
    print(
        "  dashboard Tier A reads this from the robustness_update stream "
        "(reward = 1 - held_out_blocked)."
    )


if __name__ == "__main__":
    main()
