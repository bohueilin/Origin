# Origin Physical AI — monorepo guide (for Codex / contributors)

> **Start here.** For code in THIS (public) repo, this file is the guide.
> **Internal status, roadmap, and strategy live in a private doc kept OUTSIDE this public repo** —
> ask the maintainer for it. This public repo is the **trust layer + evidence format + demos only**;
> the proprietary algorithm work lives in a separate private repo and must never land here.
> Read first: [README.md](README.md) · [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) · [REPO_STRUCTURE.md](REPO_STRUCTURE.md).

Unified monorepo merging the source projects.
**Built copy-first; originals untouched and are the rollback.**

Also read `CODEX.md`. If your launch prompt or `~/.codex/AGENTS.md` names a private status handoff, read it before editing.

## Operating rules (for agents)
- **No deploy, no push, no git staging, no external APIs** without explicit Bo-Huei authorization.
- **Oracle-only:** the deterministic oracle is the sole label/reward authority — never an LLM grading an LLM.
- Generated **counterfactual** robustness ≠ customer-owned proof; **synthetic** demo evidence ≠ real customer proof; **authorized fixture** ≠ real customer data — keep these lanes separated.
- Learned-policy results use **route-summary / map-derived features**, not raw end-to-end perception. No production-autonomy or robot-certification claim.
- **Never commit `.env*`** except `.env.example` (`.gitignore` covers `.env*`).

## Layout
- `apps/origin-web` — the LIVE site (Cloudflare Pages). Byte-preserve canonical URLs, `og:url`, JSON-LD URLs, OG images, `public/legal/*` text, `robots.txt`, `insforge.toml`, and dated evidence under `public/trust/` and `public/proof/`, unless the task names explicit owner approval. Named HTML body edits are allowed.
- `apps/janus` — Janus (formerly Passport; agent credential broker) + Autonomy Trace Console (eval gym).
- `apps/chronos-ui` — Chronos front-end (React 18 + Tailwind).
- `services/{cobra,chronos}` — Python (`uv`), each isolated with its own venv.
- `factory/legacy` — EnvForge HTML prototype (React port = future `apps/envforge`).
- `packages/*` — shared TS substrate (verifier-core/evidence/config), filled over time.

## Build / run
`make help`. TS = npm workspaces (`npm run build --workspaces`); Python = per-service `uv`.
Front door is the [Makefile](Makefile). pnpm/turbo are a documented future upgrade (not installed here).

## Hard rules
- **Never commit `.env*` except `.env.example`.** Live keys (Snaplii real-money, InsForge admin, GMI,
  1Password, Nebius) live only in per-app `.env.local`.
- **Origin is the canonical deploy source** for the live site (`apps/origin-web`,
  https://originphysicalai.com), replacing the legacy `physical-ai-demo-test`. The Cloudflare Pages
  **cutover** happened on 2026-09-16 (runbook: [docs/CUTOVER.md](docs/CUTOVER.md)). Deploys are
  **human-dispatched**: pushing builds and checks only; a human runs `workflow_dispatch` on
  `.github/workflows/deploy-origin-web.yml` with the typed confirmation `DEPLOY` (see
  [docs/DEPLOY.md](docs/DEPLOY.md)). Never trigger a deploy without explicit authorization.
- `SNAPLII_LIVE=0` by default (fail-closed money path); `EPISODE_SIGNING_SECRET` required for prod backend.

## Next goal
The trust spine + the Cobra/Chronos verifier-hardening loop are the foundation.
