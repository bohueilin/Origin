# Session Summary — Origin Physical AI × Passport (2026-06-27)

Comprehensive record of one Claude Code session. Audience: a fresh Claude session, Codex, or a
human picking this up. Everything below is **done and (where noted) deployed live** unless marked
PENDING / KNOWN ISSUE.

## TL;DR

Built and shipped, to the **live production site** `https://origin-physical-ai.pages.dev`:
1. A redesigned Origin landing page around the thesis **"capability is not permission"** (physical + digital autonomy).
2. The **Passport** agent-identity demo as a live, **owner-gated** route at **`/passport`**.
3. Three award-winning visualizations + a prompt-injection scenario: **intent-conformance monitor**, **attenuated delegation chain**, **access ledger**, **"Guard the Inbox"**.
4. A **real Snaplii payment broker** (InsForge edge function) with an **owner-approved purchase** in Account Settings → Wallets and an **agent-driven purchase** in `/passport` ("Treat the Team"). Simulation-safe; one flag flips it to real money.
5. Fixed a **production CORS bug** that breaks *every* InsForge edge function via the SDK.
Plus, in repo A: a reusable **`guardian-agent-foundations` skill** and a **Dawn Song pitch deck**.

PENDING: **Item 2** (1Password granular per-robot/fleet credential grants) — blocked on the user pasting the `OP_SERVICE_ACCOUNT_TOKEN` (`ops_…`) + vault name.

---

## The two repos (important — there are two "Passports")

| Repo | Path | Role |
|---|---|---|
| **Repo A** | `/Users/bohueilin/hackathons/0619/autonomy-trace-console` | Original Passport demo source + `server/snapliiHandler.ts` (Node broker) + the `guardian-agent-foundations` skill + the AGI House autonomy-license gym. Branch `passport/v2-white-voice`. Has the **P1** 1Password broker commit `b3b27fe`. **Not deployed.** |
| **Repo B** | `/Users/bohueilin/hackathons/0620-test/physical-ai-demo-test` | **THE LIVE SITE** → `https://origin-physical-ai.pages.dev`. Branch `hud-factorydad-1`. Cloudflare Pages (static) + **InsForge** edge functions + InsForge auth (Google OAuth). All the deploy work this session is here. |

Deploy (repo B): `npm run build && npx wrangler pages deploy dist --project-name origin-physical-ai --branch hud-factorydad-1 --commit-dirty=true`. InsForge project `8ccc649d-a420-47a5-8d31-c9eeee6c668b`, oss host `https://36s5vrcx.us-east.insforge.app`.

The live Passport at `/passport` is a **client-side port** of repo A's `src/passport/` (no Node server). Real backend calls go to InsForge edge functions in `repo B / functions/`.

---

## Workstream 1 — `guardian-agent-foundations` skill (repo A)

A reusable knowledge skill distilled from the user's "Virtue AI" research folder (`~/Documents/Research Papers/Virtue AI/`, 9 papers + 9 blog posts) **plus** the 1Password "Agent Identity Build Day" brief.

Location: `repo A/.claude/skills/guardian-agent-foundations/` — `SKILL.md` + `references/{worldview, threat-models, architecture-patterns, papers, products, glossary, regulations, agent-identity}.md`.
- Papers digested: TrustGen, SoSBench, RedCodeAgent, ARMs, Any-Depth Alignment, BlueCodeAgent, DreamGym, DevOps-Gym, MASTRIKE.
- 13 architecture patterns (P1–P13) for a Guardian-Agent / autonomy-trace / credential-broker product.
- `agent-identity.md` = the 1Password thesis (Zero Standing Privilege, JEP+JIT, attestation, federated/secretless, intent-based access, attenuated delegation, the 1Password Credential Broker / Apono) + a **Passport applicability matrix** (have-vs-gaps). To extend: drop PDFs in the folder, ask to "ingest".

## Workstream 2 — Dawn Song pitch deck (deliverables)

In `~/Documents/Origin-Pitch/`: `Dawn-Song-Prep.pdf` (1-page conversation cheat-sheet), `Origin-Passport.pptx` (2-slide editable deck), `Origin-Passport-deck-preview.png`. Built from the skill + the unifying framing **"Origin licenses physical autonomy; Passport licenses digital autonomy."**

## Workstream 3 — Origin landing redesign (repo B `src/factorydad/`)

Commits `a6c7f02` + `2ad24ec`. Reframed around "capability is not permission" across physical (robot/floor: finish/escalate/refuse + RSL + deterministic oracle) and digital (Passport) autonomy.
- Nav: **"Agent Identity"** link + **"Try Passport →"** primary CTA → `/passport`.
- Hero subhead now covers robot *and* software-agent autonomy.
- `PassportLayer.tsx` rebuilt into the Agent-Identity showcase: a Passport identity card (green GRANTED / amber APPROVAL / red struck-through DENIED chips) + the grant→execute→approve→deny→audit&revoke story + an always-on `/passport` CTA. Removed the old localhost-only "private preview" gating.
- All existing proof sections preserved (RSL, oracle, cases, scorecards, cost).

## Workstream 4 — Passport live at `/passport`, owner-gated (repo B `src/passport/`, `passport.html`)

- Ported repo A's self-contained `src/passport/` in; new Vite entry `passport.html` → `/passport`; `main.tsx` wraps `<App/>` in `<AuthProvider>`.
- **Owner gating** (`src/passport/ui/App.tsx`): `const isOwner = user?.email === 'bohueilin@gmail.com'`. Only the owner may trigger runs/approvals/revoke; everyone else is **view-only** (read-only banner, disabled controls). Six `if (!isOwner) return` trigger guards. **NOTE: this is client-side UX gating, not a security boundary** (the demo has no real side effects except the owner-authed Snaplii call, which the function re-checks server-side).
- **Payment removed from the public scenarios** initially (no budget/wallet/Snaplii in Fill My Night / Enrich My Life / Airport Pickup); `payment.spend` kept in `GLOBAL_FORBIDDEN` as the headline DENIED chip. (The agent-driven Snaplii buy was re-introduced later as a separate, broker-mediated capability — see Workstream 7.)
- **Bug fixed (also latent in repo A):** `PassportSession.start()` awaited the secret-broker resolution *before* assigning `this.grant`, so the UI's eager `getState()` hit an undefined grant. Reordered so the grant is assigned in the synchronous prefix.

## Workstream 5 — Intent monitor / delegation / ledger / injection (repo B, commit `6480a9e`)

New engine modules + 3 instrument-grade visualizations + 1 scenario:
- **Intent-conformance monitor** — `engine/intentMonitor.ts` + `ui/components/IntentConformanceMonitor.tsx`. Judges every action vs the grant's declared-intent envelope; a `GLOBAL_FORBIDDEN` cap or out-of-envelope commit returns severity `block`, **refuses the action before the ToolRouter runs**, and flips the run to sticky `state: 'contained'`. Snapshot field `conformance`.
- **Attenuated delegation** — `engine/delegation.ts` + `DelegationChain.tsx`. you → orchestrator → workers, each child a **genuine strict subset** (caps ⊆ parent, TTL ≤ parent), attribution to the human at every hop. Injection-pulled workers resolve to **zero authority**. Snapshot field `delegation`.
- **Access ledger** — `engine/accessLedger.ts` + `AccessLedger.tsx`. Live leases (`grant_…` + brokered `pph_…`), TTL countdown, **revoke-all kill switch** (flips all to `revoked`). Snapshot field `ledger`.
- **"Guard the Inbox"** scenario — `scenarios/promptInjection.ts` (id `guard-the-inbox`). Benign "triage + draft" intent; a poisoned message tries to escalate to `payment.spend` + exfiltrate contacts; the intent monitor + capability firewall **contain both**; benign task completes. "Two independent defenses agreed."
- **Bug fixed:** `IntentConformanceMonitor` computed `breachIndex` via `useMemo([checks])`, but the engine mutates the same `conformanceChecks` array in place (stable reference) so it never recomputed → stuck on "resolving divergence…". Now computed directly each render.
- 211/211 tests pass.

## Workstream 6 — Login returns to `/passport` (repo B, commit `4ce039d`)

Was: sign-in from `/passport` bounced to `/app`. Now: `ReadOnlyBanner` links to `/auth?next=/passport`; `AuthPage` derives the Google `redirectTo` from `?next`; `signInWithGoogle(opts?)` honors it; the OAuth-return handler preserves the landing pathname (not hardcoded `/app`). InsForge `allowed_redirect_urls` (in `insforge.toml`, applied via `npx @insforge/cli config apply`) now whitelists `/app` **and** `/passport` for localhost:5275, localhost:5283, the prod origin, and the `passport-preview` alias.

## Workstream 7 — Real Snaplii payment (repo B, commits `7de06a6` + `3b7e252`)

Decision: **simulation by default, flip to real for the on-stage charge.**
- **`functions/snaplii-broker.ts`** — Deno port of repo A's hardened `server/snapliiHandler.ts`. One edge function, 4 actions: `connect | quote | authorize | purchase`. Safety rails preserved: **key server-side only**, HMAC-signed quote/authz tokens (domain-separated), in-process + durable one-shot nonce (`passport_purchase_nonces` table), per-buy + session caps (fail-closed), mode-bound token (sim vs live), `Idempotency-Key` on real purchase, ambiguous 5xx/timeout **fail closed**. **Owner-auth required** (`createClient(token).auth.getCurrentUser()` → 401 if absent). Buys a DoorDash gift card via Snaplii Cash.
- **InsForge secrets** set (values hidden, sim-safe): `SNAPLII_API_KEY` (valid `snp_sk_…`, auth tested 200), `SNAPLII_BASE_URL=https://aipayment.snaplii.com`, `SNAPLII_PER_BUY_CAP_USD=25`, `SNAPLII_DAILY_CAP_USD=50`, `SNAPLII_LIVE=0` (simulation), `EPISODE_SIGNING_SECRET` (fresh 32-byte). **To go live: `npx @insforge/cli secrets update SNAPLII_LIVE --value 1`** (raise caps if the demo amount > $25).
- **Migration applied:** `passport_purchase_nonces` table + unique index on `nonce` (durable one-shot guard).
- **Account Settings → Wallets** (`src/auth/AccountSettings.tsx` `WalletsTab`, `src/credentials/store.ts`): a Snaplii card — Connect (brand + SIM/LIVE pill + caps), then a test-purchase flow `quote → human "Approve & buy" → purchase` with a sim/real receipt + masked code + fail-closed error copy.
- **Agent-driven purchase in `/passport`** (commit `3b7e252`): new capability **`snaplii.purchase`** (scoped, capped, one-shot, approval-gated — NOT forbidden; `payment.spend` stays forbidden). New scenario **`treat-the-team`** ("Treat the Team"): the agent prepares a $15 DoorDash gift card; `ui/components/SnapliiPurchase.tsx` runs the real broker on the owner's approval. `PhoneApproval` skips the `snaplii.purchase` packet so it's only approvable through the broker surface (which actually charges).

## Workstream 8 — Production CORS bug (FOUND + FIXED for Snaplii; KNOWN ISSUE for the rest)

**Verified from the production origin:** the InsForge SDK's `insforge.functions.invoke(<fn>)` routes to a `https://<proj>.functions.insforge.app/<fn>` subdomain whose **CORS rejects the app origin → every edge function fails** (confirmed for `credential-broker` AND `snaplii-broker`). The **project base host** serves the same function at `https://<proj>.us-east.insforge.app/functions/<fn>` with **correct CORS** (returns 401 unauth, no CORS block — verified from both localhost and prod).
- **Fixed for Snaplii** (`src/credentials/store.ts` `invokeSnaplii`): calls `${VITE_INSFORGE_URL}/functions/snaplii-broker` directly with the owner's access token from `localStorage` (`insforge_access_token` / `insforge-token`) + the anon key as `apikey`.
- **KNOWN ISSUE / NOT YET FIXED:** every *other* `functions.invoke` call still uses the broken path — `credential-broker`, `agent-token-mint`, `account-delete`, `wallet-link-*` (the existing Account Settings agent-permissions, crypto wallet, Test button). These are **broken in production** and must be migrated to the same direct-path pattern, especially before Item 2 (which lives in the same Account Settings).

---

## Deployed state (as of this writing)

- **Live:** `https://origin-physical-ai.pages.dev` (landing redesign), `/passport` (owner-gated demo with all 5 scenarios incl. Guard the Inbox + Treat the Team), Account Settings → Wallets (Snaplii).
- **Repo B branch `hud-factorydad-1`** HEAD `3b7e252` (3 commits ahead of `origin` — **NOT pushed to GitHub**; deploys went straight to Cloudflare Pages).
- **InsForge functions active:** `snaplii-broker` (new), credential-broker, agent-token-mint, wallet-link-challenge/verify, account-delete, expiry-sweeper.
- **Owner-login flow:** sign in at `/auth` (or `/auth?next=/passport`) with `bohueilin@gmail.com` → recognized as owner on `/passport`.

## Known issues / PENDING / not-yet-verified

1. **Item 2 (1Password granular grants) — PENDING the `OP_SERVICE_ACCOUNT_TOKEN` (`ops_…`) + vault name.** No `OP_*` token is set. Plan: an InsForge function to list the vault's ~30 credentials + a fleet→robot→credential grant matrix in Account Settings (6 fleets × 6 robots).
2. **The broad CORS fix** (migrate all `functions.invoke` → direct base-host `/functions/` path). High priority; the existing Account Settings features are CORS-broken in prod.
3. **Authenticated Snaplii flow not yet end-to-end verified** — the key auths (200), the function is healthy + gated (clean 401), the CORS path is fixed, but `connect→quote→authorize→purchase` with a real owner token has only been validated up to the auth boundary (couldn't log in via automation). The owner should verify a sim purchase.
4. **`snaplii-broker` bare-Deno-URL hardening** — the gated SDK/base-host path enforces owner-auth (401); the raw `…function2.insforge.app` deploy URL returned 200 on an unauth `connect` (read-only/no-money). Add an explicit in-function token check for defense-in-depth.
5. **Owner gating is client-side** (UX), not a security boundary; only the Snaplii function enforces server-side auth. Fine for a demo with no other real side effects, but note it.
6. **Local dev can't call the functions** (InsForge gateway CORS allows the prod origin, not localhost) — the Snaplii UI shows "Broker unreachable" locally; it works on the live site. Test on prod (logged in).

## Key files

- Snaplii broker: `repo B/functions/snaplii-broker.ts`; client `repo B/src/credentials/store.ts` (`invokeSnaplii`, `snaplii*`); UI `repo B/src/auth/AccountSettings.tsx` (WalletsTab) + `repo B/src/passport/ui/components/SnapliiPurchase.tsx`.
- Passport engine: `repo B/src/passport/engine/{session,intentMonitor,delegation,accessLedger,toolRouter,...}.ts`; scenarios `repo B/src/passport/scenarios/{promptInjection,orderDinner,...}.ts`; capabilities `repo B/src/passport/capabilities.ts`.
- Auth: `repo B/src/auth/{AuthProvider,AuthPage}.tsx`, `repo B/src/insforge.ts`, `repo B/insforge.toml`.
- Original Node broker (reference): `repo A/server/snapliiHandler.ts`, `repo A/server/config.ts`, `repo A/server/nonceStore.ts`.
- Skill: `repo A/.claude/skills/guardian-agent-foundations/`.
