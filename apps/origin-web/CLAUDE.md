# CLAUDE.md — Origin working memory (read this first)

**Product:** Origin — the robot-readiness layer for Physical AI. Submit a site → build the robot
brain → run the proving ground → earn a readiness license. The teammate's "brain" (LLM plans →
deterministic verifier gates → recursive repair → RL) is a **subsystem of readiness, not a second
product**. Repo `bohueilin/physical-ai-demo-test`, branch `hud-factorydad-1`. Live:
https://origin-physical-ai.pages.dev.

## Build / test / gates
- `npm run build` — `tsc -b && vite build` (two entries: `index.html` = marketing home, `app.html` = console).
- `npm run lint` — `eslint .` (must be **zero errors**; flat config, `@typescript-eslint/no-explicit-any` on).
- `npm test` — vitest. `npm run gates` — build + lint + verify:evidence + test.
- Python brain: `cd factoryceo_trm && .venv/bin/python -m pytest tests/ -q` (9 offline suites).
- HUD bench: `cd hud-env/physical-ai-warehouse && uv run pytest -q`.

## Architecture
- Frontend: React 19 + TS + Vite. Marketing = `src/factorydad/`; console = `src/` (`src/App.tsx` view flow).
- Deterministic engine (client): `src/warehouse.ts` (`bfsOracle`, verifier), `src/siteEval.ts` (drawn-floor scoring).
- Backends (coexist): Hono server `server/` (`/api`,`/v1` — voice/gym/evidence) + optional FastAPI brain
  `factoryceo_trm/` (`:8090`). Frontend reaches the brain via `src/apiConfig.ts` (`VITE_BRAIN_URL`);
  **always falls back to cached `public/factoryceo/library/*.json` — brain calls never throw.**
- Data: curated `public/factoryceo/` (plain git, Pages-safe). Raw Staer 266MB in `data/staer-samples/`
  (Git LFS, outside `public/`, never shipped to Pages).

## Non-negotiables (trust)
- **Determinism is sacred.** The **deterministic oracle/verifier is the ONLY judge** — never an LLM judge.
- No model sets its own reward / label / FAR-FRR / license / readiness tier.
- **"measured" = a real oracle-scored run only; everything else is labeled "projected."** No fabricated metrics.
- Voice/video/uploads/site-maps/robots = descriptive inputs that pre-fill a human-reviewed form only.
- Secrets stay server-side; `VITE_*` holds **public values only**. Never commit `.env*`.

## Flow (never changes)
**localhost → inspect → push → deploy.** Build locally, verify on the dev server (preview MCP,
desktop + 375px, zero console errors, secret-scan `dist`), let the user inspect, THEN push to
`hud-factorydad-1` and deploy `dist` to Cloudflare Pages. Push/deploy/model-spend require explicit
user confirmation (see `.claude/settings.json`).

## Pointers
- Design language + locked preferences: `DESIGN_PRINCIPLES.md`.
- How to run/inspect the model + training pipeline: `RUNBOOK.md`.
- Current consolidation status + plan: `CONSOLIDATION_STATUS.md` (+ the approved plan).
