# Origin Foundry — Live Demo Runbook

**Engine name to say out loud: "Quorum."** No agent acts alone; every action is ratified.
**The one sentence:** *Upload a floor plan → gemma-4-31b on Cerebras reads it into a real RL
environment → a Perceiver → Planner → Guardian loop ratifies EVERY step at ~1,500 tok/s → and the
only judge of "did it do the job safely" is a DETERMINISTIC oracle, never an LLM. Capability is not
permission.*

Total runtime: **3 minutes.** Read this whole file once before you stand up. Then run only the
**Click Path** section live.

> **GOLDEN RULE FOR JUDGING: never ride live wifi.** Everything in this app degrades to a *labeled*
> deterministic mock if a key is missing or the network drops — so the demo always lights up — but
> for the actual judged run you should have the speed-race + hero-loop pre-recorded (see
> **WIFI-FAILS fallback**) and be ready to cut to it without breaking stride.

---

## 0 · Pre-flight (do this 10 minutes before, on the real demo machine)

### 0.1 Set the keys (server-side only — never on screen)

The keys live in `apps/origin-web/.env.local`. They are read **only** by the backend
(`server/config.ts`); the browser never sees them. Required for a fully live run:

```
# apps/origin-web/.env.local
CEREBRAS_API_KEY=<your Cerebras key>     # REQUIRED — powers every gemma-4-31b call (vision + Planner + Guardian + race)
CEREBRAS_MODEL=gemma-4-31b               # the only model for this event (default is already gemma-4-31b)
GEMINI_API_KEY=<your Gemini key>         # OPTIONAL — the GPU baseline lane in the speed race
```

Sanity checks:
- `CEREBRAS_API_KEY` present and non-empty → the source badges read **`gemma-4-31b · Cerebras`**, not
  `deterministic mock`.
- If `GEMINI_API_KEY` is absent the race still runs — the baseline lane shows **labeled illustrative
  GPU-class figures** (it says so on the chip). That is honest and fine; prefer a real key if you have one.
- **Do NOT put the `.env.local` window, a terminal echoing the key, or any notification on screen.**
  Close all of it before you share your screen.

### 0.2 Start the backend (port 8787)

From `apps/origin-web`:

```bash
cd apps/origin-web
npm run server      # node server/main.ts → Hono on http://localhost:8787
```

Wait for: `[gym] … server listening on http://localhost:8787`.
If you see a `[config]` warning that `CEREBRAS_API_KEY` is unset — **stop and fix the key**, then
restart. (The app will still run on mocks, but you want the live tok/s for judging.)

### 0.3 Start the frontend (Vite, port 5275)

In a second terminal, from `apps/origin-web`:

```bash
PORT=5275 npm run dev    # Vite; proxies /api → http://localhost:8787
```

Vite owns the frontend and **proxies `/api` to the backend**, so the browser only ever talks to the
same origin — no CORS, no secrets in the client.

### 0.4 Open the page

Open **http://localhost:5275/foundry** (the `/foundry` route maps to `foundry.html`).
(Project home, for reference: **http://localhost:5275/app.html**.)

You should see the hero: *"Upload a floor plan. Get a robot brain that can't cheat."*

### 0.5 WARM-UP PARSE (critical — do this once, before judges are watching)

The first Cerebras call pays cold TTFT and first-token latency. **Warm it now so the live demo is
snappy:**

1. Click **"Use the sample floor"** once. Watch the grid render with the **Oracle verdict** box and
   the source badge **`gemma-4-31b · Cerebras`**.
2. Click **"Run the Quorum loop"** once (verified mode, the default) so the Planner+Guardian path is
   warm. Let it finish, see the **Oracle verdict: PASS**.
3. Click **"Run the speed race"** once so both lanes have fired and the bars are warm.
4. (Optional) Click **"Kick off training"** once to confirm the curve animates.

Then **reload the page** (`Cmd-R`) to reset to a clean hero state. You are now warm and clean. The
live run below will be fast.

### 0.6 Final pre-flight checklist
- [ ] Backend log shows `listening on http://localhost:8787`, no `CEREBRAS_API_KEY` warning.
- [ ] `http://localhost:5275/foundry` loads the hero.
- [ ] Warm-up done; page reloaded to clean state.
- [ ] Source badges say **`gemma-4-31b · Cerebras`** (not mock) on the warm-up.
- [ ] **No** `.env.local`, terminal-with-key, Slack/Discord, or notifications visible on the shared screen.
- [ ] Pre-recorded backup clip of the **speed race + hero loop** is open in a background tab (see fallback).

---

## 1 · The Click Path (the 3-minute live demo)

Run top-to-bottom. Each step lists the **exact click** and the **exact talking point**. The
tok/s line is your weapon — say "only possible at Cerebras tok/s" at every beat, because it is
literally true: per-step verification is only affordable because the loop runs at ~1,500 tok/s.

> Measured live earlier today: **gemma-4-31b on Cerebras ~1284 tok/s, TTFT ~8ms.** Headline figure
> ~1,500 tok/s. The race shows the **real number from the API's `time_info`** — read whatever it
> prints; don't recite from memory.

### Click 1 — "Use the sample floor"
**Click:** the **"Use the sample floor"** button under *"1 · Read the floor."*
(For the upload story: *"You'd normally snap a photo of your warehouse — gemma-4-31b's vision reads it.
For time, here's a clean sample."* The Upload button does exactly that with a real image.)

**Say:**
> "gemma-4-31b's **vision** reads the floor plan into a real occupancy grid — dock, item, drop,
> hazards, human-only zones. Then a **deterministic repair pass** fixes anything the model got
> wrong **before** any agent is allowed to trust it. The model proposes; deterministic code
> disposes."

**Point at — the two things on the right:**
1. **The Oracle verdict box** (e.g. *"Oracle reads this floor: FINISH — a safe route reaches the
   item and the drop"*). *"A deterministic oracle — not an LLM — already knows whether this floor is
   even solvable safely. That oracle is the only judge for the rest of the demo."*
2. **The "deterministic repairs" list** (open by default): *"These are the corrections the
   deterministic validator made to the model's output. Capability is not permission."*

**Cerebras tie:** *"That vision parse is gemma-4-31b on Cerebras — fast enough that reading the
floor isn't a batch job, it's interactive."*

### Click 2 — "Run the speed race"
**Click:** scroll up to *"The speed race"* card and click **"Run the speed race."**

**Say (while the bars fill):**
> "Same prompt, two lanes. Top lane: **gemma-4-31b on Cerebras**. Bottom: a **GPU-class baseline.**
> These tok/s and TTFT numbers come straight from the API's `time_info` — they're real."

**Point at:** the **tok/s number on the Cerebras lane** (read it aloud — ~1,200–1,500), the **TTFT
in milliseconds**, and the **"~Nx faster"** verdict line.

**Cerebras tie (this is the thesis, say it slowly):**
> "Here's why this matters. Our agent loop calls the model **twice per robot step** — a Planner to
> propose, a Guardian to ratify. At GPU speed, verifying every single step is unaffordable, so people
> skip it and let an LLM grade itself — that's how you get reward hacking. **At ~1,500 tok/s,
> per-step verification is essentially free.** The speed is not a vanity metric; it's what makes a
> *safe* loop possible at all. **Only possible at Cerebras tok/s.**"

### Click 3 — "Run the Quorum loop" (VERIFIED — the hero)
**Click:** in card *"2 · Watch it think — then prove it's safe,"* confirm the **"Verified policy"**
pill is lit (it's the default), then click **"Run the Quorum loop."**

**Say (as the trace reveals step-by-step):**
> "Watch the loop. Each row: the **Planner** (gemma-4-31b) proposes one action, the **Guardian**
> (also gemma-4-31b) **ratifies** it — RATIFY in green. No agent acts alone; that's why we call the
> engine **Quorum.** The robot literally traces the **safe** route on the grid, detouring around the
> hazard row."

**Point at — the stats strip and then the license:**
- **avg speed (tok/s)** and **model calls** — *"Two model calls per step, dozens of perceive-plan-verify
  cycles, all in well under a second of wall clock. Only possible at Cerebras tok/s."*
- When fully revealed, the **license**: **"Oracle verdict: PASS · reward …"** — *"And the judge is
  the **deterministic oracle**, never an LLM. It can't be sweet-talked. The policy passes because it
  actually did the job safely."*

### Click 4 — switch to "Reckless (reward-hacker)" and run again
**Click:** click the **"Reckless (reward-hacker)"** pill, then **"Run the Quorum loop"** again.

**Say:**
> "Now I'll plant a **reward-hacker** Planner — one that only cares about finishing fast and drives
> in a straight line, **through the hazard.** This is exactly the cheating behavior RL produces when
> the metric is gameable."

**Point at — the Guardian VETO:**
> "Watch the Guardian. The instant the Planner proposes stepping into a hazard cell — **VETO**, in
> red, with the reason. The unsafe action is **never executed.** The robot is stopped at the edge of
> the hazard. The verifier sees every step, so the cheat never lands."

**Point at — the no-Guardian counterfactual (the money line):**
> "And here's the proof of what verification bought us. **'Without the Guardian, the same intent →
> crash / reward …, it drove into a hazard.'** Same Planner, same intent — the *only* difference is
> whether a fast Guardian was allowed to ratify every step. That counterfactual is **only computable
> because verification is cheap at Cerebras tok/s.**"

> If a judge asks "is the Guardian an LLM grading an LLM?" — answer: *"The Guardian is an LLM
> ratifying intent in real time, but it is NOT the judge. The final reward comes from a
> **deterministic oracle** (`verifyWarehouseRollout`) that replays the actual actions on the grid.
> The LLM can be wrong; the oracle can't be cheated. Capability is not permission."*

### Click 5 — "Kick off training"
**Click:** scroll to *"Train in your floor"* and click **"Kick off training."**

**Say:**
> "Because the reward **is** that deterministic safety oracle, the policy **can't learn to cheat the
> metric** — there's nothing to game. One click kicks a **small but real** fine-tune (Fireworks RFT,
> rollouts on Modal, reusing our existing RL stack). Watch the green **reward climb** and the red
> **false-accept rate fall** — the policy is getting both more capable **and** more honest."

**Point at:** the two curves — **reward ↑** (green), **false-accept rate ↓** (red dashed).

**Honesty note (say it — it's a strength, not a weakness):**
> "I'll be straight: this training is **real but small** — it's the same pipeline we run for
> production, scaled to a hackathon. The animated curve here is **illustrative of the trend**; the
> speed numbers you saw in the race are **measured and real.** The point that's bulletproof: the
> reward function is deterministic, so more training can only make it safer, never better at
> cheating."

**Close (10 seconds):**
> "Floor plan in, **verified robot brain out** — and the only judge of safety is a deterministic
> oracle. A multi-agent loop that ratifies every step, fast enough to be real, **only possible at
> Cerebras tok/s.** That's Origin Foundry. The engine is **Quorum.**"

---

## 2 · Talking-points cheat sheet (one line each, in order)

| Click | The line that wins | Cerebras tie |
|---|---|---|
| Use sample floor | "Model proposes, deterministic code disposes." | Interactive vision parse, not a batch job |
| Speed race | "These tok/s are real, from the API." | "Per-step verification is free at ~1,500 tok/s" |
| Quorum (verified) | "No agent acts alone — that's Quorum." | "Dozens of perceive-plan-verify cycles in <1s" |
| Reckless → VETO | "The cheat never lands; the verifier sees every step." | Counterfactual is only computable because verify is cheap |
| No-Guardian counterfactual | "Same intent, only diff is a fast Guardian." | The fast loop *is* the safety mechanism |
| Kick off training | "The reward is a deterministic oracle — nothing to game." | Real-but-small fine-tune on our existing stack |

**Three phrases to repeat:** *"Capability is not permission." · "The deterministic oracle is the
only judge." · "Only possible at Cerebras tok/s."*

---

## 3 · WIFI-FAILS fallback (rehearse this; it is the plan, not the panic)

The app is **built to survive a dead network** — but for judging you do not improvise, you cut to a
pre-recorded take. Two layers:

### Layer A — the app's own labeled deterministic mock (automatic)
Every Foundry route falls back to a **clearly labeled** deterministic mock if the Cerebras key is
absent **or** the call fails:
- **Parse:** returns a clean, hazard-bearing **sample floor**; the source badge reads
  **`deterministic mock`** and the repair note explains why.
- **Quorum loop:** Planner follows the safe (or reckless) path deterministically; the **Guardian
  fails SAFE** — it falls back to a deterministic safety check and still **vetoes** the unsafe move.
  So the **veto and the counterfactual still demo correctly**, just labeled `deterministic mock`
  instead of `gemma-4-31b · Cerebras`.
- **Speed race:** shows **illustrative** Cerebras vs GPU figures, each chip says so explicitly.

This means: even fully offline, you can click the whole path and the *story* holds. It is honest
because every fallback is labeled `mock` / `illustrative` on screen. **Do not pass an illustrative
number off as measured.**

### Layer B — pre-recorded hero take (what you actually show judges if wifi is shaky)
**Have these recorded and queued in a background browser tab BEFORE the event:**
1. A **clean ~30s screen recording of the live speed race** firing with the **real** tok/s / TTFT
   numbers (record it during a known-good network window, e.g. right after pre-flight 0.5).
2. A **clean ~40s recording of the hero loop**: verified PASS → switch to reckless → **Guardian
   VETO** → the **no-Guardian counterfactual** line.

If the network is at all unreliable when you go up: **drive the click path on the live app for
parse + training (those are local/cheap), and cut to the recorded clips for the speed race + the
hero veto.** Say plainly: *"I recorded the live race earlier so I'm not betting the demo on
conference wifi — here are the real numbers, captured this morning."* Judges respect that; a
stuttering live call loses the room.

### If you must go live anyway and a call hangs
- The app will resolve to the labeled mock within the request — let it; the demo continues.
- Cerebras limits for this event: **100 RPM / 100K TPM**, **65K MSL / 32K MCL**. The loop is well
  under these, but if you spam **"Run the Quorum loop"** rapidly you can transiently hit RPM — wait
  ~3 seconds between runs.

**Never ride live wifi for the judged moment. Pre-record the speed race and the hero loop. That is
the rule.**

---

## 4 · Fast recovery

| Symptom | Fix |
|---|---|
| Badge says `deterministic mock` when you expect live | `CEREBRAS_API_KEY` missing/typo in `.env.local`; restart `npm run server` |
| `/foundry` 404s | Frontend not on 5275 or route map; confirm `PORT=5275 npm run dev`, open `http://localhost:5275/foundry` |
| `/api` calls fail in browser | Backend not up; confirm `npm run server` shows `:8787`; Vite proxies `/api` → 8787 |
| First live call is slow | You skipped the **warm-up parse** (0.5); cut to the recorded clip |
| Speed race baseline blank/illustrative | `GEMINI_API_KEY` unset — fine, it's labeled illustrative; add the key for a real GPU lane |
| Key visible on screen | Stop sharing, close the terminal/`.env.local`, re-share — secrets must never be on screen |

---

*Routes: `POST /api/foundry/{parse-floor, quorum-run, speed-race}` (server/foundryHandler.ts).
The oracle: `verifyWarehouseRollout` in src/warehouse.ts. The engine is **Quorum**.*
