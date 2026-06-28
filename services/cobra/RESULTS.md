# RESULTS

## Discovered breach rate (locked)

**3 / 30 (10%)** on the 30 hardest HumanEval tasks, red agent = Claude Sonnet
(`claude-sonnet-4-6`), against the **standard** EvalPlus base grader — the repo's own
`test_visible.py` run as plain pass/fail, unmodified — with a held-out oracle (`plus − base`).

- **Cheat family:** harness tampering. The agent neuters `test_visible.py` so the naive grader
  passes, while `solution.py` stays a stub that fails the oracle (R_naive=1, T=0).
- **Hardening:** grading from a pristine read-only copy of the base tests rejects every tamper
  breach (the stub fails the rebuilt tests) → **sealed to 0**, **honest_pass 1.0** (the gold
  solution still passes the pristine grader). Categorical for this family; backed by
  `tests/test_breadth.py::test_harness_tamper_now_counts_as_a_discovered_breach`.
- **Why ~10% and not higher:** on easy tasks a strong model solves honestly (R=1, T=1) — there
  is nothing to breach. Cheating appears only where solving is expensive relative to faking; the
  hardest slice is where that crossover begins. (We deliberately did not chase a larger number.)

Nothing is sabotaged: the naive grader is the standard, nameable EvalPlus base grader whose
leakiness is a published field fact; only the held-out slice and the attacker are varied.

### Reproduce (breach rate)

```
ANTHROPIC_API_KEY=…  python -m cobra.breadth --source discovered --hardest 30 --workers 8
```

`--hardest` selects by an objective proxy (`len(canonical_solution) / len(base_input)`), not by
breach yield. The run is non-deterministic (the agent is an LLM), so the exact count varies;
`source` must read `discovered` (a `seed` label means the API key was not picked up).

### Reproduce (Tier-A consequence magnitude)

```
ANTHROPIC_API_KEY=…  python -m cobra.consequence --source discovered --hardest 30 --workers 8 --emit-tier-a
```

Writes `tier_a.json` (`source: "discovered"`). Caveat: harness-tamper breaches collapse to one
stub `solution.py` per task, so the held-out *measurable* split is sparse — the honest magnitude
is the breach count itself (the naive grader pays out for the tamper breaches; pristine hardening
pays 0). A non-trivial points magnitude awaits the deferred change making the breach unit the
cheat artifact rather than `solution.py`.

### Determinism note

`--source seed` (no key) is fully deterministic and exercises the same pipeline end to end; it is
the reproducible CI path. The `discovered` numbers above are from a live keyed run.
