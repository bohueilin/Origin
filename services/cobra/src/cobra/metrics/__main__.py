"""CLI: run the full Milestone 1 loop and print the before/after/honest-pass numbers.

python -m cobra.metrics
"""

from .loop import run_m1


def main() -> None:
    r = run_m1()
    print(f"Cobra — Milestone 1: grader hardening on {r.task_id}")
    print(f"  breach source : {r.source}", end="")
    if r.source == "seed":
        print("  (known <= leak + deterministic variants; red agent not wired yet)", end="")
    print()
    if r.n_dropped:
        print(f"  dropped       : {r.n_dropped} candidate(s) were not genuine breaches")
    split = f"train {len(r.train)} / held-out {len(r.held_out)}"
    print(f"  breaches      : {r.n_breaches} genuine  ->  {split}")
    print(f"  patch         : {r.patch_template} ({len(r.hardening_inputs)} hardening input(s))")
    print()
    print("  on the HELD-OUT breach split:")
    print(f"    agreement BEFORE : {r.agreement_before:.2f}")
    print(f"    agreement AFTER  : {r.agreement_after:.2f}")
    print(f"    honest_pass      : {r.honest_pass:.2f}")


if __name__ == "__main__":
    main()
