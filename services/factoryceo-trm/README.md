# FactoryCEO-TRM

**A verifiable RL/RFT environment for autonomous factory operation.**

A humanoid robot can do the physical work. The hard part is the *brain*: read
messy plant context, propose actions, and never ship an infeasible plan.
FactoryCEO-TRM compiles chaos into structured state, scores every plan with a
verifier, and runs a TRM-style recursive **verify → repair** loop that drives
hard-constraint violations to zero before anything reaches the floor.

> **The pitch.** *"The CEO leaves for two weeks and operations keep running."*
> That claim is credible **by design, not by assertion**: the brain literally
> cannot emit a plan with machine overlap, missing material, an unqualified
> operator, or a hallucinated entity — the verifier gates it and the repair loop
> fixes it. **Brain decides → verifier gates → humanoid executes.**

## Architecture

```
synthetic scenarios (generator)
  → teacher (deterministic / Claude / Gemma-via-vLLM)  →  candidate ActionPlan
  → verifier + simulator         →  hard-constraint errors + profit + safety reward
  → recursive TRM repair loop    →  local repairs (move/swap/expedite/safety/…)
  → repeat until 0 hard violations & reward stops improving
  → VERIFIED reasoning traces    →  results/episodes.jsonl (SFT/preference/RFT)
  → distill a small TRM student  →  HUD env + GRPO  (Sillon recipe)
  → verified plan → humanoid     →  Isaac Sim/Lab + V-JEPA 2 perception
```

The emitted plan assigns each operation `{job, operation, machine, operator,
start, end}`. Operators are typed `human | robot` — a humanoid is just another
schedulable resource, so the plan JSON *is* the task queue a robot's control
stack would consume. We build the decision/verification layer, **not** motor
control (see Scope).

### The thesis (Sillon / RATP)

You don't need to train a frontier model. Pleias' *Sillon* (600M, built with the
Paris transit operator) matches/beats frontier LLMs on a narrow operational task
using **synthetic data + domain reasoning traces + a real verifier**. FactoryCEO
is the manufacturing analogue: a large teacher (Claude / Gemma) proposes plans,
the verifier + **TRM** repair loop produce *verified* traces, and those distill a
small specialized TRM student. **TRM stays the architecture** — the rule-based
repair model is just the v0 of the student. See [distill/RECIPE.md](distill/RECIPE.md).

### Pre-existing systems, no new research

| Capability | Off-the-shelf system used |
|---|---|
| Teacher model | Claude `claude-opus-4-8` / **Gemma** via **Fireworks AI** (serverless) or self-hosted **vLLM** ([src/llm.py](src/llm.py)) |
| Humanoid world model / perception | **V-JEPA 2** `facebook/vjepa2-vitl-fpc64-256` ([src/jepa.py](src/jepa.py)) |
| Training/eval environment | **HUD** (`hud-python`) env wrapper ([src/hud_env.py](src/hud_env.py)) |
| Natural-language reward + GRPO trainer | **RULER / OpenPipe ART** pattern ([src/ruler.py](src/ruler.py)) |
| Humanoid simulation | **NVIDIA Isaac Sim / Isaac Lab** ([isaac/](isaac/)) |

Adapters degrade gracefully: with no GPU / API key / Isaac install they fall back
to the deterministic path so the core pipeline + demo always run offline. The
heavyweight runtimes (vLLM serving, V-JEPA weights, Isaac Sim) run on your GPU box.

## Layout

| Path | Role |
|---|---|
| `src/schemas.py` | Pydantic world-state + action-plan models |
| `src/generator.py` | Synthetic high-mix factory + disruptions; `corrupt_plan`; `messy_prompt` |
| `src/verifier.py` | Hard constraints (structured errors) + soft reward + metrics |
| `src/baselines.py` | `greedy` (feasible EDD), `base_plan` (naive) |
| `src/repair_loop.py` | TRM-style recursive verify→repair loop |
| `src/data_export.py` | JSONL episodes (`observation / repair_trace / final_plan`) |
| `src/llm.py` | Pluggable planner: deterministic + Claude + **Gemma-via-vLLM** adapters |
| `src/jepa.py` | **V-JEPA 2** humanoid world-model / perception adapter |
| `seeds/` + `generator.amplify_seed` | **Seed corpus** (realistic factory situations) → SYNTH-style amplification + held-out eval split |
| `src/trm_student.py` | **TRM-native student** — ~3K-param tiny recursive net (learns the repair policy) |
| `src/closed_loop.py` | **TRM → Isaac → V-JEPA → reward** closed loop (offline stub / GPU-real) |
| `src/hud_env.py` | **HUD** environment wrapper (tools + scenario + normalized reward) |
| `isaac/` | **Isaac Sim/Lab** bridge (`plan_to_isaac.py`) + task skeleton |
| `distill/` | Teacher→student distillation recipe + SFT data-prep (Sillon-style) |
| `run.py` | Driver: scoreboard + `run_30day.json` + `episodes.jsonl` + `isaac_tasks.json` |
| `demo/` | Static web demo (matches thepursuits site; no backend) |
| `tests/` | Verifier / repair-loop / generator / **safety** tests (18) |

## Run it

```bash
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
./.venv/bin/python -m pytest -q              # 18 tests
./.venv/bin/python run.py --scenarios 25     # scoreboard + all artifacts
./.venv/bin/python distill/train_trm.py      # build SFT pairs from verified traces
./.venv/bin/python isaac/plan_to_isaac.py    # humanoid task queue for Isaac
```

### Demo website

```bash
python3 -m http.server 8731              # from this directory
# open http://localhost:8731/demo/
```

Four panels — **messy input → compiled state → recursive repair stepper →
scoreboard**. Step through the repair trace and watch hard violations fall to 0
while reward climbs.

## Example scoreboard (30-day run, avg over 25 scenarios)

| method | profit | on-time | invalid actions | trust | unsafe |
|---|---:|---:|---:|---:|---:|
| Base LLM (no verifier) | 18,103 | 93% | 10.8 | 17 | 1 |
| Greedy heuristic | 26,968 | 100% | 0 | 100 | 1 |
| LLM + verifier retry (K=3) | 22,598 | 96% | 5.3 | 55 | 1 |
| **FactoryCEO-TRM** | **25,760** | **97%** | **0** | **100** | **0** |

Raw LLM output is full of violations; capped retry recovers part of the loss;
the full recursive loop drives invalid actions to **zero**, restores trust to
**100**, and is the **only** method with **zero safety incidents** — that's what
makes 2 weeks of unattended operation defensible. (Note even greedy leaves a
safety incident — running a degraded machine without an inspection control — that
only the safety-aware repair loop resolves.)

### Reward = profit + safety

The verifier reward sums revenue/cost/lateness/utilization **plus** safety terms:
a penalty for each uncontrolled hazard (a degraded machine run without an
inspect/lockout; a human pushed into fatigue overtime) and a bonus for explicit
controls. The repair loop adds `safety_check` actions (inspect degraded machines,
slow down fatigued humans, prefer the 24/7 robot for off-hours) to drive safety
incidents to zero.

### Reward = verifier (hard) + RULER (soft)

A single scalar is too low-dimensional for operational *judgment* (Karpathy's RL
critique). So the HUD reward is a **hybrid** ([src/hud_env.py](src/hud_env.py)
`hybrid_reward`): the verifier is the trusted, un-gameable hard signal
(feasibility, profit, safety) and **RULER** ([src/ruler.py](src/ruler.py)) is an
LLM judge that scores soft quality (customer care, commercial judgment, safety
posture) from a plain-English rubric — the OpenPipe ART pattern. **The verifier
gates first**, so the judge can never rescue an infeasible/unsafe plan
(anti-reward-hacking). RULER uses Claude or Gemma-via-vLLM when reachable, else a
deterministic heuristic over the same dimensions so it runs offline. OpenPipe ART
can be the GRPO trainer for the distilled TRM student.

### SYNTH-style dataset

`results/episodes.jsonl` follows the PleIAs **SYNTH** recipe: each episode carries
`synth_id`, `exercise` task-type tags (scheduling / procurement / quoting /
customer_comms / quality / safety), `constraints` (generation params), a
`negative` flag (infeasible initial plan = a hard example), the verified
`repair_trace`, and a `ruler_soft` score. Scale with `python run.py --scenarios
1000`; swap the teacher to Claude/Gemma for richer proposals.

## Models, training, and humanoid (optional, GPU)

- **Teacher model (zero GPU).** `FireworksPlanner` ([src/llm.py](src/llm.py))
  calls **Fireworks AI** (serverless Gemma `accounts/fireworks/models/gemma-4-31b-it`)
  with `FIREWORKS_API_KEY` — no serving required. Or `VLLMPlanner`
  (`vllm serve …`) / `AnthropicPlanner` (Claude). No backend ⇒ deterministic
  fallback; output always goes through the verifier + repair loop. Same for the
  RULER judge: set `FACTORYCEO_RULER_LLM=1` to grade with the LLM
  (Fireworks/Claude/vLLM), else the offline heuristic.
- **Seed corpus (SYNTH/Sillon recipe).** A few realistic factory situations in
  `seeds/scenarios.json` (real machine fleets, material catalogs, job archetypes,
  disruption rates) get **amplified** with randomized constraints into many
  synthetic scenarios — grounded, not pure-random — with a held-out **eval**
  split (the verifier is our "real eval set").
- **Generate the corpus.** `python distill/gen_corpus.py --from-seeds --split
  train --teacher deterministic --scenarios 100` (free) or `--teacher fireworks`
  (serverless Qwen3.7 teacher, greedy-seeded) → `results/episodes.jsonl`.
- **Two students, same traces.**
  - *TRM-native* (headline): `python distill/train_trm.py` (chat-format SFT data
    for a Gemma student) **and** `src/trm_student.py` — a **2,954-param** tiny
    recursive net that learns the repair policy. Trained on amplified *train*
    seeds (automotive + electronics) it reaches **~89% train / ~82% on a held-out
    *medical-devices* domain** — a tiny model generalizing across factory domains
    (the Sillon thesis). CPU, seconds. Plugged in as the **live repair controller**
    (`repair_loop(..., op_selector=LearnedRepairModel().pick_op)`) it drives
    held-out scenarios to **0 hard violations (12/12), matching the rule-based
    baseline** — the learned student now *acts*, with the rule-based loop as the
    guaranteed-feasible floor.
  - *small Gemma* (optional): SFT the HF chat-format `messages` data on Fireworks
    (Gemma is tunable there), then GRPO against the HUD reward. See
    [distill/RECIPE.md](distill/RECIPE.md).
- **HUD / GRPO.** Two paths, both real:
  - *Local (no key):* `python distill/grpo.py --scenarios 4 --group 6` — rollouts
    → `hybrid_reward` → `group_relative` GRPO advantages.
  - *Hosted (works):* `distill/hud_app.py` is a real HUD v6 `Environment`
    (`@env.template`, graded by our verifier). `./.venv-hud/bin/python
    distill/hud_run.py` drives a HUD gateway baseline through it → a graded `Run`.
    Prefer an open baseline with `HUD_BASELINE_MODEL=gemma` or `qwen`; Claude is
    only a fallback registry sanity check. Needs `HUD_API_KEY` + the **`.venv-hud`**.
    The **TRM/JSON repair policy runs as a real HUD agent too**
    (`distill/hud_trm_agent.py` — a gateway-agent subclass whose brain is the TRM
    controller; `distill/hud_run.py` runs the head-to-head). Recent smoke:
    **TRM/JSON repair policy = 0.971 vs fallback gateway = 0.000** on the same HUD
    task. This is HUD grading; Gemma/Qwen GRPO weight updates are the separate
    open-student training path fed by the local `grpo.py` advantages.
- **Humanoid (3 backends, one `Executor` interface).** All consume the verified
  plan's task queue (`isaac/plan_to_isaac.py`) and feed frames to V-JEPA 2
  (`src/jepa.py`):
  - **Browser (three.js)** — the visible demo: a humanoid walks the shop floor in
    `demo/` (panel 05). No GPU, runs on macOS, embeds in the static Space.
  - **MuJoCo** (`closed_loop.MuJoCoExecutor`) — native physics on macOS, **no GPU,
    no cloud credits**. Built-in shop-floor scene (swap in a Menagerie G1/GR-1).
    Verified: rendered a humanoid rollout in ~0.8s and **real V-JEPA 2 scored it
    0.89** on-device. This replaces Isaac for a Mac demo.
  - **Genesis** (`closed_loop.GenesisExecutor`, `pip install genesis-world`) —
    cross-platform; shines for NVIDIA-GPU massively-parallel sim (cloud-scale
    training), not clearly better than MuJoCo on a Mac.
  - **Isaac Sim/Lab** (`isaac/factory_humanoid_task.py`, `IsaacExecutor`) — cloud
    GPU (Isaac doesn't run on macOS); production scale. Demo online via headless
    container (Brev/RunPod) → recorded MP4 or WebRTC stream.
  - `src/closed_loop.py` ties it together: TRM → plan → executor → V-JEPA → reward.

## External services / Spaces we can tap into

We don't host the heavy parts ourselves — we tap external, ready-made services:

| Need | Tap into |
|---|---|
| Serve Gemma (teacher / RULER judge) without our own GPU | **Fireworks AI** (serverless `accounts/fireworks/models/gemma-4-31b-it`); or **Modal** / **Replicate** / **TGI**; vLLM only if self-hosting |
| Train the small TRM student (GRPO + RULER) | **OpenPipe ART** (github.com/OpenPipe/ART) — same trainer as the Qwen3-1.4B demo |
| Run / publish the RL environment + leaderboard | **HUD** cloud (hud.ai) — `hud push`, run Tasksets, eval against frontier agents |
| Humanoid assets + sim | **Isaac Lab** robot assets (Unitree G1, Fourier GR-1), **NVIDIA Omniverse** |
| V-JEPA 2 weights / embeddings | **HF Hub** `facebook/vjepa2-*`; HF Inference for feature extraction |
| Seed / synthetic data at scale | **PleIAs SYNTH** + **Common Corpus** on HF Hub |
| Ship the live demo externally | Deploy `demo/` as a **HF Static Space** (or Vercel/GitHub Pages) — it's backend-free; commit `results/*.json` alongside |

The demo is already a static, backend-free site, so publishing it as a Hugging
Face **Static Space** (or any static host) is a drop-in. Build + publish (the
Space is created **private**):

```bash
python space/build_space.py        # assembles space/site/
# needs an HF token with WRITE / create-space permission:
python - <<'PY'
from huggingface_hub import HfApi
api = HfApi(); user = api.whoami()["name"]
rid = f"{user}/factoryceo-trm-demo"
api.create_repo(rid, repo_type="space", space_sdk="static", private=True, exist_ok=True)
api.upload_folder(repo_id=rid, repo_type="space", folder_path="space/site")
print("https://huggingface.co/spaces/" + rid)
PY
```

## Sources

- Pleias — *Sillon: a specialised 600M model for the Paris subway operator (RATP)*; paper *"Model in Distress: Sentiment Analysis on French Synthetic Social Media"*; Pleias SYNTH dataset.
- V-JEPA 2 — [facebook/vjepa2-vitl-fpc64-256](https://huggingface.co/facebook/vjepa2-vitl-fpc64-256).
- HUD — [docs.hud.ai](https://docs.hud.ai), [hud-evals/hud-python](https://github.com/hud-evals/hud-python).
- vLLM + Gemma — [google/gemma-2-9b-it](https://huggingface.co/google/gemma-2-9b-it).
- NVIDIA Isaac Sim / Isaac Lab.

## Scope (from the handoff brief, §12)

No real robot control. No real PLC/MES/ERP integration. No claim of unbounded
real-factory autonomy. This is a clean verifiable environment + recursive repair
loop + metrics + RFT data export. Autonomy claims stay bounded by what the
verifier actually gates.
