# Origin — handoff for review

**Read this folder:** `/Users/bohueilin/hackathons/0620-test/physical-ai-demo-test`
(GitHub: `bohueilin/physical-ai-demo-test`, branch **`hud-factorydad-1`**, HEAD **`90da1a3`**.)
This is the **sandbox**. Do **not** touch the production console at
`/Users/bohueilin/hackathons/0620/autonomy-license` — it is intentionally untouched.

You are reviewing **Origin**: *a robot brain for every floor* — a personalized,
self-improving robot-readiness product. The vision leads (build a robot brain for your
site that self-improves); **safety is the baseline guarantee / moat**, not the headline.
Capability is never enough — a robot must earn permission on the actual site, by a
**deterministic oracle (never an LLM)**, and re-earn it every time it learns.

---

## What's in the repo (three surfaces, one product)

1. **Home — marketing front page** at `/` (`index.html` → `src/factorydad/`).
   Scroll narrative: Hero → **The brain** (dark band, `humanoid_physical_AI.png`, signals
   map to the finish/escalate/refuse triad) → **How it works** (4-step funnel) →
   **Physical AI is here** (ambient `Home_Collaboration_Videos.mp4` + poster) → Why now →
   **The test** (32 scenarios + interactive board) → **Readiness** (RSL curve) →
   **Improvement** (RSI tier-climb) → **Models** (scorecards) → **Trust** → closing CTA.
2. **Console — the workspace** at `/app.html` (`src/App.tsx` + `src/components/`).
   The interactive flow: **Capture (submit site) → Understand → Align → Simulate → License**.
   Opens directly on Capture; `← Home` returns to `/`. The **Simulate** step renders the
   live robot board on the user's *own* generated environment (see below).
3. **HUD environment / benchmark** — `hud-env/physical-ai-warehouse/` (Python).
   The deterministic oracle + 32 cases + RSL scoring + per-model harness. Internal id
   stays `factorydad-1-v2` (the UI shows only the Origin brand + a quiet "v2" tag).

The home and console are **two Vite entries in one project**; the home links into the
console via `/app.html?start=submit` (deep-links to the Capture step), and the console
links back to `/`. Brand is centralized in `src/factorydad/brand.ts` (one-line to rename).

---

## The deterministic spine (the thing to protect)

- Oracle/verifier is the **only** source of truth. No model sets reward, label, or license.
- Each case: scan-before-act → navigate (hazards / human-only / obstacles, battery/step
  budget) → terminal **finish / escalate / refuse**. `bfsOracle` computes the safe path.
- **RSL tiers L0–L4** (L4 = oracle ceiling; a model-under-test maxes at L3). Safety-first:
  any false-accept caps the tier at L0.
- Live results (real HUD eval): Sonnet-4-6 **L3** (100%, incl. 60-run grouped, zero
  variance); Haiku-4-5 **L2** (core 94% / hard 56%, FAR 0). The benchmark differentiates.
- The **Simulate board** in the console converts the user's generated `WarehouseTask`
  (`bfsOracle` path) into the FactoryDad board via `src/factorydad/fromWarehouse.ts` —
  same deterministic source drives the visual.

---

## Key files (where to look)

- Brand / naming: `src/factorydad/brand.ts`
- Home shell + narrative order: `src/factorydad/Dashboard.tsx`
- Home sections: `src/factorydad/components/` — `Hero.tsx`, `RobotBrain.tsx`,
  `HowItWorks.tsx`, `VisionFilm.tsx`, `RslCurve.tsx`, `RsiClimb.tsx`, `CasesSection.tsx`,
  `CaseBoard.tsx`, `ScorecardPanel.tsx`, `FailureRows.tsx`, `TrustScope.tsx`
- Board styles (shared by home + console): `src/factorydad/board.css`; home styles:
  `src/factorydad/factorydad.css`
- Data the home renders (generated, do not hand-edit): `src/factorydad/data.json`
  (from `hud-env/physical-ai-warehouse/factorydad1/export_web.py`)
- Console flow + nav + deep-link: `src/App.tsx`; Simulate board injection:
  `src/components/EnvironmentPreview.tsx`; bridge: `src/factorydad/fromWarehouse.ts`
- Vite entries: `index.html` (home), `app.html` (console), `vite.config.ts` (input map)
- HUD env (Python): `hud-env/physical-ai-warehouse/factorydad1/` — `schema.py`,
  `verifier.py`, `fixtures.py` (32 cases), `reporting.py` (RSL), `runner.py` (per-model
  harness), `export_web.py`; tests in `tests/`
- Assets: `public/humanoid_physical_AI.png`, `public/Home_Collaboration_Videos.mp4`,
  `public/home-collaboration-poster.jpg`

---

## How to run / verify

```bash
# Web (from repo root)
npm install
PORT=5275 npm run dev          # home: http://localhost:5275/  · console: /app.html
npm run build                  # tsc -b + vite build (both entries must pass)
npm run lint                   # eslint, must be clean

# HUD env (deterministic, offline)
cd hud-env/physical-ai-warehouse
uv run pytest -q               # 70 tests
uv run python -m factorydad1.export_web        # regenerates src/factorydad/data.json
uv run python -m factorydad1.runner --reference            # L4 ceiling
uv run python -m factorydad1.runner --model claude-sonnet-4-6   # live scorecard
hud eval tasks.py claude --full --yes          # live HUD eval (auth via ~/.hud/.env)
```

Current status: `npm run build` + `npm run lint` clean; `uv run pytest -q` 70 passed;
home/console verified in-browser, no console errors, responsive at 375px.

---

## Constraints (must hold)

- Never modify `/Users/bohueilin/hackathons/0620/autonomy-license` (production).
- Deterministic oracle is the source of truth; **no LLM judge**; no model sets
  rewards/labels/license.
- No dataset binaries committed; DROID/MVTec are *inspiration only* (not downloaded;
  MVTec non-commercial). No secrets / `.env` / `.venv` / caches committed.
- RSL is a **readiness benchmark score / operational gate, not a regulatory certification**.

---

## What I'd value feedback on

1. **Positioning:** does "personalized, self-improving robot brain; safety as baseline"
   land for a YC audience, or should safety be more prominent for the high-trust buyer?
2. **Naming:** is **Origin** the right name (vs alternates Clearance / Ascend / Forge)?
3. **Narrative order & hierarchy** on the home — is the light→dark→light rhythm and the
   hero(board) vs brain(image) vs film(stakes) split the strongest arc?
4. **The RSI "Improvement" story** — the climb uses real Haiku→Sonnet anchors + a *labeled
   projection*. Is the honesty framing clear, and is it convincing?
5. **The Simulate board** (robot on the user's own floor) — is the submit→watch→license
   loop legible and credible?
6. **Trust/scope copy** — are the deterministic-oracle and dataset-boundary claims tight
   and defensible?
7. Any **dead ends / broken nav**, off-brand copy, a11y or responsive issues.

---

## Recent commit trail (this initiative, newest first)

- `90da1a3` collaboration video + poster + "The brain" image band
- `3131d2b` "Physical AI is here" film band + closing CTA
- `7ae49b5` live robot board on the user's site (Simulate) + console = workspace
- `3b0b959` Origin: one home at `/`, console at `/app.html`, clear submit funnel
- `8f889fd` RSI tier-climb + moving-robot hero + scroll narrative
- `843cc22`…`45c7896` browser dashboard (scorecards, gallery+board, curve, exporter)
- `fa03e8a`…`83e7365` benchmark v2 (32 cases), per-model harness, RSL reporting, 16→32 cases

## Future work (not done — needs your call / a decision)
- A real RL/fine-tune pass that actually *moves* a model's tier (today the climb is a
  labeled projection between two measured anchors).
- Real MVTec/DROID grounding (downloads + license review).
- Decide whether/when to merge this sandbox back toward the production console.
