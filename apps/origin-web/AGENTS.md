# AGENTS.md

<!-- INSFORGE:START -->
## InsForge backend

This project uses [InsForge](https://insforge.dev): an all-in-one, open-source Postgres-based backend (BaaS) that gives this app a database, authentication, file storage, edge functions, realtime, an AI model gateway, and payments through one platform.

- **Project:** **Origin** (API base `https://82fs5fqk.us-west.insforge.app`)
- **Skills:** these InsForge skills are installed for supported coding agents. Reach for them before implementing any InsForge feature instead of guessing the API:
  - `insforge`: app code with the `@insforge/sdk` client (database CRUD, auth, storage, edge functions, realtime, AI, email, and Stripe payments).
  - `insforge-cli`: backend and infrastructure via the `insforge` CLI (projects, SQL, migrations, RLS policies, storage buckets, functions, secrets, payment setup, schedules, deploys).
  - `insforge-debug`: diagnosing failures (SDK/HTTP errors, RLS denials, auth and OAuth issues) and running security or performance audits.
  - `insforge-integrations`: wiring external auth providers (Clerk, Auth0, WorkOS, Better Auth, etc.) for JWT-based RLS, or the OKX x402 payment facilitator.
  - `find-skills`: discovering additional skills on demand.
- **Credentials:** app code reads keys from `.env.local`; the CLI reads `.insforge/project.json`. Never hardcode or commit keys.

Key patterns:

- Database inserts take an array: `insert([{ ... }])`.
- Reference users with `auth.users(id)`; use `auth.uid()` in RLS policies.
- For storage uploads, persist both the returned `url` and `key`.
<!-- INSFORGE:END -->

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

## Deploy (Origin is canonical; human-dispatched)
This repo (`apps/origin-web`) is the **canonical deploy source** for the live site,
https://originphysicalai.com, replacing the legacy `physical-ai-demo-test`. The cutover happened on
2026-09-16. The Cloudflare Pages project is a direct upload, not a Git-integration build: pushing to
`main` runs the build-and-gate job of `.github/workflows/deploy-origin-web.yml` only. A deploy is a
human `workflow_dispatch` of that workflow with the typed confirmation `DEPLOY`; it re-tests that
commit and uploads the built `dist` with Wrangler (see [`../../docs/DEPLOY.md`](../../docs/DEPLOY.md)).
Never deploy without explicit authorization.
