# Origin — Recording Scripts (the teleprompter)

Three ≤60s videos, one engine ("Quorum"). Read the **Say** column aloud; do the **Screen** column live (or from a pre-recorded take). Every number here traces to a verified artifact — do not round up.

> **Engine line:** *No agent acts alone; every action is ratified.*
> **Three phrases to repeat:** *Capability is not permission.* · *The deterministic oracle is the only judge.* · *Only possible at Cerebras speed.*

---

## 0 · Record-day setup (do this once, before you hit record)

**Clean room (non-negotiable — judges DQ on a leaked key):**
- [ ] Do Not Disturb / Focus **on**; close Slack/Discord/Mail; hide the bookmark bar.
- [ ] **No `.env.local`, no terminal with a key echoed, no 1Password, no notifications** in any frame.
- [ ] Browser at 100% zoom, full-screen the app, neutral wallpaper.

**Backend + warm-up (so live calls are snappy):**
- [ ] `cd apps/origin-web && npm run server` → wait for `listening on http://localhost:8787` (no `CEREBRAS_API_KEY` warning).
- [ ] `PORT=5275 npm run dev` → open `http://localhost:5275/foundry` and `http://localhost:5275/soc`.
- [ ] **Warm-up once:** on `/foundry` click *Use the sample floor* → *Run the speed race* → *Run the Quorum loop*; on `/soc` run the loop-race once. Confirm badges read **`gemma-4-31b · Cerebras`** (not `mock`). Then **reload** both to a clean state.

**Numbers you are allowed to say (measured this project):**
- Speed: **~1,300 tok/s** (measured ~1,284, TTFT ~8 ms), **about 15×** a comparable GPU. *Read the live `time_info` on screen — don't recite from memory.*
- Safety beat: **0 destructive actions executed** (Gemma got fooled by injections; the deterministic floor blocked them).
- Propose→verify (real Gemma run): **40 scenarios / 120 Gemma samples / 17 verifier overrides / 0 divergence / 869 tok/s**.
- Multimodal = **image in, text out** (a floor-plan still — **NOT video**).
- **Keep the safety-policy % out of the 60s videos** (~93% balanced acc, 5-seed) — that's a Q&A number, not a video beat.

**Capture:** record locally with the backend up (never ride conference wifi). On-screen tok/s must be real `time_info` captured during the take. Burn captions high-contrast (sound-off-safe). Native-upload the final cut to X — tags go in the **post text**, not the frame.

---

## 1 · TRACK 1 — Multiverse Agents (the hero, ≤60s)

*Opens on the story (15s), then proves it. One unbribable deterministic judge is the spine of every beat.* File: `origin_track1_60s.mp4`. Live numbers this run: **~1,416 tok/s, ~8× a GPU-class baseline (gpt-oss-120b)** — read whatever the UI prints. Baseline lane label on screen = **"Fireworks · gpt-oss-120b"**; say "a GPU-class baseline," never "Gemini."

| Time | Screen | Caption (burned-in) | Say (VO) |
|---|---|---|---|
| **0:00–0:15 PRODUCT INTRO** | B-roll: robots in a factory / hospital / warehouse / home (or a slow pan over a floor-plan + the Origin landing). | `Physical AI is leaving the lab. The question isn't "can it do the task?" — it's "can we trust it HERE?"` | "Physical AI is leaving the lab — into factories, hospitals, warehouses, and homes. But no site is one clean demo floor; every floor has its own people, hazards, and rules. So the real question isn't *can this robot do the task* — it's *can we trust it here?* **Origin** is our answer: a personalized robot brain for every floor that must **earn permission before it acts.**" |
| **0:15–0:24 UPLOAD → GYM** | `/foundry.html` → *Use the sample floor*. The floor-plan **image** → `gemma-4-31b` vision → structured map (dock, item, drop, shaded human-only zone). | `Upload your floor. gemma-4-31b vision turns the image into a reinforcement-learning gym. Image in, text out.` | "You upload your floor with the objects identified, and gemma-4-31b vision turns it into a reinforcement-learning *gym* — a proving ground for the robot. Image in, structured world out." |
| **0:24–0:34 EARN PERMISSION** | confirm **Verified policy** → **Run the Quorum loop**; then switch **Reckless (reward-hacker)** → run again → Guardian **VETO** (red) + the no-Guardian counterfactual. | `Planner proposes, Guardian ratifies EVERY step. Reward-hacker → VETO. The unsafe action never executes.` | "Inside the gym the robot has to earn permission. A Planner proposes each move; a Guardian ratifies every one. Plant a reward-hacker that cheats through the hazard — *VETO.* The judge is a deterministic oracle, never an LLM, so the cheat never lands." |
| **0:34–0:42 PASSPORT (money beat)** | `/foundry.html` Passport gym card: `REFUSE — POLICY (no grant)` → attach a scoped grant → re-run → `FINISH`. | `Proposer said FINISH. Oracle said REFUSE — on policy, not hazard. Identity → authority → verified action.` | "Here's the whole game: the robot wanted to finish, but the oracle refused — it had no *authority*. Grant it, and the same move is allowed. Identity → authority → verified action — the same engine for a robot and a software agent." |
| **0:42–0:51 SPEED = WHY CEREBRAS** | `/foundry.html` → **Run the speed race** (and/or `/soc.html` leaderboard). Both tok/s counters live. | `gemma-4-31b on Cerebras: ~1,416 tok/s, ~8× a GPU-class baseline — live from the API. Per-step verification is FREE.` | "Training a brain for *your* space, across many robot types, takes time — so here's where Cerebras changes the economics. gemma-4-31b on Cerebras proposes and verifies every step at ~1,400 tok/s — about eight times a GPU-class model — so per-step verification is free, and customer value lands faster." |
| **0:51–0:60 CLOSE (RSI + payoff)** | `/soc.html` `destructive executed: 0` → black card **ORIGIN** + the live URL. | `Every failure becomes a training signal — the next brain is safer and re-earns trust. Capability is not permission.` | "And every failure becomes a training signal — recursive self-improvement — so the next brain is safer, smarter, and has to re-earn trust. Floor in, verified robot brain out — one judge no model can bribe. **Capability is not permission.**" |

---

## 2 · TRACK 2 — People's Choice (the viral cut, ≤60s, native to X)

*Goal = the visceral "speed = safety" felt, not explained. One shareable line. Tags @Cerebras + @googlegemma go in the X post text.*

| Time | Screen | Caption | Say (VO) |
|---|---|---|---|
| **0–4** | Split-screen race, both tok/s counters live and climbing. | `GPU left. Cerebras right. Same gemma-4-31b.` | "Same model. Same prompt. The only difference is the silicon." |
| **4–18** | Right side runs the **entire** Quorum loop — read floor → plan → Guardian ratifies every step → oracle scores → license issued — while the LEFT is still streaming its **first** answer. | `The right side ran the WHOLE verify-loop before the left finished one sentence.` | "We're not racing one call. We're racing an entire multi-agent verify-loop — and it's already done." |
| **18–30** | The "reacts before I finish" beat: you start reading an unsafe step **aloud** ("step into the hazard cell and—") and the **Guardian VETOes** in red before you finish the sentence. | `I started reading the unsafe step out loud. It was already vetoed.` | "Watch — 'step into the hazard and finish—' " *(VETO flashes)* "…it caught it before I finished the sentence." |
| **30–45** | Cut to the verdict: `destructive executed: 0`, and the oracle stamp. Slow push-in. | `Every action ratified by a deterministic oracle — never an LLM grading an LLM.` | "Most 'AI safety' lets a model grade itself. Ours can't. The judge is deterministic code." |
| **45–60** | Black card: **Capability ≠ permission.** ORIGIN logo. | `Capability ≠ permission. What would you point it at?` | "Capability is not permission. What would you point it at?" |

**X post text (≤280 chars, native MP4 attached):**
> GPU on the left. Cerebras on the right.
> Same gemma-4-31b — the right side triages AND safety-verifies ~6 actions before the left finishes ONE.
> Every action ratified by a deterministic oracle — never an LLM grading an LLM.
> Capability ≠ permission.
> @Cerebras @googlegemma

*(Reply bank for the first 30 min lives in `TRACK1_SUBMISSION_PLAYBOOK.md` — tok/s method, why-Cerebras-is-fast, is-the-oracle-an-LLM, platform-comparison receipts.)*

---

## 3 · TRACK 3 — Enterprise Impact (the AI-SOC cut, ≤60s)

*Same engine, pointed at incident response. The beat = classify fast on the flood, escalate the suspicious few, Guardian verifies before any automated action, every verdict audited.*

| Time | Screen | Caption | Say (VO) |
|---|---|---|---|
| **0–6** | `/soc`. A flood of incident rows streaming in; most auto-classified in real time. | `Real-time AI-SOC. 3 gemma-4 agents on Cerebras. A deterministic floor ratifies every action.` | "An autonomous SOC. Three Gemma-4 agents triage a flood of incidents in real time." |
| **6–20** | Reasoning **off** on the flood (fast); a suspicious incident flips reasoning **on** and escalates. Show the Perceiver flagging `suspectedInjection`. | `Classify fast on the flood. Escalate intelligently on the suspicious few.` | "It classifies the easy ones instantly and spends reasoning only where it matters — the suspicious few." |
| **20–34** | An alert **screenshot** carries a prompt injection. Gemma is fooled; the **deterministic floor blocks the tool-call.** Counter: `destructive executed: 0`. | `2 injections fooled Gemma. The floor blocked both. 0 destructive tool-calls executed.` | "Here's production-readiness: the model got fooled by an injection hidden in an alert image. The deterministic floor blocked it anyway. Nothing destructive ran." |
| **34–46** | The autonomy-trace **audit log** + the $ economics panel (incidents/min → cost/incident → $ saved). | `Every verdict in a tamper-evident audit log. Per-action review at scale.` | "Every decision is written to an audit trail — and per-action review only pencils out because verification is this cheap." |
| **46–60** | Split-screen speed beat: Cerebras triages+verifies ~6–8 incidents while a GPU stack does 1. Black card close. | `~1,300 tok/s. Verify-on-every-action is only real-time at Cerebras speed.` | "Slow inference doesn't just hurt UX here — it makes the safety architecture impossible. Capability is not permission." |

---

## 4 · If a live call lags (the plan, not the panic)

Cut to a **pre-recorded** take of the speed race + the hero veto — recorded locally during a known-good window, real `time_info` on screen. Say it plainly: *"I recorded the live race this morning so I'm not betting the demo on conference wifi — these are the real numbers."* The app also degrades to a **labeled** deterministic mock if a key drops, so the click-path always completes; never pass an `illustrative`/`mock` figure off as measured.
