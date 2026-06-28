# factory-ops-scheduler (manufacturing bench)

A Harbor-format, verifier-graded task for our own eval: **can a model schedule a
high-mix factory for a full horizon without breaking a single hard constraint —
and not destroy value doing it?** The verifier is FactoryCEO's deterministic
`evaluate()`, so pass/fail is unambiguous and re-runnable.

```
factory-ops-scheduler/
  instruction.md        # the agent-facing task
  task.toml             # Harbor metadata
  grade.py              # shared deterministic grader (uses src/verifier.py)
  fixtures/state.json   # the held-out factory instance (the input)
  fixtures/meta.json    # oracle reward + quality bar + messy prompt
  solution/solve.py     # oracle: greedy + recursive repair (passes the verifier)
  tests/test_outputs.py # the verifier: feasible AND >= 60% of oracle reward
  dev/make_fixture.py   # regenerate the instance + oracle reward
  dev/run_models.py     # frontier-model pass@k (OpenRouter; Fireworks fallback)
  environment/Dockerfile
```

## Run it

```bash
# from factoryceo_trm/ (engine on the path)
python bench/factory-ops-scheduler/solution/solve.py          # oracle → output/plan.json
python -m pytest bench/factory-ops-scheduler/tests/test_outputs.py -q   # verify (passes)

# frontier models, pass@2
OPENROUTER_API_KEY=...  python bench/factory-ops-scheduler/dev/run_models.py --provider openrouter --k 2
FIREWORKS_API_KEY=...   python bench/factory-ops-scheduler/dev/run_models.py --provider fireworks  --k 2
```

## Why it matters for FactoryCEO
This is the eval behind the product claim: frontier LLMs alone emit infeasible or
value-destroying plans, the verifier catches them, and the recursive-repair oracle
(and the distilled TRM) pass. The verified repair traces this task produces are the
training signal for the small specialist. See `SUBMISSION.md` for the full writeup.
