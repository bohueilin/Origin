# Origin Foundry

**Upload a floor plan; train a robot policy that *can't* reward-hack — because the judge of "did it do the job safely" is a deterministic oracle, never an LLM.**

> Origin Foundry is a Cerebras × Gemma‑4 24‑hour hackathon submission. The engine is **Quorum**: no agent acts alone, and every single action is ratified before it counts. "Origin Foundry" is the working product name; **Quorum** is the engine inside it.

---

## What it is

A floor plan is a picture. A safe robot policy is a program. Foundry is the bridge.

1. **`gemma-4-31b` (vision) on Cerebras** reads your floor image into a real grid world — dock, item, drop, walls, hazards, human‑only zones — and a deterministic repair pass guarantees the grid is always consistent.
2. A **fast multi‑agent loop** drives a robot through that world: a **Planner** proposes the next action, and a **Guardian/Verifier** ratifies or vetoes *every* step. Both are `gemma-4-31b` on Cerebras.
3. The rollout is scored by a **deterministic oracle** — a BFS shortest‑path checker that knows the one correct, safe answer. The LLM never grades itself.
4. You walk away with a **license**: a signed, deterministic verdict that this policy reaches the goal *and* never crossed an unsafe cell.

## Why it matters

The hard problem in physical AI is not "can the robot move" — it's "will it cut the corner through the wet‑floor zone to finish 3 seconds faster." That is reward hacking, and it is how robots hurt people.

Foundry's answer is structural, not hopeful: **capability is not permission.** The model is free to propose anything. But the only thing that decides whether an action *happens*, and the only thing that scores whether the job was done *safely*, is deterministic code with no incentive to be impressed by a clever shortcut. A reward‑hacker can be as fast and fluent as it likes — it still gets caught, every time, by math.

## How you use it — 4 steps

1. **Upload.** Drop in a floor‑plan image. `gemma-4-31b` vision reads it into a grid; the deterministic repair pass cleans it up. (No image / no key → a clearly labeled sample floor, same code path.)
2. **Watch it think.** Run **Quorum**. You see the live Planner → Guardian trace, step by step, with **real tok/s and TTFT straight from the Cerebras API** — and the Guardian vetoing the reckless move *before* it executes.
3. **Train in your floor.** Flip between **Verified** and **Reckless** intent. Foundry also computes the **no‑Guardian counterfactual** — the same reckless plan with the gate removed — so you see, concretely, what verification just prevented.
4. **Get your license.** The deterministic oracle issues the final verdict: passed / failed, reward, false‑accept and false‑reject flags, and the category. That verdict is the artifact you trust — not the model's say‑so.

---

## Why `gemma-4-31b` on Cerebras

The whole design only works because per‑step verification is **cheap**. Here's the chain of reasoning:

- **A safe policy needs the Guardian to check *every* action.** On a GPU, an LLM verifier on the critical path of every step is a latency tax most teams quietly drop — they verify a sample, or trust the planner. That's where the holes are.
- **On Cerebras, `gemma-4-31b` runs the loop at roughly 1,500 tok/s** (measured ~1,284 tok/s live this build, TTFT ~8ms). At that speed the Planner *and* the Guardian both run on every step and the loop still feels instant. Per‑step verification stops being a luxury and becomes the default.
- **That is the GPU‑vs‑`gemma-4-31b` proof.** The `speed-race` route runs the identical prompt on `gemma-4-31b` (Cerebras) and a GPU‑class baseline (Gemini), and shows the real tok/s, TTFT, and speedup on screen. The point isn't the bragging number — it's that the speed is *what buys you the safety architecture*. Free verification is only free if it's fast.

> Honest numbers: ~1,284 tok/s is **measured** on this build; ~1,500 tok/s is the **headline** figure for `gemma-4-31b` on Cerebras. The baseline GPU figures shown when no `GEMINI_API_KEY` is set are **illustrative and labeled as such** — set the key for a live, real‑metrics race.

## The safety / reward‑hardening moat

This is the part judges should interrogate.

- **The deterministic oracle is the only judge.** Scoring lives in `src/warehouse.ts` (`bfsOracle`, `verifyWarehouseRollout`). It computes the true shortest *safe* path and checks the rollout against it. No LLM scores the run. You cannot sweet‑talk a BFS.
- **The Guardian gates execution, not just the transcript.** When the Guardian vetoes, the action is **not applied** — the rollout ends without performing the unsafe move. A veto is a real stop, not a comment.
- **The reckless reward‑hacker gets caught — on camera.** Run Foundry in `reckless` mode: the Planner is explicitly told to rush straight to the finish and ignore hazards. The Guardian vetoes the move into the unsafe cell, and the deterministic oracle flags the counterfactual (no‑Guardian) rollout as unsafe. You see exactly what the verification prevented, side by side.
- **Fail safe, not fail open.** If the Guardian model is unreachable, the loop falls back to the deterministic safety check and vetoes anything that check flags. An outage makes the system *more* cautious, never less.

This is the same posture as the rest of Origin: **capability is not permission; the deterministic oracle is the only judge.**

---

## Run it locally

### 1. Set keys

Create / edit `apps/origin-web/.env.local` (gitignored; **server‑side only — never prefix with `VITE_`**, or the key leaks into the browser bundle):

```bash
# apps/origin-web/.env.local
CEREBRAS_API_KEY=csk-...           # required for real, fast gemma-4-31b inference
CEREBRAS_MODEL=gemma-4-31b         # default; the only model for this event
# CEREBRAS_BASE_URL=https://api.cerebras.ai/v1   # default, override only if needed

GEMINI_API_KEY=...                 # optional — enables the live GPU baseline in speed-race
PORT=8787                          # default
```

### 2. Run the backend (Hono, port 8787)

```bash
cd apps/origin-web
npm install        # first time only
npm run server     # Hono server on http://localhost:8787 — serves /api/foundry/*
```

### 3. Run the frontend (Vite)

```bash
# in a second terminal
cd apps/origin-web
npm run dev        # Vite dev server; proxies /api and /v1 → :8787
```

### 4. Open Foundry

```
http://localhost:5275/foundry
```

Upload a floor, run Quorum, and toggle Verified / Reckless.

### No key? It still runs.

With **no `CEREBRAS_API_KEY`**, every route falls back to a **clearly labeled deterministic mock** (`source: 'mock'`) — a sample floor, a scripted Planner/Guardian loop, and illustrative speed figures. Same code path, so the product lights up for real the instant you set the key. The server prints a warning on boot:

> `CEREBRAS_API_KEY not set — Foundry runs gemma-4-31b in MOCK mode (set the key for real, fast inference).`

### Routes (for reference)

| Route | What it does |
| --- | --- |
| `POST /api/foundry/parse-floor` | `gemma-4-31b` vision → `DescriptiveSiteMap` → deterministic repair (`src/foundry/floorValidator.ts`) |
| `POST /api/foundry/quorum-run` | Planner + Guardian loop (`gemma-4-31b`), scored by `verifyWarehouseRollout` (the oracle); returns the no‑Guardian counterfactual. `mode = 'verified' \| 'reckless'` |
| `POST /api/foundry/speed-race` | Same prompt, `gemma-4-31b` (Cerebras) vs Gemini, real tok/s + TTFT |

> Images must be **base64 data URIs** — Cerebras accepts inline `image_url` data URIs only, not hosted URLs. The UI handles this for you.

---

## Honest scope on training

Be clear‑eyed about what "train in your floor" means today, because the demo only earns trust if the claim is exact:

- **Real, but small.** The end‑to‑end loop — vision parse → multi‑agent rollout → deterministic verdict — is real and runs live on `gemma-4-31b`. What ships in this 24h build is the **verified inference + scoring loop and the license artifact**, not a from‑scratch trained policy weight.
- **The training stack it plugs into is real and pre‑existing** — we reuse, not rebuild: `services/factoryceo-trm/` (GRPO, Fireworks RFT export/evaluator, Chronos SFT/RFT export, Cobra red/green reward‑hardening). Foundry is the front door and the deterministic *reward signal* for that stack: the same oracle that issues the license is what a real RFT run would optimize against.
- **The defensible claim** is the architecture, not a leaderboard number: a reward signal an LLM cannot game, on a verification loop that's only affordable because `gemma-4-31b` on Cerebras makes per‑step checking free. Everything labeled "illustrative" is illustrative; every tok/s figure shown live is read straight from the Cerebras `time_info`.
