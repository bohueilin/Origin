# Origin Physical AI — Session Handoff (for Codex)

_Last updated: 2026-06-28. This is a cold-start handoff: everything below is current, verified state._

Origin Physical AI is a unified monorepo merging five codebases. One thesis runs through all of it:
**capability is not permission** — an agent (or robot) may *propose*; a deterministic, auditable
control plane decides what it may actually *do*. The near-term goal is **RL environments + safe
recursive self-improvement (RSI)** (see [RSI-ROADMAP.md](RSI-ROADMAP.md)).

---

## 0. TL;DR — what's live right now

| Thing | URL / location | State |
|---|---|---|
| **Monorepo** | local `~/hackathons/Origin` · GitHub `bohueilin/Origin` (**private**) · branch `main` | ✅ pushed |
| **Marketing/console site (LIVE)** | https://origin-physical-ai.pages.dev | ✅ served from `apps/origin-web` |
| **Passport demo (always-on)** | https://passport.origin-physical-ai.pages.dev/passport | ✅ Pages alias |
| **Passport backend (always-on)** | https://origin-passport-api.bohuei-lin.workers.dev | ✅ CF Worker + Durable Object |

Latest commits (`bohueilin/Origin` `main`): `0dc14ed` (Workers backend) · `628530b` (Makefile) · `1db2e72` (monorepo import).

**Build it:** `cd ~/hackathons/Origin && make install && make build` (see [§3](#3-build--run)).

---

## 1. Repository layout

```
~/hackathons/Origin                      # git: bohueilin/Origin (private), branch main
├── apps/
│   ├── origin-web      # THE LIVE marketing/console/robot-readiness site (React 19 / Vite / Hono)
│   │                   #   ← copy of 0620-test/physical-ai-demo-test @hud-factorydad-1 (3b7e252)
│   ├── passport        # Passport (agent credential broker) + Autonomy Trace Console (eval gym)
│   │                   #   ← copy of 0619/autonomy-trace-console (a6777c5)
│   │                   #   server/ = Hono backend; worker/ = Cloudflare Workers port (see §5)
│   └── chronos-ui      # Chronos front-end (React 18 + Tailwind) — INSTALLED STANDALONE (see §3 gotcha)
│                       #   ← copy of Chronos/frontend (+ its design-system/ bundled in)
├── services/           # Python, per-service `uv` (each its own .venv; NOT a single uv workspace)
│   ├── cobra           # auto-harden RL verifiers vs reward hacking   ← Cobra (c55cf64)
│   ├── chronos         # reward-hack discovery + verifier hardening    ← Chronos python (760daa8)
│   └── factoryceo-trm  # FastAPI planner/repair "brain"               ← 0620 factoryceo_trm (requirements.txt→pyproject)
├── factory/legacy/envforge-console_615.html   # EnvForge admin console (byte-for-byte prototype; React port pending)
├── packages/           # shared TS substrate (verifier-core/evidence/config) — EMPTY, to be extracted
├── datasets/           # heavy data (staer-samples NOT copied; stays in the original repo)
├── docs/               # ARCHITECTURE · MIGRATION · DEPLOY · RSI-ROADMAP · this file
└── Makefile  package.json  README.md  CLAUDE.md  tsconfig.base.json
```

**Provenance / rollback:** built **copy-first**. The five originals (`~/hackathons/0619/autonomy-trace-console`,
`0620-test/physical-ai-demo-test`, `Cobra`, `Chronos`, `envforge-console_615.html`) are **untouched** at the
SHAs above and ARE the rollback. Do not delete them until the live site is confirmed stable here. Full table:
[MIGRATION.md](MIGRATION.md).

---

## 2. Architecture (the trust spine)

`intent → control plane (plan → capability check: read≠commit → deterministic verifier → human approval
→ audit) → broker (scoped, ephemeral, revocable; secret resolved server-side at the call boundary, never
in the model) → world (payments / messaging / robots / RL envs)`. The research loop — **Cobra** (red-team →
patch verifiers) ⇄ **Chronos** (find reward hacks → freeze as regression tests → harden grader) — protects
the very verifiers RSI training relies on. Diagram + trust boundaries: [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 3. Build & run

Tooling: **npm workspaces** (TS) + **per-service `uv`** (Python) + a **Makefile** front door.
(pnpm/corepack are NOT installed on this machine; pnpm+turbo is a documented future upgrade — see MIGRATION.md.)

```bash
cd ~/hackathons/Origin
make install        # npm install (workspaces) + chronos-ui standalone + uv sync each service
make build          # build all 3 TS apps
make test           # vitest across apps
make help           # all targets
# per-service Python:  cd services/cobra && uv run python -m cobra.server --seed   (etc.)
```

**Verified green:** all 3 TS apps build (`origin-web` emits index/app/passport/auth.html; `passport` builds + **140 vitest tests pass**; `chronos-ui` builds). All 3 Python services `uv sync` + import-smoke OK.

**GOTCHA — chronos-ui is React 18, the other apps are React 19.** Under npm hoisting, `tsc` in chronos-ui
picked up the hoisted React 19 types (`bigint` in `ReactNode`) and failed. Fix in place: chronos-ui is
**excluded from the npm `workspaces` array** and installed **standalone** (own `node_modules`); the Makefile
builds it separately. Also: its Tailwind preset lives in a bundled `apps/chronos-ui/design-system/`
(copied from `Chronos/design-system`; `tailwind.config.js` import was repointed `../` → `./`).

---

## 4. Deployments

### 4a. Live site — `origin-physical-ai.pages.dev`
- Cloudflare Pages project `origin-physical-ai` is **direct-upload** (Git Provider: No — NOT github-watched).
  Production branch: `hud-factorydad-1`.
- Deployed from the monorepo via:
  ```bash
  cd apps/origin-web && npm run build
  npx wrangler pages deploy dist --project-name origin-physical-ai --branch monorepo-preview   # preview-verify first
  npx wrangler pages deploy dist --project-name origin-physical-ai --branch hud-factorydad-1    # → production
  ```
- Byte-identical to the prior live build; all routes (`/ /app /passport /auth`) return 200; canonical `og:url`
  preserved. Prior production deployment retained in Pages history = instant rollback.
- **Byte-preserve** the deploy-critical files in `apps/origin-web` (hardcoded canonical URLs): `index.html`,
  `app.html`, `passport.html`, `public/_headers`, `public/robots.txt`, `public/sitemap.xml`, `insforge.toml`.

### 4b. Passport always-on (the new piece)
- **Frontend:** `apps/passport` built with `VITE_API_BASE=<worker URL>`, deployed to Pages alias `passport`
  (`passport.origin-physical-ai.pages.dev`). Redeploy:
  ```bash
  cd apps/passport
  VITE_API_BASE="https://origin-passport-api.bohuei-lin.workers.dev" npm run build
  npx wrangler pages deploy dist --project-name origin-physical-ai --branch passport
  ```
- **Backend:** Cloudflare **Worker** (see §5). Redeploy: `cd apps/passport && npx wrangler deploy`.

Full deploy notes + the human-owned cutover options: [DEPLOY.md](DEPLOY.md).

---

## 5. The Passport Cloudflare Workers backend

Files: `apps/passport/worker/index.ts`, `apps/passport/worker/op-sdk-stub.ts`, `apps/passport/wrangler.toml`.

- **The whole Hono app (`server/app.ts` `createApp`) runs inside ONE Durable Object** (`AppDO`, SQLite-backed
  → free-tier eligible). This keeps the handlers' in-process state (notify pending-approval, nonce ledger,
  credential leases) consistent across requests — a plain Worker would lose it across isolates.
- `node:crypto` works via `compatibility_flags=["nodejs_compat"]`.
- `@1password/sdk` is **stubbed** (`[alias]` in wrangler.toml → `worker/op-sdk-stub.ts`) — the native SDK
  can't run on Workers; the broker degrades to its mock path (no token).
- **Config is built from `env`** in `worker/index.ts` (`configFromEnv`), NOT `server/config.ts` (which uses
  `node:fs` for `.env.local`).
- **Secrets** are set via `wrangler secret` (NOT committed): `GMI_API_KEY`, `GMI_MODEL`, `GMI_BASE_URL`,
  `NTFY_TOPIC`, `DISCORD_WEBHOOK_URL`, `EPISODE_SIGNING_SECRET` (freshly generated), `PUBLIC_BASE_URL`
  (= the worker's own URL, for the phone-approve link), `EXTRA_WEB_ORIGINS` (`.origin-physical-ai.pages.dev`).

**Public-safe by design** (a public URL must not expose money or raw secrets):
- Wallet = **simulated** (no `SNAPLII_API_KEY` on the worker). 1Password broker = **mock** (no token).
- **No** money key / InsForge-admin key / 1Password service-account token on the public backend → email +
  durable-nonce are in-memory/simulated there too.

**Verified working on the edge:** GMI brain (routes "plan a game night…" → enrich-my-night, conf 0.97),
the approval flow (DO-backed `pending → approved` persists across separate requests), **Discord posts for
real**, CSRF origin guard (no-Origin POST → 403), order-context.

**⚠️ KNOWN GAP — ntfy phone-push does NOT deliver from the Worker.** Isolated cleanly: GMI + Discord egress
work from the Worker, and a direct ntfy POST from a normal host lands — but the Worker's POSTs to ntfy.sh
don't. **ntfy.sh throttles Cloudflare Worker egress IPs** (free-tier behavior). The **in-app "Approve" works
fully**. To get real phone *push* from the public URL, pick one:
1. **Twilio SMS** — code already supports it; set `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM` + `APPROVAL_PHONE` as
   worker secrets (Twilio's API isn't IP-throttled). Costs per SMS.
2. **ntfy access token** (ntfy Pro) — auth'd requests bypass the IP throttle; add an `Authorization: Bearer`
   header in `server/notifyHandler.ts` `pushNtfy`.
3. Keep the **local cloudflared tunnel** (`apps/passport`, `npm run deploy:public`) for the live-push demo —
   Node egress, which ntfy accepts.

---

## 6. Security posture (already hardened)

An adversarial review (multi-agent) ran on the Passport deploy surface; confirmed fixes are in `apps/passport`:
- **Origin guard is method-aware + fail-closed** (`server/app.ts` `walletOriginOk`): a state-changing POST with
  **no `Origin`** is refused (non-browser caller); same-origin GET reads still pass. Closes a fail-open hole on
  the money/credential routes when the backend is public.
- **`/api/passport/intent` is origin-guarded + throttled** (it calls a paid model — no cross-origin quota burn).
- **Notify headers are ASCII-folded** (`asciiHeader` on the ntfy `Title` + `Actions`) so a non-ASCII char can't
  throw and silently drop the push.
- **Money path:** `SNAPLII_LIVE=0` by default (fail-closed simulation); per-buy/daily caps; durable one-shot
  nonce ledger. Real charges only with `SNAPLII_LIVE=1` + a non-dev `EPISODE_SIGNING_SECRET`.
- **Secrets:** `.env*` is gitignored (only `.env.example` tracked); dist secret-scans are clean; the public
  Worker deliberately omits the money/admin/1Password secrets.

---

## 7. Per-component status

| Component | Build/run | Deployed | Notes |
|---|---|---|---|
| `apps/origin-web` | ✅ builds (4 entries) | ✅ origin-physical-ai.pages.dev | the live site; byte-preserve canonical URLs |
| `apps/passport` | ✅ builds + 140 tests | ✅ passport.origin-physical-ai.pages.dev + Worker | Enrich My Night polish in; see §5 |
| `apps/chronos-ui` | ✅ builds (standalone) | ⏸️ not deployed | React 18; has its own `vercel.json` |
| `services/cobra` | ✅ `uv sync` + import | ⏸️ local only | `uv run python -m cobra.server --seed` (golden replay, no key) |
| `services/chronos` | ✅ `uv sync` + import | ⏸️ local only | full functionality needs `.external` bootstrap + Docker envs |
| `services/factoryceo-trm` | ✅ `uv sync` + import | ⏸️ local only | converted requirements.txt → pyproject (`[tool.uv] package=false`) |
| `factory/legacy` | static HTML (open via file://) | ⏸️ | React port → `apps/envforge` is roadmap item R1 |

---

## 8. Open items / next steps (suggested order)

1. **R1 — Convert EnvForge** `factory/legacy/*.html` → `apps/envforge` (React/Vite, match the other apps),
   backed by InsForge tables for the RL-environment submission queue.
2. **R2 — Extract `packages/verifier-core`** — the deterministic oracle/verifier is currently duplicated in
   `origin-web` and `passport`; one hardened verifier should serve every surface.
3. **R3 — Formalize the Cobra⇄Chronos contract** (Chronos `ReleaseProof` / hardened grader → Cobra training input).
4. **R4 — First end-to-end RSI demo:** one submitted env → hardened verifier → an RL run that *would* have
   reward-hacked but is caught → readiness license.
5. **Phone-push on the public Worker** — wire Twilio (§5 option 1) if real push from the public URL is wanted.
6. **Python services hosting** — if always-on Cobra/Chronos/FactoryCEO are needed, they require a real
   Python host (Render/Fly/Railway) + secrets (not Cloudflare-Workers-portable).
7. **(Optional) tooling upgrade** — pnpm + Turborepo once pnpm is available; collapse the Python services into
   one `uv` workspace if their deps co-resolve.

---

## 9. Things to know before you touch anything

- **Never commit `.env*`** (only `.env.example`). Live keys (Snaplii real-money, InsForge admin, GMI,
  1Password, Nebius) live only in per-app `.env.local` in the **original repos** (not copied here).
- **Don't break the live site.** `origin-physical-ai.pages.dev` is direct-upload to project `origin-physical-ai`
  branch `hud-factorydad-1`. Deploy preview-first, verify, then production. Keep the prior deployment for rollback.
- **chronos-ui stays standalone** (React 18 isolation) — don't fold it back into the npm workspaces array.
- **The Worker hosts the app in a Durable Object** — if you add stateful handlers, that's why in-process Maps
  work; keep that pattern (or move state to KV/DO storage).
- **Calendar is not real in-app.** The Passport "calendar" step is a scripted/simulated demo step — there is no
  Google Calendar integration in the code. (A one-off real event was created out-of-band via a Calendar tool.)
- A separate global agent skill **`hackathon-prep`** (`~/.claude/skills/hackathon-prep/`) captures the demo-day
  retro learnings (naming + architectural depth) — not part of this repo, but relevant context.

---

## 10. Doc index
- [README.md](../README.md) — overview + quickstart
- [ARCHITECTURE.md](ARCHITECTURE.md) — layered diagram + trust boundaries
- [MIGRATION.md](MIGRATION.md) — provenance table + tooling decisions
- [DEPLOY.md](DEPLOY.md) — live deploy + cutover (human-owned, reversible)
- [RSI-ROADMAP.md](RSI-ROADMAP.md) — RL environments + recursive self-improvement plan
