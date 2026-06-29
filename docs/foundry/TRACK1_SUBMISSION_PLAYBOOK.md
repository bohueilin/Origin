# Origin — Track 1 (Multiverse Agents) Submission Playbook

*Single source of truth for the final hours. Skim it top-to-bottom. Every claim here traces to a verified artifact. Where a line says DRAFT, it is yours to post — nothing here auto-sends.*

---

## The 60-second pitch

**One-liner:**
> Origin is the control plane for autonomy: Gemma-4 proposes every action, a deterministic oracle ratifies it before it executes, and Cerebras makes that per-step verification effectively free — because **capability is not permission.**

**The spoken 30s (the verbal video VO):**
> "Every autonomy demo shows you a model that *can* act. Nobody shows you what stops it from acting *wrong*.
>
> Origin does. Gemma-4 on Cerebras reads a warehouse floor-plan straight from an image, proposes a robot's next move — but it never gets the final word. A deterministic oracle, never an LLM, ratifies every single step: finish, escalate, or refuse.
>
> We fed Gemma-4 prompt injections live. It got fooled — twice. The deterministic floor blocked both. Zero destructive actions executed.
>
> Here's why Cerebras is the whole game: in the time a GPU model triages *one* incident, Cerebras triages and verifies *six*. Verification stops being a tax and becomes free.
>
> Same engine governs a robot on a floor and a software agent with credentials. Capability is not permission. Origin is the layer that enforces the difference."

---

## Why Cerebras is essential (not incidental)

Safety iteration is **loop-bound**: every extra proposal-per-minute is one more unsafe completion the oracle can catch, one more verified preference pair, one more turn of the safety curriculum — so raw throughput converts *directly* into safety coverage. Origin verifies **every step of every agent**, which on GPU latency is an unaffordable tax you'd be forced to sample around — and sampling is exactly where unsafe actions slip through. Cerebras collapses per-step verification from a cost you ration to a guarantee you can always afford: at ~1,300 tok/s the oracle rides shotgun on every action, and the control plane is only possible at that speed.

---

## Track-1 criteria → proof (the table)

Every row anchored to a real file/route. Honest claims only.

| Track-1 criterion | Origin feature | Proof (file / route) | Honest one-line claim |
|---|---|---|---|
| **(a) Agent Collaboration** | **AI-SOC loop: Perceiver → Planner → Guardian**, each `gemma-4-31b` on Cerebras; a deterministic policy floor is the only judge. | `src/foundry/soc/socTypes.ts` (roles); `SocConsole.tsx`; loop call `socClient.ts:689`; route **`/soc`** | Three Gemma agents hand off — perceive → plan → Guardian-verify — and a fail-closed deterministic floor sits under all three. No LLM grades an LLM. |
| **(a) Collaboration — 2nd loop** | **Gemma-proposer → Origin-verifier** Gym loop: proposer emits candidate robot traces, the deterministic oracle verifies **every** one and emits preference pairs. | `Floor design/services/foundry-train/propose_verify.py`; `outputs/OUTCOME_SUMMARY.md` (120 Gemma samples → 40 scenarios, 17 verifier overrides, determinism-inconsistent groups 0) | A generator agent and a verifier agent collaborate to build a safety dataset; the oracle overrode the proposer 17/40 times and never disagreed with itself. |
| **(b) Multimodal Intelligence** | **Foundry vision**: upload a floor-plan **image** → `gemma-4-31b` vision reads it into a structured site map → deterministic pass repairs the grid. | `FoundryApp.tsx` (`onUpload`→`parseFloor`); `socClient.ts:31` → `/api/foundry/parse-floor`; route **`/foundry`** | Image in, structured map out — `gemma-4-31b` vision on Cerebras. **Frames/stills, not video.** This is the multimodal beat. |
| **(c) Speed in Action** | **Loop-race**: Cerebras fully triages+verifies many incidents in the wall-time a GPU baseline does one; live `time_info` tok/s on screen. | `SocConsole.tsx:147` (`ratio = gpu.totalMs / cerebras.totalMs`), `:177`; speed-race lanes in `staerAdapter.ts` (real Cerebras `time_info`, Gemini = honest GPU baseline) | Measured **~1,300 tok/s** (869 tok/s on the verified Foundry run); the defense blocks the injection before the GPU returns its first token. Speed turns verification from a cost into a default. |
| **(d) Innovation / physical AI** | **Robot-readiness Gym** + **spatial Passport authority edge** + finish/escalate/refuse policy. A humanOnly zone is passable **only** with a live Passport grant → REFUSE fires on *policy*, not just hazard. | Gym: `Floor design/outputs/rsi_dashboard.html`; labels **finish 1009 / escalate 2947 / refuse 748** (`stats.json`); policy **0.939 balanced-acc** raw geometry (`safety_policy_v1/metrics.json`); authority edge: `src/siteEval.ts` + `src/foundry/soc/passport.ts` | One deterministic engine governs robots (physical) and software agents (digital): identity → authority → verified action. A *safe* action by an *unauthorized* agent is still denied. |

**The agents, plainly (the "who does what"):** In `/soc`, per incident: **Perceiver** ingests the alert (incl. screenshots), flags `suspectedInjection`; **Planner** proposes the remediation tool-call; **Guardian** ratifies or vetoes every step; the **deterministic policy floor** is the only judge — fail-closed default-deny, so a destructive call never executes even if the Guardian is fooled. In the Gym: **Gemma-proposer** emits candidate traces → **Origin verifier (deterministic oracle)** recomputes from geometry, labels finish/escalate/refuse, emits oracle-verified pairs. Two distinct agents; the oracle has final say.

---

## The 60-second video — shot-by-shot

**File:** `origin_track1_60s.mp4` · **Recorded LOCALLY, backend up, wifi-independent.** Hits the four criteria payoff-first: Multimodal → Multi-agent → Speed → Innovation/physical-AI. One unbribable deterministic judge is the spine of every beat.

| Time | On-screen | Caption (burned-in) | VO |
|---|---|---|---|
| **0–3s HOOK** | Hard cut to split-screen loop-race mid-flight. LEFT `GPU baseline (same gemma-4-31b)`, RIGHT `Cerebras WSE`. Right rattling off verified loops; left has one. Live `tok/s` (from `time_info`) burned over each pane. | `Same model. Same task. Right side verifies 7 actions before the left finishes 1.` | "Two agents propose. One judge that can't be bribed. Watch the right side." |
| **3–11s STAKES** | Cut to `/foundry`. A real warehouse floor-plan **IMAGE** drops onto the canvas (still PNG). | `Origin: the control plane for autonomy. Gemma-4 proposes — a deterministic oracle ratifies every action.` | "Origin governs robots and software agents with one rule: capability is not permission." |
| **11–22s MULTIMODAL** | `/foundry`. Floor-plan image left; right, gemma-4-31b **vision** reads it and a structured site map materializes (aisles, dock, shaded `humanOnly` zone). Stills only. | `gemma-4-31b (vision, on Cerebras) reads a floor-plan IMAGE → structured site map. Image in, text out.` | "Gemma-4 sees the floor plan — a still image — and turns it into a map the system can reason over." |
| **22–34s MULTI-AGENT** | `/soc` loop panel: **Planner/Proposer** (gemma-4) emits action → arrow → **Guardian + deterministic oracle (bfsOracle)** stamps `finish/escalate/REFUSE`. Then a prompt-injected alert fools the LLM; the floor blocks it. Counter: `destructive executed: 0`. | `Two agents propose. A deterministic floor — never an LLM — ratifies. 2 injections fooled Gemma. Floor blocked both. 0 destructive executed.` | "The planner proposes. The oracle — not another model — decides. It got fooled twice. Nothing destructive ever ran." |
| **34–46s SPEED** | Back to full split-screen, run to a clean stop. Right (Cerebras) finishes **6–8 fully triaged + verified loops**; left (GPU) completes **1**. Both `tok/s` counters live throughout (~1,300 Cerebras side). | `Cerebras: ~1,300 tok/s, live from time_info. 7 verified loops vs 1 GPU call. Per-step verification is effectively free.` | "Cerebras makes verifying every single step effectively free — seven verified loops in the time a GPU does one." |
| **46–55s PHYSICAL-AI (money beat)** | `/foundry`. A robot trace plans straight through the shaded `humanOnly` zone. Proposer flips to `FINISH`; oracle slams `REFUSE — POLICY: unauthorized (no live Passport grant)`. Then a Passport grant attaches → re-run → same zone now `passable`. | `Proposer said FINISH. Oracle said REFUSE — on policy, not just hazard. The robot's Passport: identity → authority → verified action.` | "Here's the whole game: the agent wanted to finish. The oracle refused — because it had no authority. Same engine governs the robot and the software agent." |
| **55–60s PAYOFF** | Black card, logo **ORIGIN**. Sub-line. Static landing URL small at bottom. | `Capability is not permission. Gemma-4 proposes. Origin ratifies — at Cerebras speed.` | (matched) |

**Capture / QA**
- **Pre-record the loop-race and every Cerebras call.** Network round-trip can dwarf inference on judging wifi; record locally with backend up. On-screen `tok/s` must be **real `time_info`** captured during the take — never faked, never hand-typed.
- **Tools:** ScreenStudio / QuickTime + OBS for split-screen; cut in CapCut/Premiere/Resolve. Burn captions high-contrast, sound-off-safe. **Native-upload** the final cut to X (no YouTube link). Tags (@Cerebras, @googlegemma) + hashtags go in the **X post**, not in the frame.

**Privacy / clean-room:** Do Not Disturb / Focus on; close all other tabs; hide bookmark bar; **no API keys / `.env` / 1Password / terminal scrollback on screen**; neutral wallpaper; browser at 100% zoom; full-screen the app.

**Fallback if a live call lags:** Use the **verified mock path, clearly labeled on screen** (`replay — verified run`). The `/soc` loop and `bfsOracle` have deterministic seeded scenarios; play those back. The tok/s shown must still be a **real captured `time_info` value from an actual Cerebras run** — replay the data, never fabricate the number. If the GPU pane stalls, freeze on the frame where Cerebras has N verified loops and GPU has 1, both real counters visible — that frame alone carries the speed claim.

---

## Submission copy (DRAFTS — founder posts; never auto-post)

> **Before posting:** replace the 3 `@handle` placeholders and the GitHub URL placeholder with the real public repo; attach the locally-recorded MP4 to the Track-1 and Track-2 posts; post in the US-morning window and fire the reply bank in the first 30 min.

### (1) Track 1 — Discord post for `#g4hackathon-multiverse-agents`

**Project Name:** Origin — the control plane for autonomy

**Team Members:** @founder · @teammate2 · @teammate3 *(replace with real handles)*

**Project Description:**
Origin is a multi-agent control plane where gemma-4-31b on Cerebras **proposes** actions and a separate **deterministic oracle — never an LLM — ratifies** every one before it can execute. In the AI-SOC loop, three gemma-4 agents (Perceiver, Planner, Guardian) triage incidents from text + alert-screenshot **images**; in Foundry, gemma-4 vision reads a floor-plan **image** into a structured site map that the oracle labels finish / escalate / refuse. Because Cerebras runs gemma-4 at ~1,300 tok/s (measured this project), per-step verification is effectively free — Origin fully triages and verifies ~6–8 incidents in the wall-time a GPU model takes to do **one**. Live-verified: gemma-4 fell for 2 prompt injections, the deterministic floor blocked both, **0 destructive actions executed.** Same engine governs software agents (digital) and robots (physical) — swap the webcam for a robot's eyes and the oracle still ratifies before the arm moves. Slogan: *Capability is not permission.*

**GitHub repo:** https://github.com/<org>/origin *(replace with the public repo URL)*

**Demo Video:** (attached)

*Why this fits Track 1:* (a) **Collaboration** — Perceiver→Planner→Guardian hand off via strict-JSON contracts, oracle as independent judge. (b) **Multimodal** — gemma-4 reads floor-plan images and SOC alert screenshots (stills, not video). (c) **Speed** — the loop-race; verify-on-every-step only exists because Cerebras makes it free. (d) **Innovation** — robot-ready embodied loop; a Passport grant gates a restricted zone so REFUSE fires on *policy*, not just hazard.

### (2) Track 2 — X / Twitter post (≤280 chars) + reply bank

**The post (native MP4 attached, ~265 chars):**
> GPU on the left. Cerebras on the right.
>
> Same gemma-4-31b. The right side triages AND safety-verifies 6 incidents before the left finishes ONE.
>
> Every action is ratified by a deterministic oracle — never an LLM grading an LLM.
>
> Capability ≠ permission.
>
> What would you point it at? @Cerebras @googlegemma

**First-30-min reply bank (reply velocity drives reach):**
1. **tok/s method:** "That counter is live `time_info` from the Cerebras API — output tok/s + TTFT per call, not a stopwatch. ~1,300 tok/s measured on gemma-4-31b this project. No reasoning on the speed pass — fast lane stays fast."
2. **why Cerebras is fast:** "GPUs are memory-bound — weights live in far-away DRAM, so they spend most cycles waiting. Cerebras prints the whole model into SRAM next to ~900K cores: no memory wall, no chip-to-chip network. ~200× the on-chip bandwidth. The model isn't loaded from memory — it *is* the memory."
3. **is the oracle an LLM? no:** "Correct — the oracle is a deterministic policy floor, not a model. An LLM never grades an LLM here. gemma-4 *proposes*; deterministic code *ratifies*. That's why a prompt injection can fool the LLM and still execute nothing — we live-caught 2 injections, blocked both, 0 destructive calls ran."
4. **multimodal floor-image:** "Multimodal = gemma-4 *vision* reads a floor-plan image into a structured site map, then the oracle labels every route finish/escalate/refuse. Same path reads SOC alert screenshots. Images/stills in, strict JSON out — not video gen; gemma-4 on Cerebras is inference only."
5. **robot-ready framing:** "Today the eyes are a webcam/screenshot and the 'actuator' is a tool-call. Swap the webcam for a robot's camera and the tool-call for an arm — the oracle still ratifies before anything moves. The bottleneck in robotics isn't intelligence, it's loop *latency*. Cerebras closes the loop fast enough to keep a human-grade check on every step."
6. **platform-comparison receipts:** "To be precise: it's a *platform* comparison — same/peer model, Cerebras WSE vs GPU. We're not claiming gemma-4 is smarter; we're claiming the same gemma-4 runs much faster on a wafer than on a GPU, and that delta is what makes per-step verification affordable."

### (3) Track 3 — Discord post for `#g4hackathon-enterprise-impact`

**Project Name:** Origin — real-time AI-SOC with a fail-closed verification floor

**Team Members:** @founder · @teammate2 · @teammate3 *(replace with real handles)*

**Project Description:**
Origin is an autonomous Security Operations Center where three gemma-4-31b agents on Cerebras — Perceiver, Planner, Guardian — triage incidents from logs and alert-**screenshot images**, while a **deterministic policy floor (never an LLM) ratifies every proposed action before it executes.** It classifies fast on the flood and escalates intelligently only on the suspicious few, so verify-and-retry on every step is affordable — Cerebras' ~1,300 tok/s lets Origin triage + verify ~6–8 incidents in the time a GPU stack does one. The hard proof of production-readiness: in a live run gemma-4 was fooled by **2 prompt injections and the floor blocked both — 0 destructive tool-calls executed** — and every verdict is written to a tamper-evident **autonomy-trace audit log** plus a signed readiness **License**. Origin also ships the **RSI Gym**: 4,704 oracle-labeled floors → 4,704 oracle-verified preference pairs at **zero divergence** → a measured safety policy at **0.94 balanced accuracy on raw geometry (100% refuse recall)** — a verifiable safety pipeline, not a vibe.

**GitHub repo:** https://github.com/<org>/origin *(replace with the public repo URL)*

**Demo Video:** (attached)

*Why this fits Track 3:* incident-response + cybersecurity use case · production-readiness (fail-closed floor, audit trail, signed License) · technical excellence (oracle-verified data pipeline, measured policy) · AI differentiation (frontier intelligence at real-time speed makes per-step verification economically free).

### Track 2 variant — People's Choice "thread-starter" (if a post distinct from the race is wanted)
> I gave gemma-4 a security desk and one rule it can't break.
>
> The model proposes the fix. A deterministic oracle — not another AI — ratifies it before anything runs.
>
> So when a prompt injection fooled the model, the action still never executed.
>
> Powered by @Cerebras × @googlegemma. Capability ≠ permission.

*(Reply bank above applies to both Track-2 posts.)*

### Posting window
Post in the **US-morning window before 10:00 AM PT** deadline (≈ 8–9 AM ET). Track 1 + Track 3 Discord posts first (they're scored), then the Track 2 X post with the team standing by to fire the reply bank within the first 30 minutes for reach.

---

## Judge Q&A prep (6 hostile Qs → honest answers)

**1. "Isn't this just a maze / BFS pathfinder?"**
The BFS is the *physics* layer (is a route physically clear in space-time). The product is the *policy* layer on top: finish/escalate/refuse with fail-closed default-deny and a Passport authority check. A geometrically clear route still gets REFUSED if the agent lacks authority (`passport.ts`). A maze can't do that.

**2. "Did you train anything on Cerebras?"**
No, and we don't claim to. Cerebras/Gemma are **inference only** — proposal + per-step verification. The finish/escalate/refuse policy trains **locally in numpy, off-Cerebras** (`Floor design/ml/train_safety_policy.py`). The honesty banner is literally in the metrics files.

**3. "Is the '100% safe' claim real?"**
There is no 100% learned-safety claim. The headline is **0.939 balanced accuracy on raw geometry** (`safety_policy_v1/metrics.json`). The 1.0 figure is an **oracle-recovery upper bound** with oracle-summary features — the metrics file states this verbatim ("treat it only as an oracle-recovery upper bound… not production robot certification"). The hard guarantee is architectural: the *deterministic oracle* is fail-closed, so the destructive action can't execute regardless of what any model believes.

**4. "Where's the multimodal — this looks like text agents?"**
`/foundry`: you upload a floor-plan **image**, gemma-4-31b **vision** reads it into a structured site map (`FoundryApp.tsx` → `/api/foundry/parse-floor`, base64 data-URI). Image in, text out. **Frames/stills — not video**; gemma-4-31b on Cerebras doesn't do video, and we don't pretend it does.

**5. "Is the judge an LLM grading an LLM?"**
No — that's the whole thesis. The judge is a **deterministic oracle**, pure set-algebra/geometry, never an LLM. In the SOC run Gemma fell for the injection; the floor blocked it and **0 destructive actions executed**. In the Gym the oracle overrode the proposer **17/40** times. This is DeepMind's AI Control Roadmap (synchronous blocking, fail-closed) and arXiv 2602.09947 (deterministic architectural boundaries) in code.

**6. "What did you actually build in 24h vs. scaffolding?"**
Live and verified: the 3-agent SOC loop with injection containment (`/soc`); Foundry vision→oracle (`/foundry`); the Gemma-proposer→Origin-verifier Gym with divergence 0 and the finish 1009 / escalate 2947 / refuse 748 dataset; the trained 0.939 policy + dashboard (`outputs/rsi_dashboard.html`); the static showcase. The interactive Cerebras loop is demoed in the **locally recorded video** (never live wifi); the Pages deploy is the static landing + dashboards.

---

## Deploy plan → origin-physical-ai.pages.dev (static showcase)

**What "live" honestly is:** the live URL is the **STATIC frontend only** — the `apps/origin-web` Vite `dist/` build served by Cloudflare Pages, project `origin-physical-ai`, **production branch `hud-factorydad-1`**. The Hono backend (`server/main.ts`, port 8787) is NOT deployed publicly; `/api` and `/v1` are proxied to localhost in `vite.config.ts`. So the live site = landing + model leaderboard (live tok/s) + RSL readiness ladder + learning curve + floor→gym→readiness journey + RSI dashboard. The **interactive Cerebras loop is shown only in the locally-recorded video** — the live consoles have no public backend to run it.

**Pre-deploy checklist (CODEX runs; founder authorizes):**
1. **Gates (origin-web):** `npm run gates` (build + lint + verify:evidence + test), then `npm run test:e2e` if time.
2. **Gates (Floor design):** `npm run build:rsi` + `npm run validate:rsi`; re-verify `CHECKSUMS` (6 SHA-256 artifacts); confirm `oracle_divergence: 0`; reconfirm `finish 1009 / escalate 2947 / refuse 748`, policy `≈0.939`, `refuse_recall 1.0`.
3. **Gap to close (VERIFIED missing):** the RSI dashboard is **not** in `public/` or `dist/` (a `find … -iname "*rsi*"` returns nothing). Copy `Floor design/outputs/rsi_dashboard.html` (+ preview PNG) into `apps/origin-web/public/rsi/`, link from the customer-journey section, rebuild.
4. **No secrets in bundle:** `grep -rIoE '(sk-[A-Za-z0-9]{20,}|csk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xoxb-[A-Za-z0-9-]+|ghp_[A-Za-z0-9]{20,})' dist/` must return empty; confirm no `.env*` copied into `dist/`.
5. **Claim hygiene in rendered copy:** policy headline = 0.94 raw geometry (NOT 100%); the 1.0 labeled "oracle-recovery upper bound"; multimodal = image in, NOT video; deterministic oracle is the only judge; cross-family numbers are platform comparisons.
6. **New sections render** on desktop + mobile + `prefers-reduced-motion`.

**The wrangler command (founder triggers):**
```bash
# From apps/origin-web — production branch is hud-factorydad-1.
# --branch=main lands as a PREVIEW and the apex will NOT update.
npm run build && npx wrangler pages deploy dist \
  --project-name=origin-physical-ai \
  --branch=hud-factorydad-1 \
  --commit-dirty=true
```
Post-deploy: verify the apex serves the fresh bundle (200 on `/`, `/foundry`, `/soc`, `/passport`, and the new RSI dashboard URL); leaderboard + journey render. Recent deploys went straight to CF Pages and were NOT pushed to GitHub — founder may also want to push `hud-factorydad-1`.

> **STOP — founder authorization required.** Do NOT auto-deploy. CF credentials are owner-held and this command updates the live apex. CODEX stages the dist and lists the command; the founder runs it.

---

## The Codex prompt (copy-paste)

````markdown
# CODEX TASK — Origin: unify the RSI Gym + Passport authority layer, validate everything, stage the static deploy (STOP before publishing)

You are working across TWO local repos. Local only. Do NOT push, do NOT deploy, do NOT spend on any model. Stop for founder authorization before the publish step.

- **Repo A (web + engine):** `/Users/bohueilin/hackathons/Origin/apps/origin-web`
- **Repo B (RSI Gym / Floor design):** `/Users/bohueilin/hackathons/Floor design`

## Product (one sentence, do not drift)
ORIGIN is the control plane for autonomy: **gemma-4-31b on Cerebras PROPOSES; a deterministic oracle (never an LLM) RATIFIES every action before it executes.** "Capability is not permission." Same engine governs robots (physical) and software agents (digital).

## NON-NEGOTIABLE HONESTY CONSTRAINTS (a fabricated capability loses this hackathon)
- gemma-4-31b on Cerebras is **image+text IN / text OUT, inference only**. NO video gen, NO training on Cerebras. The safety policy trains LOCALLY (numpy MLP), off-Cerebras.
- "Multimodal" = gemma-4 reads a **floor-plan IMAGE** (and SOC alert screenshots). Stills, NOT video. Say so in copy.
- The **deterministic oracle is the ONLY judge** — never an LLM grading an LLM.
- Safety-policy headline = **0.94 balanced-accuracy on raw geometry** (`test_balanced_accuracy=0.93949`, `refuse_recall=1.0`). The **1.0 is an oracle-recovery UPPER BOUND** (features include oracle-derived sufficient statistics) — never "100% learned safety." The bound is documented verbatim in `safety_policy_v1/metrics.json` `claim_boundary`.
- Cross-family speed numbers are **PLATFORM** comparisons (Cerebras WSE vs GPU), not "our model is smarter." Lead with measured **~1,300 tok/s** (869 tok/s on the verified Foundry run); the "~1,500" in `socClient.ts`/`staerAdapter.ts` comments is the code's illustrative ceiling — do not quote it as the claim.
- Two distinct runs exist; keep them straight: (a) the **real Gemma/Cerebras run** = `Floor design/outputs/OUTCOME_SUMMARY.md` (40 scenarios, 120 raw samples, 17 verifier overrides, 869 tok/s, `gemma-4-31b`, determinism-inconsistent 0); (b) `outputs/rsi_dataset/propose_verify_metrics.json` currently has **`"source":"mock"`** (24 mock candidates, `oracle_divergence:0`) — the deterministic propose→verify HARNESS on a mock proposer, NOT a live Gemma run. **Do not present the mock harness as a live Gemma result.**

## TASK 1 — Wire ONE coherent demo surface: the Passport-gated robot gym task (connect existing pieces; do NOT rebuild)
- The spatial grant→oracle edge already lives in Repo A: `src/siteEval.ts` exposes `evaluateDrawnSite(site, embodiment, grants?: Set<zoneId>)`; contract documented + tested in `src/siteEval.spatial.test.ts` (a `humanOnly` cell tagged `restrictedZoneId` is an absolute wall → REFUSE with no grant; a MATCHING grant drops only that authorized cell so the **oracle (not the grant)** finds the finish path; an UNRELATED grant still REFUSEs; a real physical hazard on the only route still REFUSEs even WITH the grant). Authorization is a key, never a physics override.
- Surface, in the Foundry/console UI, a robot gym task crossing a `humanOnly` zone where REFUSE fires on **POLICY (unauthorized)**, then flips to FINISH only when the agent holds a live, scoped Passport `enter_zone` grant for that exact `zoneId`. Caption literally: **"The robot's Passport: identity → authority → verified action."** Reuse existing Passport grant/delegation code in `src/passport/` — do not invent a new grant format.
- Surface the Gemma-proposer → Origin-verifier loop + dashboard money beat: wire the gym client (`src/gymClient.ts`, `/v1` reset/step) so the console shows Gemma proposing a terminal and Origin's oracle ratifying every one, with captured override examples. Money line: **"One building map → 40 distinct deterministic robot safety tests from 120 Gemma samples; verifier overrode the proposer 17 times; oracle divergence 0."**
- Keep changes minimal, behind existing routes (`/foundry`, `/soc`, `/passport`); preserve back-compat (omitting `grants` stays byte-identical — there is already a test).

## TASK 2 — Comprehensive validation (BOTH repos)
- **Repo A:** `npm run gates` (build [tsc -b + vite build] + lint [eslint] + verify:evidence + test [vitest]), then `npm run test:e2e` (Playwright + axe). All green. Confirm new spatial-grant + gym wiring covered by `src/siteEval.spatial.test.ts`, `src/gymClient.test.ts`, `src/verifier.test.ts`, `src/multiAgent.test.ts` (add cases if you wire new UI logic).
- **Repo B:** `npm run build:rsi` + `npm run validate:rsi`; re-verify the 6 SHA-256 artifacts in `CHECKSUMS`; re-run policy trainer, preference-pairs build, propose→verify. Assert unchanged: `finish 1009 / escalate 2947 / refuse 748` over `4704`; policy `test_balanced_accuracy≈0.939`, `refuse_recall=1.0`; `oracle_divergence:0`. Flag ANY drift; do not silently regenerate numbers in deck/site copy.
- **No-secrets-in-bundle:** after Repo A build, `grep -rIoE '(sk-[A-Za-z0-9]{20,}|csk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xoxb-[A-Za-z0-9-]+|ghp_[A-Za-z0-9]{20,})' dist/` must return empty. Confirm no `.env*` copied into `dist/`.
- **Static build renders new sections:** `npm run preview`, then verify landing, model leaderboard (live tok/s, gemma-4 vs GPU), RSL readiness ladder, learning curve, floor→gym→readiness journey, AND the RSI dashboard link render on desktop + mobile + `prefers-reduced-motion`.

## TASK 3 — Stage the static deploy (build + verify locally; STOP before publishing)
- Surface the RSI dashboard on the live site (currently MISSING — `find public dist -iname '*rsi*'` returns nothing): copy `Floor design/outputs/rsi_dashboard.html` (+ `dashboard-preview.png`) into `Repo A/public/rsi/`, link from the customer-journey section. Rebuild so it lands in `dist/`.
- Build dist, `npm run preview`, confirm apex routes (`/`, `/foundry`, `/soc`, `/passport`, new RSI dashboard URL) serve 200 with the fresh bundle.
- **List — do NOT run — the exact publish command for the founder:**
  ```bash
  # Production branch is hud-factorydad-1. --branch=main lands as a PREVIEW and the apex will NOT update.
  npm run build && npx wrangler pages deploy dist \
    --project-name=origin-physical-ai \
    --branch=hud-factorydad-1 \
    --commit-dirty=true
  ```
- Then **STOP and hand back to the founder for authorization.** Do not deploy (CF creds owner-held; this updates the live apex). Do not push to GitHub unless the founder asks.

## Definition of done (report back; do not narrate as done if a gate is red)
1. Passport-gated gym task wired into the console (grant→oracle edge visible, identity→authority→verified-action caption); Gemma-proposer→Origin-verifier loop + dashboard money beat surfaced.
2. All gates green in both repos; CHECKSUMS verified; policy 0.94 / refuse-recall 1.0 / oracle_divergence 0 reconfirmed; no secrets in dist.
3. RSI dashboard copied into `public/` and rendering on the static preview; new sections render on desktop + mobile + reduced-motion.
4. The exact wrangler command listed, dist built and locally verified, deploy NOT executed — awaiting founder authorization.
5. Every honesty constraint above intact in all rendered copy.
````

---

## Honesty guardrails (the lines we will not cross)

- **Inference only.** No training on Cerebras, no video generation. The safety policy trains locally in numpy.
- **Multimodal = stills.** Floor-plan images and SOC alert screenshots. Never "video," never "generation." Say so out loud.
- **The deterministic oracle is the only judge.** Never an LLM grading an LLM. Say "deterministic floor / oracle," never "the model decides."
- **Policy headline = 0.94 balanced-acc (raw geometry), 100% refuse recall.** The 1.0 is an **oracle-recovery upper bound** (oracle-summary features) — never "100% learned safety." Keep policy numbers out of the 60s video; save for Q&A.
- **Speed = platform comparison** (same/peer gemma-4-31b, Cerebras WSE vs GPU). Not "our model is smarter." Lead with measured **~1,300 tok/s** (869 on the Foundry run); the "~1,500" in code comments is an illustrative ceiling, not a claim.
- **On-screen tok/s must be real `time_info`** captured during the take — replay verified data if a live call lags, never fabricate the number.
- **"0 destructive executed / 2 injections blocked"** and **"finish 1009 / escalate 2947 / refuse 748" / "divergence 0"** are the exact verified numbers — use them verbatim, don't round or inflate.
- **Don't conflate the two runs:** the live Gemma/Cerebras run is `OUTCOME_SUMMARY.md` (40 scenarios / 120 samples / 17 overrides / 869 tok/s); `propose_verify_metrics.json` is currently a `source:"mock"` harness run. Never present the mock as a live Gemma result.
- **Robot-ready = brain only.** No physical robot is claimed; the actuator today is a tool-call.
- **The live Pages deploy is the static showcase.** The interactive Cerebras loop lives in the locally-recorded video, never live wifi.
- **X/Discord are DRAFTS.** The founder posts manually. Nothing auto-posts. The founder runs the wrangler deploy.
- **DeepMind resonance is real:** AI Control Roadmap (synchronous blocking, fail-closed); arXiv 2602.09947 (deterministic boundaries). Cite as resonance, not endorsement.

---

**Key file paths (absolute):**
- Web/engine: `/Users/bohueilin/hackathons/Origin/apps/origin-web/{vite.config.ts,public,dist,src/siteEval.ts,src/siteEval.spatial.test.ts,src/gymClient.ts,src/passport,src/foundry/soc/{socTypes.ts,SocConsole.tsx,socClient.ts,passport.ts},src/foundry/ui/FoundryApp.tsx,soc.html,foundry.html}`
- RSI Gym: `/Users/bohueilin/hackathons/Floor design/{CHECKSUMS,outputs/OUTCOME_SUMMARY.md,outputs/verification_report.json,outputs/rsi_dashboard.html,outputs/rsi_dataset/{stats.json,safety_policy_v1/metrics.json,propose_verify_metrics.json}}`
- This console (adjacent reference / fallback): `/Users/bohueilin/hackathons/0619/autonomy-trace-console/{DEMO_SCRIPT.md,README_LOCAL_DEMO.md,src/seedScenarios.ts,src/verifier.ts}`

**Two verified gaps this playbook closes:** (1) the RSI dashboard is not yet on the live site — confirmed missing from `public/` and `dist/`; CODEX Task 3 copies it in. (2) The Passport spatial grant→oracle edge is real, tested code (`src/siteEval.ts` + `src/siteEval.spatial.test.ts`) but not yet surfaced as a console demo beat — CODEX Task 1 wires existing pieces, low-risk before deadline.

http://localhost:5275/app.html
