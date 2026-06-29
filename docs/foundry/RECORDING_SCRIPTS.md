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

*Order = the rubric: Multimodal → Multi-agent → Speed → Physical-AI. One unbribable deterministic judge is the spine of every beat.* File: `origin_track1_60s.mp4`.

| Time | Screen | Caption (burned-in) | Say (VO) |
|---|---|---|---|
| **0–3 HOOK** | Cold open on the split-screen loop-race mid-flight. LEFT `GPU baseline (same gemma-4-31b)`, RIGHT `Cerebras`. Right is rattling off verified loops; left has one. Live tok/s burned over each pane. | `Same model. Same task. The right side verifies 7 actions before the left finishes 1.` | "Two agents propose. One judge that can't be bribed. Watch the right side." |
| **3–11 STAKES** | Hard cut to `/foundry`. A real warehouse floor-plan **image** (PNG) drops onto the canvas. | `Origin: the control plane for autonomy. Gemma-4 proposes — a deterministic oracle ratifies every action.` | "Origin governs robots and software agents with one rule: capability is not permission." |
| **11–22 MULTIMODAL** | `/foundry`, click *Use the sample floor*. Left: the floor image. Right: gemma-4 **vision** reads it and a structured site map materializes — aisles, dock, shaded human-only zone. Stills only. | `gemma-4-31b vision (on Cerebras) reads a floor-plan IMAGE → structured site map. Image in, text out.` | "Gemma-4 sees the floor plan — a still image — and turns it into a map the system can reason over. The model proposes; deterministic code disposes." |
| **22–34 MULTI-AGENT** | `/soc` loop panel: **Planner** (gemma-4) proposes → arrow → **Guardian + deterministic oracle** stamp `finish / escalate / REFUSE`. A prompt-injected alert fools the LLM; the floor blocks it. Counter: `destructive executed: 0`. | `Two agents propose. A deterministic floor — never an LLM — ratifies. Injections fooled Gemma. The floor blocked them. 0 destructive executed.` | "The Planner proposes. The oracle — not another model — decides. It got fooled. Nothing destructive ever ran." |
| **34–46 SPEED** | Back to full split-screen; run it to a clean stop. Right (Cerebras) finishes **6–8 fully triaged + verified loops**; left (GPU) completes **1**. Both tok/s counters live (~1,300 Cerebras). | `Cerebras: ~1,300 tok/s, live from the API. ~7 verified loops vs 1 GPU call. Per-step verification is effectively free.` | "Cerebras makes verifying every single step effectively free — about seven verified loops in the time a GPU does one." |
| **46–55 PHYSICAL-AI (money beat)** | `/foundry`. A robot trace plans straight through the shaded human-only zone. Proposer says `FINISH`; oracle slams `REFUSE — POLICY: no live Passport grant`. Attach a Passport grant → re-run → same zone now passable → `FINISH`. | `Proposer said FINISH. Oracle said REFUSE — on policy, not just hazard. The robot's Passport: identity → authority → verified action.` | "Here's the whole game. The agent wanted to finish. The oracle refused — because it had no authority. Grant it, and the same move is allowed. Same engine governs the robot and the software agent." |
| **55–60 PAYOFF** | Black card, logo **ORIGIN**, sub-line. Static landing URL small at the bottom. | `Capability is not permission. Gemma-4 proposes. Origin ratifies — at Cerebras speed.` | (let the caption land) |

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
