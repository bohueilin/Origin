# CLAUDE.md — apps/origin-web working guide

> **Canonical story lives at the repo root** ([`../../README.md`](../../README.md),
> [`../../PROJECT_OVERVIEW.md`](../../PROJECT_OVERVIEW.md)). Origin is **the evidence layer
> for AI agents** — *Model proposes. Environment verifies. Gate decides. Trace proves.
> Capability is not permission.* Physical-AI robot readiness is the longer-term arc on the
> same evidence spine, not the current product. Do not re-introduce "robot-readiness
> license" / certification framing here — it contradicts the live site.

**This app:** the live marketing site + the evidence console + the public `/security`,
`/verify`, `/trust`, `/proof` pages. Live: https://origin-physical-ai.pages.dev.

## Build / test / gates
- `npm run build` — `tsc -b && vite build`.
- `npm run lint` — `eslint .` (must be **zero errors**).
- `npm test` — vitest. `npm run gates` — build + lint + verify:evidence + proof:verify + test.
- Repo-wide: `make gates-all` from the root runs every suite + the evidence-verify scripts +
  honesty-lint (one green scoreboard → `public/trust/gates-summary.json`).

## Architecture
- Frontend: React + TS + Vite. Marketing pages = `src/factorydad/`, `src/foundry/`; the
  evidence surfaces = `src/security/`, `src/verify/`, `src/home/`. Page entries are the
  `*.html` vite inputs, not a single-page router.
- Deterministic engine (client): `src/warehouse.ts` (`bfsOracle`, verifier), `src/siteEval.ts`.
- Evidence spine: `@origin/evidence` + `@origin/verifier-core` (canonical JSON, isomorphic
  SHA-256, ScoreReceipts, ES256 Sigils, Merkle, Crucible). `/verify` re-checks offline.
- Backend: Hono server (`server/`) + Cloudflare Pages Functions (`functions/`, deployed).

## Non-negotiables (trust)
- **Determinism is sacred.** The deterministic oracle is the sole authority over labels,
  gates, and hard-zeros — never an LLM grading an LLM. (An optional post-gate reward shaper
  exists in `env/reward-module.ts`; off by default, can only reduce within the oracle's verdict.)
- **"measured" = a real oracle-scored run only; everything else is labeled "projected."** No
  fabricated metrics. Physical-AI training metrics shown on the site are private-pipeline and
  labeled as such (not re-derivable from this public repo).
- Claims stay scoped: "reproducible under this verifier," never "safe"/"correct." `honesty-lint`
  enforces this on served pages (prose + meta/og/title + curated React copy) — keep it green.
- Secrets stay server-side; `VITE_*` holds **public values only**. Never commit `.env*` except
  `.env.example`.

## Deploy (Origin is canonical; human-owned cutover)
This repo (`apps/origin-web`) is the **canonical deploy source** for the live site, replacing the legacy
`physical-ai-demo-test`. The Cloudflare Pages **cutover** (repointing the Git source at `bohueilin/Origin`)
is a human dashboard action — see [`../../docs/CUTOVER.md`](../../docs/CUTOVER.md). Verified Pages build:
root `apps/origin-web`, `npm install && npm run build`, output `dist`. Pushing this repo does not deploy;
after cutover, deploys stay human-gated. Never deploy without explicit authorization.

## Pointers
- Design language: [`DESIGN_PRINCIPLES.md`](DESIGN_PRINCIPLES.md).
- Deploy + cutover: [`../../docs/DEPLOY.md`](../../docs/DEPLOY.md).
