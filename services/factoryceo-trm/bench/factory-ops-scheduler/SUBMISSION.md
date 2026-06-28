# factory-ops-scheduler — submission notes

## Task design rationale
The task targets **long-horizon constraint-satisfaction-under-objective**: emit a
single executable production schedule for a high-mix plant (18 jobs, ~21-day
horizon, a breakdown + an operator absence + a late material). It is a faithful
slice of a real workflow — this is exactly what a plant operations brain must do —
not a contrived puzzle. The capability tested is the model's ability to hold many
interacting hard constraints (no machine double-booking, capability/skill match,
material-arrives-before-op, maintenance windows, precedence, no hallucinated ids)
while *also* optimizing an economic objective. A pass means the model produced a
plan that is both **feasible** and **economically non-destructive**; a fail is
interpretable — it is attributable to a specific violated constraint or to a
value-destroying schedule, surfaced by the verifier.

## Why it is hard for frontier models
Feasibility is global: a single overlap, a single op scheduled before its material
arrives, or one hallucinated operator id fails the plan. Models reliably emit
*plausible-looking* schedules that break one of these — and even when feasible,
they tend to leave large value on the table. The search space is combinatorial and
the constraints are coupled, so token-by-token generation without explicit search
degrades.

## Verifier
Pass/fail is the product's own deterministic `evaluate()` over a frozen fixture:
PASS ⇔ schema-valid AND `n_hard == 0` AND reward ≥ 60% of the oracle reward. No
LLM judge, no subjective end state. The reward floor (calibrated off the oracle)
prevents a trivially-feasible but value-destroying plan from passing.

## Oracle
`solution/solve.py` — deterministic EDD scheduler + recursive verify→repair loop.
Guaranteed feasible; it is the human-expert-equivalent ground truth and passes the
verifier (oracle reward ≈ 34,903 on the shipped fixture).

## Model results (pass@2)
Run via `dev/run_models.py`. On the shipped fixture, a strong serverless reasoner
(Qwen3.7-Plus) fails pass@2: one attempt was feasible but **value-destroying**
(reward ratio −0.08 of oracle), the other was **schema-invalid** (malformed
ActionPlan). Re-run with `--provider openrouter` for GPT-5.x / Opus 4.x /
Gemini 3.x (set `OPENROUTER_API_KEY`); the three target models are configured in
`dev/run_models.py`.

## QC methodology
- The oracle is asserted to pass its own verifier in `make_fixture.py` and in the
  test suite, so the task is provably solvable.
- The verifier reuses the production constraint checker (unit-tested separately:
  37 passing tests), so each violation class is exercised.
- Difficulty was tuned by injecting disruptions until a naive direct plan fails
  while the oracle still passes — i.e. the gap is from reasoning, not from an
  impossible instance.
- The fixture is a fixed seed; grading is fully deterministic and re-runnable.

## Training signal value
Verified repair traces from this environment are exactly the SFT/RFT data that
distils a small specialist: each (infeasible plan → verifier errors → repair →
feasible plan) tuple is a dense, checkable reasoning trace. Training on it improves
**constraint-grounded planning and self-correction** — turning plausible-but-wrong
schedules into feasible, economically sound ones. This is the FactoryCEO thesis
(teacher + synthetic data + verified traces → small TRM that beats the LLM alone).

## Design influence (tau-bench)
The structure borrows from τ-bench's multi-stage recipe: (1) an LLM-generated
domain DB (our seeded `FactoryState`), (2) an unstructured **policy doc**
(`fixtures/policy.md`) the agent must read and apply — not just machine-readable
fields, (3) a **user simulator** (`fixtures/user_sim.json`): a terse "CEO away for
two weeks" who withholds the hidden constraints (M2 overheating, an absence, a rush
order, late material) until the agent asks, enabling a multi-turn variant where
failures are attributable to missed information-gathering, and (4) multi-model
diversity — the fixture generator and the model runner can be pointed at several
LLMs (GPT/Claude/Gemini via OpenRouter) to diversify both task instances and
solver behavior. Unlike τ-bench's LLM-judged dialogue, our pass/fail stays a
deterministic verifier, which keeps grading unambiguous.

## Time estimate
~3 hours end to end (engine reuse from FactoryCEO-TRM; new bench harness, fixture,
oracle, verifier, model runner, and writeups).
