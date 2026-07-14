# Deploy — Origin Physical AI

## Canonical deploy source = THIS repo (`bohueilin/Origin`, `apps/origin-web`)
We are consolidating: **Origin is the single source of truth for the live site**, replacing the legacy
`bohueilin/physical-ai-demo-test`. Origin's `apps/origin-web` is a **superset** of the old repo (same
app lineage, every live page **plus** `/security` `/verify` `/reference-check` `/simulation`
`/operations`, the `functions/`, and the honesty fixes) and its Pages build is **verified from a clean
clone**. The one remaining step — repointing the Cloudflare Pages Git source at Origin — is a
**human-owned dashboard action**; the full checklist is **[`docs/CUTOVER.md`](CUTOVER.md)**.

Until you run the cutover, the live site still deploys from `physical-ai-demo-test @ hud-factorydad-1`
(so **pushing Origin does not yet deploy**), and that old repo remains the instant rollback. After the
cutover, `physical-ai-demo-test` is legacy rollback only — archive it once Origin has deployed cleanly.

The deploy-critical, hardcoded-URL files live in `apps/origin-web` and must stay correct:
`index.html` / `app.html` / `passport.html` (og:/canonical), `public/_headers`, `public/robots.txt`,
`public/sitemap.xml`, `public/llms.txt`, `insforge.toml` (OAuth allowlist), `src/auth/AuthProvider.tsx`
(redirect fallback). Keep the canonical origin (`origin-physical-ai.pages.dev`) consistent across them.

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
