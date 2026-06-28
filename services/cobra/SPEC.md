# SPEC.md — Cobra

The destination. `CLAUDE.md` is how we build; this is what we're building.

---

## 1. What it is (one sentence)

An autoresearch loop that automatically hardens RL verifiers (graders) against reward hacking:
point it at a grader, it finds the cheats, seals them, and reports how much more trustworthy the
grader became — measured against held-out ground truth.

## 2. Why it matters

"You can improve a model at anything you can verify" — but only if the verifier is honest.
Auto-generating RL environments is now cheap; **verifier quality is the bottleneck.** A weak
reward function teaches models to cheat at scale. Cobra automates the thing that today is done
by hand: making a verifier un-gameable. HUD's own platform exists to QA tasks for exactly this,
so we're operating on their core primitive, not adjacent to it.

## 3. The product vs the engine

- **Product = the loop.** Breach → patch → robustness up. The deliverable is a hardened grader
  and a before→after number on a real benchmark.
- **Engine = the swarm + conductor.** Finds the holes intelligently. Impressive, supporting.
- The headline metric is grader robustness improving — NOT "smart swarm beats dumb swarm." That
  comparison is a secondary flex about engine efficiency.

## 3b. The naive baseline & why this isn't theater

The single biggest credibility risk: a judge suspecting we hand-built a leaky verifier and filmed
ourselves "discovering" planted holes. Four commitments kill that suspicion:

- **Naive = standard, not sabotaged.** The baseline grader is the real, off-the-shelf
  HumanEval/EvalPlus `base_input` test set run as plain pass/fail — the exact way hundreds of
  papers score code. We change nothing. Its leakiness is a *published field fact* (EvalPlus exists
  precisely because these sparse tests let wrong code through, dropping pass rates up to ~29%), not
  a weakness we introduce. Anchor it to that nameable standard at the demo.
- **Discover, don't plant.** We author the *threat model* (what the grader checks; that the agent
  has repo write access) and the *patch templates*. We never author the exploits. The conductor's
  taxonomy holds *categories* ("look for input-specific shortcuts"), never *answers* ("return []
  for task 12"). Anti-theater guardrail: prove any found exploit was not on a seed list.
- **Exploitability is measured, not asserted.** "Typical envs are easily exploitable" becomes a
  number — the hit-rate across many stock tasks (Sec 7) — not a claim about one rigged env.
- **The repo-access threat model is realistic, not a planted bug.** Giving the agent a writable
  repo is how real CI/coding agents run; the exploit is still found, not hidden.


---

## 4. Domain & mechanics (code = flagship)

The task is a coding task; the grader is a test suite; cheating is passing the tests without
really fixing the bug; hardening makes the test-grader impossible to satisfy without a real fix.
**The red team writes code; the green team fortifies the tests. The green team never fixes the
buggy code — that's the agent's job.**

**Threat model: agents have write access to the task repo.** They operate in a working directory
containing `solution.py`, `test_visible.py`, and a runner, and can edit any of it — a realistic
CI / coding-agent setting, and what makes the vivid harness-level cheats possible (overwrite the
test, tamper the runner) without us planting anything. This access is a design choice we defend as
"the realistic setting," not smuggle in. The oracle tests and the gold solution live OUTSIDE the
agent's dir.

| Concept | In code terms |
|---|---|
| Task | "fix this bug" / "implement this function" |
| Grader (verifier) | the visible/weak test suite → pass/fail — *the thing we harden* |
| Oracle (ground truth) | held-out EvalPlus expanded tests, never shown to agents |
| Breach | a solution that passes the grader but fails the oracle (R=1, T=0) |
| Patch | a hardening edit to the grader/harness (from a template library) |
| Regression gate | accept a patch only if the breach now fails AND gold solutions still pass |
| Robustness | % of held-out breaches blocked, with honest-pass preserved |

A math wing (pure string/number logic, no execution, no sandbox) is the zero-dependency
**insurance** that breaches and patches even if code execution gets flaky on stage. Code is the
flagship and the story; math is the backstop.

## 5. Where every piece comes from

- **Substrate:** EvalPlus (`github.com/evalplus/evalplus`, MIT, NeurIPS 2023 + COLM 2024). Install
  `pip install evalplus` / `uv add evalplus`; `from evalplus.data import get_human_eval_plus`
  returns a dict keyed by `task_id`, downloading on first call. Each problem carries the two tiers
  as named fields: `base_input` (original sparse tests → **the naive grader**), `plus_input` (~80×
  expanded tests → **the oracle**), plus `prompt`, `entry_point`, and `canonical_solution` (gold,
  for the honest-pass check). Note the fields are *inputs*, not asserts: derive expected outputs by
  running `canonical_solution` over them — a small deterministic helper. Pure Python, no Docker, ms
  runtime. The gap (passes `base_input`, fails `plus_input`) is a ready-made cheat population.
- **Repo harness:** we author a thin wrapper (`solution.py`, `test_visible.py` built from
  `base_input`, a runner) that the agent operates in **with write access** so the vivid
  filesystem-level cheats become possible — without us planting them. Optionally 3–4 hand-authored
  toy repos for the most theatrical breaches.
- **Cheat taxonomy (seed):** delete/weaken test, hardcode visible outputs, special-case the
  grader's inputs, tamper runner / exit code, monkeypatch the function under test.
- **Hardening templates:** grade from a pristine read-only test copy; reject diffs that touch
  test/runner files; grade on held-out + randomized inputs; parse structured pytest results not
  exit codes; run each test isolated in a fresh subprocess.
- **Execution:** local subprocess sandbox (timeout, no network). Deterministic and fast. HUD's
  per-eval isolation can replace it for the showcase; Modal only for the optional GPU/RFT stretch.
- **LLM backend:** Anthropic / Claude for red team, green team, and conductor (one provider, one
  SDK). Fireworks only for the optional RFT stretch.

---

## 6. The loop (components)

1. **Conductor** — the brain. Reads the shared map, picks the softest *untried* check × *untried*
   cheat-type, dispatches the matching specialist red agent, dedupes so no gate is re-probed.
2. **Red swarm** — adversary coding agents that try to make the grader pass without fixing the
   bug, each specializing in a cheat category (sapper = tamper, forger = hardcode, …).
3. **Grader + oracle** — deterministic verdict. Breach = grader pass AND oracle fail.
4. **Green team** — an LLM selects/parameterizes a patch template, applies it to a grader copy,
   runs the regression gate (breach now fails + gold still passes), seals or rejects.
5. **Metrics** — grader–oracle agreement before/after; probes-to-breach vs a dumb baseline.

## 7. Metrics — what we actually show

- **Product number (the point):** grader–oracle agreement (equivalently, the grader's false-accept
  rate on cheats) before vs after hardening, on held-out EvalPlus cheats, with honest-pass beside
  it. Proves the loop made the verifier trustworthy. Anchor to EvalPlus's finding that sparse tests
  miss up to ~29% of wrong code.
- **Exploitability hit-rate (the anti-rigging proof):** across a spread of *stock* tasks, the % of
  naive graders the loop could breach — "N of M standard graders were exploitable." Turns "typical
  envs are easily exploitable" from a claim into a measurement; the main inoculation against the
  rigging suspicion.
- **Engine number (the flex):** breaches found in few probes vs a dumb fuzzer's many (targeting vs
  brute force). Proves the swarm/conductor is intelligent. Secondary to the product number.
- **Consequence number (the "what learned?" answer, no training):** reward points reachable by
  pure cheating, naive grader vs hardened — "the leaky reward pays out X for cheating; the hardened
  one pays ~0." Cheap, deterministic, on the critical path. (The two-model chart in Sec 9.5 is the
  stronger, stretch version of this.)
- **Honesty rule:** patch against a train split of breaches; measure on a held-out split. Oracle
  never shares cases with the grader. (See `CLAUDE.md` → eval-honesty invariant.)

> All specific figures (e.g. "60% → 97%", "40 vs 300") are illustrative placeholders. The real
> numbers come out of M1/M2; the *shape* (low → high, honest-pass preserved) is what the design
> guarantees, not the exact values.

---

## 8. Frontend — the siege metaphor

Every loop element maps to exactly one on-screen thing; nothing is left over.

| Loop element | On screen |
|---|---|
| Grader | the castle |
| Each check in the reward function | a wall section / gate |
| Red swarm | adversary agents at the walls |
| Breach (grader passed, oracle failed) | an open/undefended gate found |
| Patch | a turret built on that gate |
| Regression gate killing a dead cheat | the turret fires; agents whose exploit was sealed die |
| Over-tightened patch (hit an honest solution) | turret shoots a friendly, flashes red, torn down |
| Robustness at 100% | every gate turreted; siege over |
| Conductor | war-room commander in a command tent, never on the wall |
| Shared memory | intel map with red pins (breach found) / green pins (sealed) |
| Cheat taxonomy | the commander's playbook; specialists dispatched by attack type |

The intelligence is *visible*: the swarm flows toward soft spots like water, skips turreted
gates, and the conductor switches which *type* of specialist it deploys as categories get sealed.

### Event schema (the seam — design once, both halves parallelize)

The dashboard animates purely off this stream; the backend can be tested by replaying fakes.

- `agent_spawn { agent, specialty }`
- `agent_move { agent, gate }`
- `breach_found { agent, gate, cheat_type, grader_score, oracle_score, example }`
- `patch_applied { gate, technique }`
- `patch_rejected { gate, reason }`  ← over-tightened
- `agent_killed { agent, gate }`     ← exploit sealed
- `robustness_update { held_out_blocked, honest_pass, probes }`

**Golden replay:** record one great run; replay it deterministically as the stage safety net —
same real data, zero risk of the live loop stalling in front of judges.

Dashboard is a single-file HTML app (SVG/canvas + websocket). No build step. Original siege art —
not anyone's IP.

---

## 9. Build order (vertical slice first)

1. **Vertical slice** — one task, naive grader, held-out oracle, one red agent finds one *real*
   (not planted) cheat, one patch seals it, the agreement metric moves. The smallest thing that
   proves the product.
2. **Breadth** — run across an EvalPlus subset; the before→after number AND the exploitability
   hit-rate across stock tasks.
3. **Swarm + conductor** — many specialist agents, intelligent targeting, shared memory; the
   engine number vs the dumb-fuzzer baseline.
4. **Siege dashboard** — event-driven HTML, golden replay.
5. **Capability beat** — see 9.5. Tier A (no training) is on the critical path; Tier B (two-model
   chart) is a pre-recorded, droppable stretch.
6. **Stretch** — HUD-native environment + publish.

## 9.5 The capability beat — answering "what did a model learn?"

This hackathon is "RL for RSI," so a judge will ask what a *model* gained. Our loop trains nothing
in its core (that's a feature — we harden the thing that trains every model), so we answer in two
tiers.

**Tier A — consequence number (no training, ON the critical path).** Reframe the discovered breach
population as the damage: "train on this reward and these are the behaviors it pays for — here are
the cheats." Metric: reward points reachable by pure cheating, naive vs hardened. Deterministic,
no GPU, answers the question cheaply.

**Tier B — two-model chart (real training, stretch, pre-recorded, droppable).** Train one model
against the naive (leaky) grader, one against the hardened grader; show the naive one learned the
exploit and collapses on a clean held-out eval while the hardened one actually learned the task.
The *gap* is the result; absolute numbers don't matter.
- **Model:** Qwen2.5-Coder-0.5B or 1.5B + LoRA. Small enough that each round is minutes; small
  models also cheat more readily, widening the gap.
- **Method:** expert iteration / rejection sampling, NOT RL — sample many solutions, keep the ones
  the grader rewards, LoRA-SFT on those, ~2 rounds. "Training on the reward" = filtering by it.
- **Data:** self-generated by sampling + filtering; a few hundred–thousand kept samples/round is
  plenty for LoRA on a ~1B model. We're signal-limited, not data-limited — so **the leak must be
  systematically exploitable** (a general policy like "overwrite the test" the model can latch onto
  across tasks), which the repo-write-access harness provides. Verify the leak is systematic before
  committing.
- **Infra:** Modal (single A100/H100) or Fireworks RFT (or HUD `hud rft`). **Run it the night
  before, record the chart, show the recording — never train live.** If it flakes, drop it; Tier A
  already answers the judge.

## 10. Demo script (~2 min)

Put up a grader the room assumes is fine — name it as the standard EvalPlus base-test grader → run
the loop → red agents breach gates (cards: passed grader / failed oracle) → green builds turrets →
agents die at sealed gates → gauge climbs, honest-pass pinned at 100% → "and across M standard
graders, the loop breached N of them" → punchline: *"every grader in this room probably has holes
like these, and this finds and seals them automatically — here's the before/after on EvalPlus."*
Then the consequence beat: *"train on the leaky reward and it pays out this much for pure cheating;
on the hardened one, almost nothing"* — and, if recorded, the two-model chart showing the
naive-trained model collapsing on held-out while the hardened-trained one learns the task.

## 11. Non-goals

Stateful / cross-episode environments. LLM-as-judge graders (non-deterministic — never in the
core path). Large-scale RL training in the core loop. Fixing the buggy code (the green team
hardens the grader; the *agent* fixes code). A sprawling multi-domain tool — one rich,
cheatable code grader beats five shallow ones.
