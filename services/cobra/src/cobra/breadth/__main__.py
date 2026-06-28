"""CLI: run M2 breadth across an EvalPlus subset and print the exploitability hit-rate.

python -m cobra.breadth --count 25 --workers 8
"""

import argparse
import shutil
from pathlib import Path

from ..agents.specialists import DEFAULT_MODEL, EDGE_SLIPPER, FORGER, run_specialist
from ..loop.interface import make_workdir, run_grader
from ..substrate import load_hardest
from .loop import DEFAULT_COUNT, DEFAULT_WORKERS, maybe_client, run_breadth

# Solution-level cheat specialists. SAPPER (harness tampering) is intentionally excluded:
# the breadth grader rebuilds the tests from a pristine copy, so harness-level cheats can't
# survive it — only solution-level cheats register here. Diversity still comes from the agent.
DISCOVERY_SPECIALISTS = (FORGER, EDGE_SLIPPER)


def build_discover_fn(client, specialists=DISCOVERY_SPECIALISTS, model=DEFAULT_MODEL):
    """Engine-backed breach source for run_breadth: run the red swarm per task and return the
    solution.py of any run that passed the grader. The spine (make_workdir/run_grader) is
    reached through loop.interface; breadth itself never imports the engine.

    `model` is the red-team model. A weaker/cheaper model cheats more readily (SPEC §9.5) — on
    the EXACT same standard grader a strong model solves honestly — so it surfaces real breaches
    without touching the grader or oracle.

    CONTRACT: every source returned has already PASSED THE NAIVE GRADER (run_grader on the
    agent's workdir -> R_naive=1), harness tampering included — we only return runs where
    run.result.passed. run_task relies on this: it treats a discovered source as R_naive=1 and
    counts it as a breach iff the oracle fails (it does NOT re-grade with the pristine rebuild,
    which is the hardened grader, not the baseline)."""

    def discover(task) -> list[str]:
        found: list[str] = []
        for specialist in specialists:
            workdir = make_workdir(task)
            try:
                run = run_specialist(
                    specialist, workdir, run_tests=run_grader, client=client, model=model
                )
                if run.result.passed:
                    src = (Path(workdir) / "solution.py").read_text()
                    if src.strip() and src not in found:
                        found.append(src)
            finally:
                shutil.rmtree(workdir, ignore_errors=True)
        return found

    return discover


def main() -> None:
    ap = argparse.ArgumentParser(description="Cobra M2: breadth + exploitability hit-rate")
    ap.add_argument("--count", type=int, default=DEFAULT_COUNT, help="number of EvalPlus tasks")
    ap.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="parallel workers")
    ap.add_argument(
        "--source",
        choices=["auto", "seed", "discovered"],
        default="auto",
        help="auto: red agent if ANTHROPIC_API_KEY set, else seed; discovered: require the agent",
    )
    ap.add_argument(
        "--hardest",
        type=int,
        default=None,
        help="override the count of hardest tasks (default: the --count hardest)",
    )
    ap.add_argument(
        "--easy",
        action="store_true",
        help="use the first --count tasks instead of the hardest (default: hardest)",
    )
    ap.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help="red-team model; a weaker/cheaper model cheats more on the same grader (SPEC §9.5)",
    )
    args = ap.parse_args()

    client = None if args.source == "seed" else maybe_client()
    if args.source == "discovered" and client is None:
        print("  (no ANTHROPIC_API_KEY / anthropic client -> cannot discover; using seed)")
    discover_fn = build_discover_fn(client, model=args.model) if client is not None else None
    # Default: the hardest tasks (where cheats actually surface). --easy opts out to the first-N.
    tasks = None if args.easy else load_hardest(args.hardest or args.count)
    r = run_breadth(args.count, args.workers, discover_fn=discover_fn, tasks=tasks)

    print("Cobra — Milestone 2: breadth across EvalPlus (HumanEval)")
    note = "  (generic input-memorizing cheat; red agent not wired)" if r.source == "seed" else ""
    print(f"  breach source : {r.source}{note}")
    print(f"  tasks         : requested {r.n_requested}, loaded {r.n_loaded}, failed {r.n_failed}")
    print()
    pct = 100 * r.hit_rate
    print(f"  >>> EXPLOITABILITY HIT-RATE: {r.n_breachable} of {r.n_graders} standard naive")
    print(f"      graders were breachable ({pct:.0f}%)  <<<")
    print()
    if r.n_measurable:
        print(f"  aggregate on the HELD-OUT split (over {r.n_measurable} measurable task(s)):")
        print("    baseline = standard grader runs the repo's own test file (realistic CI)")
        print("    AFTER    = graded from a pristine read-only copy")
        print(f"    agreement BEFORE : {r.mean_agreement_before:.2f}")
        print(f"    agreement AFTER  : {r.mean_agreement_after:.2f}")
        print(f"    honest_pass      : {r.mean_honest_pass:.2f}")
    else:
        print("  no measurable tasks (need >=2 distinct breaches per task to split).")

    unmeasurable = r.n_breachable - r.n_measurable
    if unmeasurable or r.n_failed:
        print(f"  coverage      : {unmeasurable} breachable-but-unmeasurable, {r.n_failed} failed")
    if unmeasurable:
        print("    note: harness-tamper breaches collapse to one stub solution.py (<2 distinct")
        print("    per task), so measurable agreement is sparse until the breach unit becomes")
        print("    the cheat artifact rather than solution.py (deferred).")


if __name__ == "__main__":
    main()
