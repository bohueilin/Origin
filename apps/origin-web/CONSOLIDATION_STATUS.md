# Origin Consolidation — Status & Plan (for Codex design feedback)

> Repo: `bohueilin/physical-ai-demo-test`, branch `hud-factorydad-1`.
> Live: https://origin-physical-ai.pages.dev. Flow: localhost → inspect → push → deploy.
> This documents an in-progress consolidation. P0 is done (local, uncommitted); P1–P5 are planned.

## 1. Project context — what we're building
**Origin = the robot-readiness layer for Physical AI** (the startup). A robot can do the physical
work; the hard part is the *brain* deciding safely. Origin builds a **site-specific robot brain +
readiness gate**: submit a site → build the brain → run the proving ground → earn a readiness
license. The spine is **finish / escalate / refuse + RSL tiers + FAR/FRR**, and the
**deterministic oracle is the only judge** (no LLM judge, ever).

We are **consolidating a teammate's "FactoryCEO/ShiftBench" work** (from repo
`autonomy-trace-console`, branch `factoryceo-physical-ai`) **into Origin as a subsystem** — not a
separate product. The teammate built a real model "brain": an LLM proposes a factory operating plan
→ a deterministic verifier gates it → a recursive **TRM repair loop** drives hard-constraint
violations to zero → distill a tiny student → HUD/GRPO/Fireworks training → MuJoCo/Isaac humanoid +
V-JEPA perception. Plus the **Staer** warehouse floor-plan dataset and a studio UI.

**Decision (locked):** keep Origin's design, story, and flow. The "brain" folds onto Origin's
existing 4-step funnel; factory-ops scheduling is positioned as **one decision competency within
readiness**, never the headline.

| Origin step (exists) | Brain capability folded in |
|---|---|
| 1. Submit your site | Staer floor library as a "Reference floor" capture mode |
| 2. Build the robot brain | the plan → verify → repair stream + reasoning (the signature moment) |
| 3. Run the proving ground | MuJoCo before/after + three.js 3D humanoid + decision ledger |
| 4. Get the readiness license | RL/training evidence into the existing PolicyProgression / RsiClimb |

## 2. Architecture decisions
- **Hybrid hosting.** Public Pages site stays **static-first** (instant, secret-free): cached
  `public/factoryceo/library/*.json` + the client-side deterministic oracle. The Python **FastAPI
  brain** (`factoryceo_trm/api.py`, port 8090) is **optional** — when `VITE_BRAIN_URL` is set it
  powers live planning; when absent/unreachable, every brain call **falls back to cached JSON
  (never throws)**. Default brain host = Fly.io.
- **Two backends coexist:** existing Hono server (`/api`, `/v1` — voice/gym/evidence) + the new
  FastAPI brain (absolute `VITE_BRAIN_URL`, CORS-scoped).
- **Trust boundary preserved:** the verifier gates before the RULER LLM judge; deterministic
  fallbacks everywhere; no secrets in the client (`VITE_*` are public only).
- **Staer data:** full 266 MB dataset is in the repo via **Git LFS** under `data/staer-samples/`
  (outside `public/`, never shipped to Pages); only the curated ~11 MB UI subset is in `public/`.

## 3. Work done — P0 Foundation (local, gates green, NOT pushed)
- Copied `factoryceo_trm/` (full pipeline; invisible to the Vite/TS build).
- Copied curated `public/factoryceo/` (plain git, Pages-safe) + raw `data/staer-samples/` (LFS).
- Installed git-lfs; `.gitattributes` routes scene-graphs/images + `results/*.jsonl` to LFS.
- New typed modules (the "debt firewall" — zero `any`, so the teammate's 16 lint errors did NOT
  come across): `src/brainTypes.ts`, `src/apiConfig.ts`, `src/brainClient.ts` (cached-floor loaders
  + SSE stream reader with graceful fallback), typed `src/factoryStore.ts`.
- `.env.example` documents `VITE_BRAIN_URL` + server-side keys (Fireworks/HUD/Anthropic/HF).
- **Gates: `npm run build` ✅, `npm run lint` ✅.** No UI change yet (foundation only).

## 4. Next planned work
- **P1 — Staer floors in Capture (first visible, offline-safe):** `src/components/FloorLibrary.tsx`
  + `src/staerAdapter.ts`; add a "📁 Reference floor" mode to `CaptureConsole`; picking a floor
  flows into the existing funnel from the cached library; grid floors light up the existing
  `DrawnFloorEval`.
- **P2 — Brain stream in Step 2 (signature moment):** `src/components/brain/BrainStream.tsx`
  (live plan→verify→repair, one dark moment) + `ReasoningPanel`; extend `VerifierCard` with
  before/after + repair ops; live when brain enabled, else cached replay.
- **P3 — Proving ground:** port (isolated) `brain/FloorScene3D.tsx` (three.js, restyle to Origin
  tokens), `brain/MujocoBeforeAfter.tsx`, `brain/DecisionLedger.tsx` into
  `EnvironmentPreview`/`WorkflowIllustration`.
- **P4 — RL evidence:** feed brain RL/baseline rows into the existing `PolicyProgression`/`RsiClimb`;
  `brain/TrainingEvidence.tsx` in `LicenseResults`; FactoryBench numbers into `data.json`; a new
  marketing `BrainLoop` section; HowItWorks step-2 copy.
- **P5 — Self-host + polish + deploy:** `RUNBOOK.md` (venvs, keys, Fly.io, regenerate the cached
  library), scope CORS to the Pages origin, `ProfileMenu` in the appnav, mobile sweep, verify the
  Staer/HF license, then push + deploy.

## 5. Component strategy
Reuse > rebuild. MERGE every "judge" surface into existing Origin components (`VerifierCard`,
`PolicyProgression`, `RsiClimb`, `ScorecardPanel`, `LicenseResults`) so there's one license spine;
new `src/components/brain/*` files render *process only*, never re-derive scores. Decompose the
teammate's 3,064-line `FactoryCeoPanel.tsx` into small Origin-styled components using the existing
design tokens (no new palette). Anthropic principles: one signature moment (the dark plan→verify→
repair stream), light→dark→light rhythm, the finish/escalate/refuse triad as the visual through-line,
restraint (collapse training detail by default).

## 6. Open design questions (for Codex)
1. Does folding factory-ops scheduling in as "one decision competency" dilute the clean Origin
   robot-readiness pitch, or strengthen it? Better framing?
2. Where exactly should the Staer floor library live in the funnel — a capture mode, or also a
   gallery on the marketing home?
3. The "two judge vocabularies" (brain feasibility/safety repair vs Origin finish/escalate/refuse):
   how to present as ONE coherent story in `VerifierCard` without confusing two scoring systems?
4. Is the hybrid static+optional-brain the right call for a YC demo, or should the live brain be
   front-and-center?
5. The signature moment: is the plan→verify→repair stream the right "one wow," or is the 3D
   humanoid proving ground more compelling for investors?
