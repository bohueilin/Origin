# Origin Physical AI — Monorepo Migration

This repo unifies five previously-separate Origin codebases into one project. Built **copy-first**:
the originals were left fully intact and keep their own git history. This document is the provenance
record + the tooling decisions.

## Provenance — imported sources (copied, not moved)

| Monorepo path | Source folder | Branch | Commit | Remote |
|---|---|---|---|---|
| `apps/origin-web` | `~/hackathons/0620-test/physical-ai-demo-test` | `hud-factorydad-1` (LIVE prod) | `3b7e252` | `github.com/bohueilin/physical-ai-demo-test` |
| `apps/passport` (+ Console) | `~/hackathons/0619/autonomy-trace-console` | `passport/v2-white-voice` | `a6777c5` | `github.com/bohueilin/autonomy-trace-console` |
| `services/cobra` | `~/hackathons/Cobra` | `main` | `c55cf64` | `github.com/bohueilin/Cobra` |
| `services/chronos` + `apps/chronos-ui` | `~/hackathons/Chronos` | `main` | `760daa8` | (no remote) |
| `factory/legacy/…` | `~/hackathons/envforge-console_615.html` | — | loose file | — |

The originals are the rollback. Do **not** delete them until the live site is confirmed stable on the
monorepo for a cooling-off period.

## What was deliberately NOT copied (regenerated / secret / heavy)
`node_modules/`, `dist/`, `.git/`, `.venv/`, `.external/`, `.wrangler/`, `*.log`, `.DS_Store`, and
**all `.env*` except `.env.example`**. The 266 MB `staer-samples` LFS dataset lands under `datasets/`
(LFS, never deployed). Chronos `.external/` (142 MB) is refetched by its bootstrap script.

## Tooling decision (and why it differs slightly from the original plan)
The synthesis recommended pnpm + Turborepo. On this machine **pnpm and corepack are not installed**, so
to avoid a fragile mid-migration global install and to keep `make install` portable, the monorepo uses:

- **TS:** native **npm workspaces** (`apps/*`, `packages/*`) + a root **Makefile**. Each React app keeps
  its own toolchain; React 18 (chronos-ui) and React 19 (origin-web, passport) coexist because npm nests
  conflicting majors per-workspace.
- **Python:** **per-service `uv`** (each service its own `pyproject` + `.venv`). Not a single uv workspace —
  Cobra and Chronos are heavy research stacks whose deps may not co-resolve; isolation means one can't
  block the others.
- **Front door:** the `Makefile` (`make install / build / test / gates / dev-*`).

**Upgrade path (optional, later):** once pnpm is available (`corepack enable && corepack prepare pnpm@latest --activate`),
convert `workspaces` → `pnpm-workspace.yaml`, add `turbo.json`, and (if Cobra/Chronos deps co-resolve)
collapse the Python services into one `[tool.uv.workspace]`. Nothing in the apps needs to change.

## Deploy safety (unchanged by this migration)
The live site `origin-physical-ai.pages.dev` is deployed by **Cloudflare Pages watching GitHub repo
`physical-ai-demo-test` branch `hud-factorydad-1`** — bound to GitHub, NOT to any local folder. Copying
folders here cannot affect it. Cutover (repoint Pages at `bohueilin/Origin` → `apps/origin-web`, or
`wrangler pages deploy` the built dist) is a **separate, human-owned, reversible** step — see
[DEPLOY.md](DEPLOY.md). Until then the old repo keeps deploying and is the instant rollback.

## Status legend used in the check-in
- ✅ copied + builds/verifies green
- 🟡 copied + wired, heavier verification deferred (documented setup step)
- ⏸️ intentionally deferred (e.g., Factory React port, deploy cutover)
