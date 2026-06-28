# Origin Physical AI — monorepo guide (for Claude / contributors)

Unified monorepo merging five sources (see [docs/MIGRATION.md](docs/MIGRATION.md) for provenance).
**Built copy-first; originals untouched and are the rollback.** Do not delete `~/hackathons/0619`,
`0620-test`, `Cobra`, `Chronos` until the live site is confirmed stable here.

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
