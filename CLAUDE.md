# Origin Physical AI — monorepo guide (for Claude / contributors)

> **Start here. This is the single source of truth.** As of 2026-07-05 the consolidation is complete
> (see [MIGRATION_INVENTORY.md](MIGRATION_INVENTORY.md) · [docs/CONSOLIDATION_STATUS.md](docs/CONSOLIDATION_STATUS.md)).
> **Do not inspect the old hackathon folders** (`0619`, `0620`, `0620-test`, `Cerebras-0628`,
> `Cerebras-enterprise-0628`, `Chronos`, `Cobra`, `Floor design`) unless Bo-Huei explicitly asks —
> they are historical references only; their substantive work is already here and their copies are older.
> Read first: [README.md](README.md) · [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) · [REPO_STRUCTURE.md](REPO_STRUCTURE.md).

Unified monorepo merging the source projects (see [MIGRATION_INVENTORY.md](MIGRATION_INVENTORY.md) for provenance).
**Built copy-first; originals untouched and are the rollback.**

## Operating rules (for agents)
- **No deploy, no push, no git staging, no external APIs** without explicit Bo-Huei authorization.
- **Training is fail-closed:** `train:customer-policy` must exit `TRAINING_NOT_AUTHORIZED` without explicit authorization.
- **Real customer readiness stays blocked** until approved real customer evidence exists and passes gates.
- **Oracle-only:** the deterministic oracle is the sole label/reward authority — never an LLM grading an LLM.
- Generated **counterfactual** robustness ≠ customer-owned proof; **synthetic** demo evidence ≠ real customer proof; **authorized fixture** ≠ real customer data — keep these lanes separated.
- Learned-policy results use **route-summary / map-derived features**, not raw end-to-end perception. No production-autonomy or robot-certification claim.
- **Never commit `.env*`** except `.env.example` (`.gitignore` covers `.env*`).

## Layout
- `apps/origin-web` — the LIVE site (Cloudflare Pages). Byte-preserve its HTML/og/robots/sitemap/insforge.toml.
- `apps/passport` — Passport (agent credential broker) + Autonomy Trace Console (eval gym).
- `apps/chronos-ui` — Chronos front-end (React 18 + Tailwind).
- `services/{cobra,chronos,factoryceo-trm}` — Python (`uv`), each isolated with its own venv.
- `factory/legacy` — EnvForge HTML prototype (React port = future `apps/envforge`).
- `packages/*` — shared TS substrate (verifier-core/evidence/config), filled over time.

## Build / run
`make help`. TS = npm workspaces (`npm run build --workspaces`); Python = per-service `uv`.
Front door is the [Makefile](Makefile). pnpm/turbo are a documented future upgrade (not installed here).

## Hard rules
- **Never commit `.env*` except `.env.example`.** Live keys (Snaplii real-money, InsForge admin, GMI,
  1Password, Nebius) live only in per-app `.env.local`.
- **Never touch the live deploy** (`physical-ai-demo-test` / `hud-factorydad-1`) — cutover is human-owned
  and reversible; see [docs/DEPLOY.md](docs/DEPLOY.md).
- **Keep deploy-critical files in `apps/origin-web` byte-for-byte** (hardcoded canonical URLs).
- `SNAPLII_LIVE=0` by default (fail-closed money path); `EPISODE_SIGNING_SECRET` required for prod backend.

## Next goal
RL environments + safe recursive self-improvement — see [docs/RSI-ROADMAP.md](docs/RSI-ROADMAP.md).
The trust spine + the Cobra/Chronos verifier-hardening loop are the foundation.
