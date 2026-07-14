# Cloudflare Pages cutover — make `Origin` the deploy source

> **Goal:** point the live site `origin-physical-ai.pages.dev` at **`bohueilin/Origin`** so everything
> lives in one repo, instead of the legacy `bohueilin/physical-ai-demo-test`. This is the one action
> that makes all the honesty fixes + the new pages (`/security`, `/verify`, `/reference-check`,
> `/simulation`, `/operations`) actually reach visitors.
>
> **Who does what:** the repo is already deploy-ready and verified (below). The **repoint + env-var**
> steps are a **human dashboard action** (an agent has no Cloudflare credentials). It is **reversible** —
> the old repo stays as instant rollback until you delete it.

## Why this is safe
- `physical-ai-demo-test` is the **same app, older** (`autonomy-trace-console`, identical `tsc -b &&
  vite build`). Origin's `apps/origin-web` is a **superset** — every live page plus the 5 new ones, the
  `functions/`, and the honesty fixes. Nothing is lost; only added.
- Repointing a Pages project's **Git source keeps the project's environment variables** (they are
  project-level, not per-repo). So auth, InsForge, and the VITE_* build vars carry over untouched.
- The build was **verified from a clean clone** of Origin (see "Verified build" below): it produces the
  full site with all pages and resolves the `@origin/*` workspace packages.

## The Pages build settings (verified — use exactly these)
Cloudflare dashboard → the `origin-physical-ai` Pages project → **Settings → Builds & deployments**:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Git repository | `bohueilin/Origin` |
| **Root directory** | `apps/origin-web` |
| **Build command** | `npm install && npm run build` |
| **Build output directory** | `dist` *(i.e. `apps/origin-web/dist`)* |
| Node version | `20` *(set env `NODE_VERSION=20` if needed)* |

- Clean URLs work automatically (Pages serves `/verify` → `/verify.html`, same as today's `/proof`).
- **Functions:** with root `apps/origin-web`, Pages auto-detects `apps/origin-web/functions/` (11
  Pages Functions). They are **fail-closed by default** — a function with an unset key refuses rather
  than misbehaving — so an incomplete env is safe, just degraded.

## Environment variables to confirm on the Pages project
Most already exist (they build the live site today). **Confirm** these are present after repointing;
set any that are missing. Public `VITE_*` are build-time and baked into the bundle:

- **Build (public, VITE_):** `VITE_INSFORGE_URL`, `VITE_INSFORGE_ANON_KEY`, `VITE_BRAIN_URL`,
  `VITE_API_BASE_URL`, `VITE_FOUNDRY_API_BASE`, `VITE_PASSPORT_ORDER_CONTEXT`,
  `VITE_DISABLE_OPTIONAL_BACKEND_FETCHES` (as configured today).
- **Functions (runtime, server-side, secret):** for demand capture to actually deliver instead of
  falling back to a mailto — set **`LEAD_WEBHOOK_URL`** (Slack/Discord webhook) *or*
  **`RESEND_API_KEY` + `LEAD_TO_EMAIL` + `LEAD_FROM_EMAIL`**. Money-path brokers (Snaplii / 1Password /
  InsForge) stay **fail-closed** (`SNAPLII_LIVE=0`) unless deliberately configured; `EPISODE_SIGNING_SECRET`
  only matters for the hosted Hono backend, not the Pages Functions.
- Never paste real keys into the repo — set them only in the Pages dashboard. `.env.example` lists the
  full set.

## Do it (≈5 minutes)
1. **Preview first (optional, zero-risk):** create a *new* Pages project bound to `bohueilin/Origin`
   with the settings above → get a `*.pages.dev` preview → click through `/`, `/verify`, `/simulation`,
   `/operations`, `/reference-check`, `/security`, and one Sign-in. Confirm it looks right.
2. **Repoint production:** on the existing `origin-physical-ai` project, change the Git repository to
   `bohueilin/Origin` and apply the build settings above. Trigger a deploy from `main`.
3. **Verify live:** the 5 new routes return 200 and render; the landing + `/trust` + `/brief` are intact;
   `/verify` re-checks a pasted credential; no console errors.
4. **Keep rollback:** leave `physical-ai-demo-test` connected-but-unused (or note its last good commit).
   Only after a few good days: archive it, and (optional) run the git-history purge of the leaked
   `factoryceo_trm` before archiving if you want it gone from history too.

## After cutover (repo already reflects this)
- `docs/DEPLOY.md` and `CLAUDE.md` now name **Origin** as the canonical deploy source.
- The push-inert, human-gated `deploy-origin-web.yml` remains the belt-and-suspenders path: to enable
  the "Actions → Run workflow → type DEPLOY" flow, add the repo secret `CLOUDFLARE_API_TOKEN`
  (scope: *Account › Cloudflare Pages › Edit*). Until then, deploys happen via the Git integration above.
- Optional polish before/after: register the real domain + MX (fixes the `originphysical.ai` NXDOMAIN
  lead/contact path), enable branch protection on `main`, add a LICENSE. See `~/hackathons/REMAINING_BUILD.md`.

## Verified build (reproduce)
```bash
git clone https://github.com/bohueilin/Origin && cd Origin/apps/origin-web
npm install && npm run build     # exit 0; dist/ contains index, verify, security, reference-check,
                                 # simulation, operations, trust, brief, proof, app, … (17 pages)
```
Confirmed 2026-07-14 from a clean clone: `@origin/evidence` + `@origin/verifier-core` resolve via the
workspace, all pages build, `functions/` (11) are present for Pages to pick up.
