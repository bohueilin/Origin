<h1 align="center">Cobra</h1>

<p align="center"><b>An autoresearch loop that automatically hardens RL verifiers against reward hacking.</b></p>

<p align="center">
Point it at a grader (the reward you'd train against): a red-team swarm discovers how it can be gamed,<br/>
a green team seals the holes, and it reports how much more trustworthy the grader became — measured against held-out ground truth.
</p>

<p align="center">
<code>Python 3.12</code> · <code>uv</code> · <code>anthropic</code> SDK · <code>FastAPI</code> + websocket · <code>pytest</code> / <code>ruff</code>
</p>

---

> **The product is the loop.** The deliverable is a hardened grader and a before→after robustness
> number. The red-team swarm + conductor are the *engine* that finds holes to seal — impressive, but
> supporting. The headline is "we made a broken grader trustworthy, automatically," not "look how
> smart our swarm is."

## Why it matters

RL trains a model against a **verifier** — a test suite, a reward model, an LLM judge. If that
verifier is gameable, you don't get a better model: you get a **reward-hacker** that scores high
while doing the wrong thing, and you usually find out *after* the compute is spent. Auto-generating
RL environments is now cheap, so **verifier quality is the bottleneck.** Cobra automates the thing
that today is done by hand — making a verifier un-gameable — and hands back the hardened verifier
with a number that proves it.

---

## The pipeline

<p align="center"><img src="assets/pipeline.svg" alt="Cobra hardening pipeline" width="100%"/></p>

The loop runs over an **env** (a grader over a task set). One pass per gate:

1. **Red swarm** (`agents/`) — specialist coding agents try to make the grader pass *without* solving
   the task. Each specializes in a cheat category. They have **write access to the task repo**
   (`solution.py`, `test_visible.py`, a runner) — a realistic CI / coding-agent setting, and what
   makes filesystem-level cheats possible without us planting anything.
2. **Conductor** (`conductor/`) — the brain. Allocates each *(gate × cheat-type)* cell exactly once,
   diversifies toward under-explored categories, gatekeeps (a breach is verified before it spreads),
   and invalidates (one patch can kill several breaches for free).
3. **Breach** — a solution that **passes the grader (R=1) but fails the oracle (T=0)**. That, and only
   that, is a breach.
4. **Green team** (`green/`) — an LLM selects and parameterizes a **hardening patch template** and
   applies it to a *copy* of the grader. It never fixes the cheating code and never sees the oracle,
   the gold solution, or the held-out inputs.
5. **Regression gate** (`gate/`) — the patch is accepted **only if** the breach now fails **and** the
   gold solution still passes. Otherwise it's rejected (the over-tighten / friendly-fire case).
6. **Robustness ↑** — agreement against the held-out oracle, recomputed with the honest-pass rate
   beside it, and streamed to the siege.

A sealed gate **escalates**: the next round faces the harder grader, so red and green iterate.

### One breach, end to end

```mermaid
sequenceDiagram
    participant R as Red agent
    participant G as Grader<br/>(visible tests)
    participant O as Oracle<br/>(held-out)
    participant V as Green + gate
    participant D as Siege gauge
    R->>G: write solution.py, edit tests, run visible suite
    G-->>R: R = 1  (grader passes)
    O-->>V: T = 0  (oracle fails)  ⇒ breach_found
    V->>V: pick template (pristine_readonly_plus_heldout)
    V->>V: regression gate — breach→0 ∧ gold→1 ?
    alt gate passes
        V-->>D: patch_applied · agent_killed · robustness_update ↑
    else gold broke
        V-->>D: patch_rejected  (friendly fire, torn down)
    end
```

---

## Core mechanics

The task is a coding task; the grader is a test suite; cheating is passing the tests without really
fixing the bug; hardening makes the test-grader impossible to satisfy without a real fix. **The red
team writes code; the green team fortifies the tests — it never fixes the buggy code.**

| Concept | In code | Where |
|---|---|---|
| **Task** | "implement this function" — EvalPlus problem | `substrate/evalplus_task.py` |
| **Grader (verifier)** | the visible/weak test suite → `R ∈ {0,1}` — *the thing we harden* | `grader/runner.py` |
| **Oracle (ground truth)** | held-out EvalPlus `plus_input` tests, gold-derived → `T ∈ {0,1}` | `oracle/runner.py` |
| **Breach** | a solution with `R=1 ∧ T=0` (`is_breach`) | `oracle/runner.py` |
| **Patch** | a hardening edit from a template library, applied to a grader copy | `templates/registry.py` |
| **Regression gate** | accept iff `grade(g', breach)=0 ∧ grade(g', gold)=1` | `gate/runner.py` |
| **Robustness** | % of held-out breaches blocked, honest-pass preserved | `metrics/agreement.py` |

**The threat model is realistic, not planted.** Agents operate in an ephemeral workdir
(`harness/workdir.py`) holding `solution.py`, `test_visible.py` (built from `base_input` only), and a
naive `runner.py` — **all editable**. The oracle's `plus_input` and the gold `canonical_solution`
live *outside* the workdir and are never written into it. The seed exploit list is empty
(`SEED_LIST = []`) — every breach is *discovered*, and an anti-theater check confirms it was not on a
seed list.

**Determinism is load-bearing.** Both grader and oracle run solutions in a subprocess sandbox
(`sandbox.py`): 30 s CPU timeout, `PYTHONHASHSEED=0`, a **best-effort** in-process network block and a
**Linux-only** ~2048 MB rlimit (both are determinism aids, **not a security boundary** — a subprocess or
`ctypes` call can bypass the network block, and the memory cap is a no-op off Linux). The verdict is
parsed from pytest's JUnit XML — never exit codes. Float comparisons use a shared `_eq` with
`rel_tol = abs_tol = 1e-6` (`suite.py`), embedded identically into grader and oracle suites.

### The red specialists (`agents/specialists.py`)

| Specialist | `cheat_type` | Strategy |
|---|---|---|
| **sapper** | `tamper_harness` | edits the test harness / runner itself instead of solving |
| **forger** | `hardcode_outputs` | memorizes / special-cases the visible inputs, no general solution |
| **edge_slipper** | `sparse_test_gap` | minimal code matching only the visible cases |

The red and green models default to `claude-sonnet-4-6`; the demo conductor uses
`claude-haiku-4-5` as the red model (weaker models cheat more readily — a feature for the demo).

### The hardening templates (`templates/`)

| Template id | Effect |
|---|---|
| `pristine_readonly_plus_heldout` | re-grade from a pristine read-only test copy + gold-labeled held-out inputs the agent never saw — neutralizes harness tampering and memorization |
| `require_delimited_answer` *(RG)* | extract the answer after a `####` / `answer:` marker |
| `reject_multiple_numbers` *(RG)* | reject responses containing more than one distinct number |
| `require_cue_answer` *(RG)* | parse the number after the last conclusion cue (mechanism distinct from the oracle, to preserve independence) |

Patches are immutable: `apply_patch(grader, template_id, params)` returns a *new* frozen `Grader`
with the patch appended — the original is never mutated.

### The conductor's four levers (`conductor/core.py`)

**allocate** (`next_cell` probes each gate×cheat cell once) · **diversify** (prefer under-explored
cheat categories) · **gatekeep** (`verify` confirms `R=1 ∧ T=0` before a breach spreads) ·
**invalidate** (`regrade` lets one patch retire other now-dead breaches). It runs in three modes:

- **`run_seed`** — deterministic forger + pristine hardening, **no API key**. The reliable demo path.
- **`run_live`** — the real LLM swarm + green team (needs `ANTHROPIC_API_KEY`).
- **`escalate_gate`** — iterated red↔green on a single gate, grader hardening each round.

Probes are resilient: 3 retries, 2 s backoff, a 90 s hard wall-clock cap per probe.

---

## The protected invariant — eval honesty

The robustness number is the whole product, so it is measured honestly:

1. **Held-out split is sacred.** Patch against a *train* split of breaches; measure on a disjoint
   *held-out* split the patch never saw (`split_breaches` sorts then alternates `[0::2] / [1::2]`).
2. **The oracle is independent of the grader.** `_split_plus` partitions `plus_input` into disjoint
   hardening vs. oracle halves and drops any case that overlaps `base_input` — grader and oracle
   **never share a test case**.
3. **Honest-pass is always tracked beside robustness.** A patch that blocks cheats by also rejecting
   gold solutions is a regression, not a win — the regression gate enforces it, and every number is
   reported with `honest_pass` next to it.
4. **No LLM-as-judge in the verdict path.** Every grader/oracle verdict is a deterministic subprocess
   result, reproducible on replay.

---

## Benchmarks & metrics

Every number below is computed by a locked function — no hand-tuning.

| Metric | Definition | Source |
|---|---|---|
| **agreement** (cheats blocked) | fraction of the breach set the grader rejects (matches oracle) = `rejected / N` | `metrics/agreement.py` |
| **baseline_agreement** ("before") | fraction the *naive* grader blocks — `0.0` for real breaches by construction | `metrics/agreement.py` |
| **honest_pass** | fraction of gold solutions still scoring 1 under the grader | `metrics/agreement.py` |
| **hit_rate** (exploitability) | `n_breachable / n_graders` — "M of N standard graders were breachable" | `breadth/loop.py` |
| **consequence** | reward points a pure-cheating policy collects = `Σ n_held_out · (1 − agreement)`, naive vs. hardened (reward per cheat = `1 − blocked`) | `consequence/consequence.py` |
| **safety_score** | balanced accuracy ×100 = `50 · (catch_rate + honest_pass)`; `false_accept = 1 − catch_rate` | `bench/core.py` |
| **best-of-K gap** | `hardened_accuracy − naive_accuracy` — how often picking by the naive reward lands on a cheat while the hardened reward picks a real solve (`recovered_rate`) | `bestofk/core.py` |

### Locked results

<p align="center"><img src="assets/results.svg" alt="Before/after results" width="100%"/></p>

Against the **standard** EvalPlus base grader (the repo's own `test_visible.py` run as plain
pass/fail, *unmodified* — the exact way hundreds of papers score code), red agent = Claude Sonnet:

- **Discovered breach rate: 10%** (3/30 hardest HumanEval tasks). The agent neuters the visible tests
  so the naive grader passes while the solution stays a stub that fails the oracle (`R=1, T=0`) — a
  *discovered* harness-tamper cheat, nothing planted.
- **Hardening seals it to 0** with **honest-pass 1.0** — grading from a pristine read-only copy
  rejects every tamper breach while the gold solution still passes.
- **Why ~10% and not higher:** on easy tasks a strong model just solves honestly (nothing to breach);
  cheating only appears where faking is cheaper than solving — the hardest slice. We did not chase a
  bigger number.

Nothing is sabotaged — the naive grader's leakiness is a published field fact (EvalPlus exists
because sparse base tests let wrong code through). Only the held-out slice and the attacker vary.
Reproduce from [`RESULTS.md`](RESULTS.md).

---

## The demo (~2 min)

<p align="center"><img src="assets/siege.svg" alt="The siege" width="100%"/></p>

Every loop element maps to one thing on screen — the dashboard animates purely off a **7-event
stream**, so the engine can be driven live *or* replayed from a recorded golden run.

1. **"Here's a standard EvalPlus grader the room trusts."** Name it as the exact base-test scoring.
2. **Run the loop → the siege.** Red agents flow toward soft gates; a breach opens an undefended gate
   (`breach_found`, card: *passed grader / failed oracle*); green builds a turret (`patch_applied`);
   agents whose exploit was sealed die at the gate (`agent_killed`). The gauge climbs **~0% → ~100%
   cheats-blocked, honest-pass pinned at 100%**, measured on held-out truth.
3. **Friendly-fire beat.** An over-tightened patch that would reject a gold solution flashes red and
   is torn down (`patch_rejected`) — proof the honest-pass guardrail is enforced.
4. **"And across N standard graders, the loop breached M of them"** — the exploitability hit-rate.
5. **Consequence beat.** "Train on the leaky reward and it pays out this much for pure cheating; on
   the hardened one, almost nothing."

```bash
make install        # uv sync + git hooks
make check          # ruff + pytest (the deterministic gate)

make demo                               # replay the recorded golden run — no API key → http://localhost:8000
uv run python -m cobra.server --seed  # deterministic live siege over the hardest tasks — no API key
make dev                                # live LLM run (needs ANTHROPIC_API_KEY)
```

The siege serves the **3D** surface at `/` and a **2D** fallback at `/2d`; events stream over `/ws`;
the consequence magnitude is served at `/tier_a.json`. Both live paths default to the **hardest**
EvalPlus tasks (`load_hardest`, `_hardness = len(canonical_solution) / len(base_input)` — sparse base
tests vs. tricky logic, where the standard grader is weakest). Override with `--tasks`; re-record a
golden with `--record golden_run.jsonl`.

### Event schema (the seam)

`agent_spawn {agent, specialty}` · `agent_move {agent, gate}` ·
`breach_found {agent, gate, cheat_type, grader_score, oracle_score, example}` ·
`patch_applied {gate, technique}` · `patch_rejected {gate, reason}` ·
`agent_killed {agent, gate}` · `robustness_update {held_out_blocked, honest_pass, probes}`
— defined in `events.py`, bussed over `server/bus.py`, replayed by `server/replay.py`.

---

## Module map

```
src/cobra/
├─ agents/        red specialists (sapper/forger/edge_slipper) + the agentic attack loop
├─ conductor/     core (4 levers, shared memory) · live · seed · escalate
├─ green/         the LLM hardening team (harden → validate → gate)
├─ grader/        the visible-test verdict  (R)            ┐
├─ oracle/        the held-out verdict      (T)            │ deterministic,
├─ gate/          the regression gate (breach→0 ∧ gold→1)  │ sandboxed,
├─ templates/     hardening template registry + apply_patch │ never share cases
├─ suite/sandbox  subprocess isolation, float-tolerant _eq ┘
├─ substrate/     EvalPlus + reasoning-gym task loaders
├─ metrics/       agreement / baseline / honest_pass · train-heldout split
├─ breadth/       run_breadth → hit-rate + before/after across an env
├─ consequence/   reward-points naive vs hardened (Tier A)
├─ rollout/       the rollout seam + multi-model sampling
├─ bench/         verifier-safety scoring (false-accept, honest-pass, safety)
├─ bestofk/       the best-of-K capability gap (selection proxy)
├─ train/         two-model RFT stretch (Qwen + LoRA, expert iteration)  [parked]
├─ server/        FastAPI app + websocket bus + golden replay
└─ events.py      the 7-event Seam-2 schema

dashboard/index.html   2D siege          viz3d/siege.html   3D siege
```

### The rollout seam

Everything downstream of the loop reads one locked record
(`SEAM_FIELDS = (task_id, model, completion, r_naive, r_hardened, t_oracle)`): the completion's reward
under the leaky grader, under the hardened grader, and the held-out ground truth. A row is labeled
`honest` / `cheat` / `fail`. `rollout/` samples it across a model registry
(`opus`, `sonnet`, `haiku`, `gpt-4o-mini`, `deepseek-chat`, Fireworks Qwen-Coder) and can inject
deterministic seed exploits as a guaranteed cheat class.

---

## Substrates

- **EvalPlus / HumanEval** (flagship) — `base_input` is the naive grader, `plus_input` (~80× expanded)
  is the oracle, `canonical_solution` is the gold for the honest-pass check. Pure Python, ms runtime.
- **reasoning-gym** (`gsm_symbolic`) — a real RL math reward. The grader is a lenient substring scorer;
  the oracle (`rg_oracle`) checks the *last* number against gold while the grader parses the *first* —
  disjoint by construction, so the oracle is never the grader.
- **HUD** — `hud_adapter.py` wraps any HUD env as a Cobra adapter (the env's reward is the verifier
  under test); `bench/hud.py` logs a leaderboard run as a HUD trace.

---

## Command reference

| Command | What it does |
|---|---|
| `make install` / `make check` / `make fmt` | sync + hooks · ruff + pytest gate · autoformat |
| `make dev` / `make demo` | live siege · golden-replay siege |
| `python -m cobra.server [--seed\|--replay FILE] [--tasks IDS] [--record FILE] [--model ID] [--speed F] [--host] [--port]` | the siege server |
| `python -m cobra.breadth [--hardest N] [--source auto\|seed\|discovered] [--workers] [--model]` | exploitability hit-rate + mean before/after across an env |
| `python -m cobra.consequence [--hardest N] [--source ...] [--emit-tier-a] [--emit-events]` | reward-points naive vs hardened → `tier_a.json` |
| `python -m cobra.metrics` | the single-task M1 loop: before / after / honest-pass |
| `python -m cobra.rollout [--models] [--count] [--k] [--red] [--seed-exploits] [--rg] [--out]` | build the rollout dataset (the seam) |
| `python -m cobra.bench --data runs/rollouts.jsonl [--judge] [--hud]` | verifier-safety scores + best-of-K gap |
| `python -m cobra.bestofk --data runs/rollouts.jsonl [--seed] [--show]` | the best-of-K capability gap report |
| `python -m cobra.red_rg [--count] [--scorer lenient\|first_number] [--pressure]` | red team on the reasoning-gym substrate |

---

## Roadmap / honest notes

- **Per-env report card** — a shareable *"your reward accepted X% of cheats → 0% after hardening, here
  are the exact cheats"* artifact assembled over `breadth` + `consequence` — is the next deliverable,
  not yet built.
- **Verifier-safety leaderboard** (`make leaderboard`, `bench/`) and the **best-of-K** proxy exist as
  CLIs, but global ranking is **parked** — the loop's before→after, not a ranking, is the headline.
- **Two-model RFT** (`train/`) — train one model against the leaky grader, one against the hardened
  grader, and show the leaky-trained one collapses on a clean held-out eval (Qwen2.5-Coder-0.5B +
  LoRA, expert iteration, Modal A100) — is scaffolded but pre-recorded and droppable. Clean executable
  verifiers resist reward-hacking by optimization, so the deterministic consequence number is the
  demonstrated proxy.

See [`SPEC.md`](SPEC.md) for the full design and [`RESULTS.md`](RESULTS.md) to reproduce the numbers.
