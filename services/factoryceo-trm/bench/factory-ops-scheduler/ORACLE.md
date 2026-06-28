# Oracle trajectory

The oracle is the deterministic FactoryCEO solver:

1. **Greedy EDD schedule** (`src/baselines.greedy`): order operations by earliest
   due date / highest priority, place each on a capable machine + skilled, available
   operator at the earliest non-overlapping slot, procuring material to arrive first.
2. **Recursive verify → repair** (`src/repair_loop.repair_loop`, K=80): run the
   verifier; for each top hard violation pick the local repair (move op, swap
   machine, reassign operator, delay job, add overtime, expedite material, add a
   safety control) that best reduces it; iterate to zero hard violations.

Reproduce:

```bash
python solution/solve.py     # writes output/plan.json
python -m pytest tests/test_outputs.py -q   # 2 passed
```

On the shipped fixture this yields a feasible plan with verifier reward ≈ 34,903
(zero hard violations), which the verifier accepts. This is the ground truth the
60%-of-oracle quality bar is calibrated against.
