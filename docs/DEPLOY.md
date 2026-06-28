# Deploy — Origin Physical AI

## The live site (unchanged by the monorepo)
`origin-physical-ai.pages.dev` is deployed by **Cloudflare Pages watching GitHub repo
`bohueilin/physical-ai-demo-test`, branch `hud-factorydad-1`**. It is bound to GitHub, **not** to any
local folder — so building this monorepo cannot affect the live site. The old repo keeps deploying and
is the instant rollback.

The deploy-critical, hardcoded-URL files were copied **byte-for-byte** into `apps/origin-web` and must
stay verbatim: `index.html` / `app.html` / `passport.html` (og:/canonical), `public/_headers`,
`public/robots.txt`, `public/sitemap.xml`, `public/llms.txt`, `insforge.toml` (OAuth allowlist),
`src/auth/AuthProvider.tsx` (redirect fallback). Do not relativize them.

## Cutover — HUMAN-OWNED, reversible, do LAST
Only after the monorepo's `apps/origin-web` builds and you've confirmed parity. Two safe options:

**A) Repoint Cloudflare Pages at the monorepo (cleaner long-term)**
- Pages project → Settings → Build & deploy:
  - Connected repo: `bohueilin/Origin`, Production branch: `main`
  - Root directory: `apps/origin-web`
  - Build command: `npm install && npm run build` (workspace-aware) or `npm --prefix ../.. install && npm run build`
  - Output directory: `apps/origin-web/dist`
- Keep `bohueilin/physical-ai-demo-test` for instant rollback.

**B) Push the built bundle (lowest-risk, keeps current binding)**
- `cd apps/origin-web && npm run build && npx wrangler pages deploy dist --project-name origin-physical-ai`

## Parity check before cutover
`make build` then diff `apps/origin-web/dist` against a fresh build of the untouched old repo (ignore
content-hash filenames); run the dist secret-scan. Proceed only if functionally identical.

## Out-of-band (owner-only, not redeployed by this repo)
InsForge edge functions + the OAuth redirect allowlist (`insforge.toml`) deploy to InsForge separately.
If the canonical URL ever changes, the InsForge OAuth allowlist + OP/Snaplii broker config must be
updated by the owner.

## Secrets
Recreate each app's `.env.local` by hand (never copied). Keep `SNAPLII_LIVE=0` and the per-buy/daily
caps; set `EPISODE_SIGNING_SECRET` on any hosted Hono backend (it refuses to start in production without it).
