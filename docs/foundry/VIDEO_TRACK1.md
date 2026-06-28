# VIDEO — Track 1: Multiverse Agents (hero cut, ≤60s)

**Project:** Origin Foundry — engine codename **Quorum** (no agent acts alone; every action is ratified).
**Event:** Cerebras × Gemma-4 24h hackathon. Model: `gemma-4-31b` on Cerebras Inference.
**One-line thesis:** Upload a floor plan → `gemma-4-31b` (vision) reads it into a real RL environment → a fast
multi-agent loop (Perceiver → Planner → **Guardian/Verifier ratifies EVERY step**) runs at Cerebras speed so we can
train a robot policy that **can't reward-hack** — because the judge of "did it do the job safely" is a **deterministic
oracle, never an LLM.** *Capability is not permission; the deterministic oracle is the only judge.*

**Tag on post (do this when YOU publish — not in this file):** @Cerebras @googlegemma.
**On-screen rules:** show real `time_info` tok/s; NO secrets, NO notifications, NO API keys on screen. Recommend a
GPU side-by-side (the speed-race panel is the honest baseline).

---

## Honesty ledger (read before you shoot — keep the cut truthful)
- **Speed numbers are REAL.** Measured live: ~**1,284 tok/s**, TTFT ~**8 ms** on `gemma-4-31b` / Cerebras.
  Headline "~1,500 tok/s" is the rounded ceiling — say "up to ~1,500" or just show the measured number on screen.
- **Training is real but small.** If a reward curve or policy-improvement frame appears, lower-third it
  **"illustrative — small run."** Never imply a production-scale training result.
- **The oracle is real and deterministic.** PASS/score come from `src/warehouse.ts verifyWarehouseRollout` +
  `bfsOracle` — not from an LLM. That is the whole point; do not blur it.
- Every tok/s figure below the live demo bar is **real API `time_info`**; any number in a *training* frame is
  illustrative and must be labeled.

---

## Total runtime budget: 58s (≤60s hard cap)

| # | Beat | Dur | Cum |
|---|------|-----|-----|
| 0 | Cold open / title | 4s | 4s |
| 1 | Upload → gemma-4 reads the floor → deterministic repair | 12s | 16s |
| 2 | Quorum loop live: Planner proposes, Guardian RATIFIES every step | 16s | 32s |
| 3 | The reckless run: Guardian VETOES → no-Guardian counterfactual hits the hazard | 16s | 48s |
| 4 | Deterministic license: PASS + reward + "the oracle is the only judge" | 8s | 56s |
| 5 | End card / caption | 2s | 58s |

---

## SHOT 0 — Cold open (0:00–0:04, 4s)
- **On-screen:** Black. Title snaps in: **ORIGIN FOUNDRY** / sub: *"Quorum — every step ratified."* Tiny corner chip:
  `gemma-4-31b · Cerebras`. A single live tok/s readout flickers up: **1,284 tok/s**.
- **VO:** "A robot policy will cheat any reward it can. So we never let a language model be the judge."
- **tok/s on screen:** `1,284 tok/s` (real, measured) — corner chip only.

## SHOT 1 — Read the floor (0:04–0:16, 12s)
- **On-screen:** Drag a real floor photo onto FoundryApp. Hard cut to the `FloorGrid`: cells light up as
  `gemma-4-31b` (vision) emits a `DescriptiveSiteMap`. Then the **deterministic repair readout** stamps in —
  show 2–3 fix lines, e.g. `repaired: sealed unreachable cell (3,5)` / `normalized robot start` /
  `clamped 1 out-of-bounds wall` — with a **"deterministic repair · floorValidator.ts"** label.
- **VO:** "Upload a floor photo. Gemma-4, on Cerebras, reads it into a real grid — then a deterministic validator
  repairs it into a physics the robot can actually live in."
- **tok/s on screen:** parse-floor call bar: **1,210 tok/s · TTFT 9 ms** (real `time_info`; show whatever the live
  call returns — do not hand-edit).

## SHOT 2 — The Quorum loop, live (0:16–0:32, 16s)
- **On-screen:** Split trace. **Left = Planner** (`gemma-4-31b`) proposing actions
  (`scan` → `move:east` → `pick` → `move:north` → `drop`). **Right = Guardian** stamping each one
  **RATIFIED ✓** in real time. A per-step counter ticks; every line shows its own tok/s. Bottom bar: **mode: verified**.
  Pace the cut so the eye sees the Guardian stamp land on EVERY Planner step — that cadence IS the product.
- **VO:** "Now the loop. Planner proposes one move. Guardian verifies it — every step, no exceptions — and stamps it
  ratified. Per-step verification only feels free at Cerebras speed."
- **tok/s on screen:** per step, real `time_info`, e.g. `Planner 1,284 tok/s` / `Guardian 1,301 tok/s`, TTFT ~8 ms.
  Let at least two different per-step numbers be legible so it reads as live, not a loop.

## SHOT 3 — Veto + the counterfactual (0:32–0:48, 16s)
- **On-screen:** Switch to **mode: reckless**. Planner proposes the unsafe move (drive toward the hazard cell /
  `finish` before the job is safe). Guardian slams a red **VETOED ✗** with a one-line reason
  (`unsafe: enters hazard before scan` — paraphrase from the live reason). Then split-screen the
  **no-Guardian counterfactual**: the same plan, unverified, **drives straight into the hazard** — robot dot hits
  the red cell, run flagged **UNSAFE**. Hold on the contrast for a beat.
- **VO:** "Make it reckless. The Planner goes for the unsafe shortcut — Guardian vetoes it. Pull the Guardian out,
  and the exact same plan drives the robot into the hazard. That's what verification was buying you."
- **tok/s on screen:** Guardian veto bar: **~1,290 tok/s · TTFT 8 ms** (real). The counterfactual panel needs no
  tok/s — label it **"no-Guardian counterfactual."**

## SHOT 4 — The deterministic license (0:48–0:56, 8s)
- **On-screen:** The verified run resolves to the **Foundry License** card: big **PASS**, a numeric **reward**, and the
  scorer credit **`verifyWarehouseRollout · bfsOracle — deterministic`**. Punch-in on the headline:
  **"The oracle is the only judge."** (Optional 1s training frame — a tiny upward reward tick — MUST carry the
  lower-third **"illustrative — small run."**)
- **VO:** "The license is signed by a deterministic oracle — not a model. The policy can't sweet-talk it. Capability
  is not permission. The oracle is the only judge."
- **tok/s on screen:** none on the license itself — it's the deterministic frame; keep it model-free on purpose.

## SHOT 5 — End card (0:56–0:58, 2s)
- **On-screen:** **ORIGIN FOUNDRY · Quorum** / line: *"Multi-agent. Multimodal. Per-step verified — at Cerebras
  speed."* / chips: `gemma-4-31b` · `Cerebras` · `deterministic oracle`. Corner: final **1,284 tok/s**.
- **VO:** (silent, or) "Origin Foundry. Quorum."

---

## TIGHT CAPTION (post copy — paste when YOU publish; not auto-posted)
> Upload a floor plan. **Gemma-4-31b on @Cerebras** reads it into a real RL world, then **Quorum** runs a multi-agent
> loop where a **Guardian verifies EVERY step** — ~1,284 tok/s measured, so per-step verification is basically free.
> The robot policy **can't reward-hack**: the judge is a **deterministic oracle**, never an LLM. Capability is not
> permission. The oracle is the only judge. @googlegemma

---

## Capture checklist (so the cut is real, not staged)
- [ ] Run `POST /api/foundry/parse-floor` on a genuine floor photo; screen-record the grid + repair lines + its tok/s.
- [ ] Run `POST /api/foundry/quorum-run` with `mode:'verified'` → capture per-step RATIFIED stamps + per-step tok/s.
- [ ] Run again with `mode:'reckless'` → capture the VETO + the returned no-Guardian counterfactual hitting the hazard.
- [ ] Capture the License card (PASS + reward + deterministic scorer credit).
- [ ] Optional GPU side-by-side: `POST /api/foundry/speed-race` (Cerebras vs Gemini) — honest baseline, real tok/s/TTFT.
- [ ] Scrub every frame for secrets / API keys / notifications before export.
- [ ] Confirm on-screen tok/s match the live `time_info` you recorded — do not retouch numbers.
- [ ] Any training/reward frame carries the **"illustrative — small run"** lower-third.
