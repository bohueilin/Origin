# Claude Handoff — Origin Security Hardening (back to Codex)

**Iteration:** 1 (Claude Code implementation pass on Codex's 6-item review)
**Mode:** LOCAL ONLY — nothing pushed, nothing deployed, no InsForge secret set/rotated, Snaplii still **SIMULATION** (`SNAPLII_LIVE=0`).
**Repo:** `/Users/bohueilin/hackathons/0620-test/physical-ai-demo-test`

## Gates (all required ones green)
- `npx tsc -p tsconfig.app.json --noEmit` → **clean (exit 0)**
- `npm test -- --run` → **211 passed / 26 files**
- `npm run build` → **clean** (only the pre-existing >500 kB chunk advisory)
- `npm run lint` → **4 errors remain, all PRE-EXISTING** (from the prior UI-feature iteration's strict react-hooks lints, NOT this work — see Remaining Risks). The 1 lint error introduced by this work (`store.ts` caught-error `cause`) was fixed.

---

## What changed, by item

### Item 1 — Snaplii server-side owner allowlist (P0) ✅
- `functions/snaplii-broker.ts`: added `ownerAllowlist()` + `isOwner()` helpers and a check right after `getCurrentUser()` (covers ALL four actions incl. `connect`). Env: **`ORIGIN_OWNER_USER_IDS`** + **`ORIGIN_OWNER_EMAILS`** (comma-lists). **FAIL CLOSED: unset ⇒ `configured===false` ⇒ deny everyone.** Returns **403** (distinct from the existing 401-unauth) so the UI can say "signed in, not owner."
- `src/credentials/store.ts`: `invokeFn` now maps **403 → "This account is not the Origin owner…"** (and keeps 401 → "Sign in as the owner…").

### Item 2 — Bind quote/authorize/purchase to a server-minted Passport run claim ✅
- **NEW `functions/snaplii-run-claim.ts`** — the ONLY place a run claim is minted (browser cannot forge it; HMAC with `EPISODE_SIGNING_SECRET`, server-only). Auth = same owner allowlist (401/403 fail-closed). Body `{amount, intent}`; validates amount ≤ per-buy cap; mints `RunClaim{owner=userId, amount, intent, rc=uuid, exp=+5min}` (label `snaplii.run.v1`).
- `functions/snaplii-broker.ts` `quoteOrder()` now takes `userId` and **REQUIRES `body.run_claim`**: rejects (`code:'no_run'`) if missing/invalid, `rc.owner !== userId`, `|rc.amount-amount|>0.001`, or `rc.intent !== intent`. So a direct out-of-band `curl quote` (even with an owner token) is refused — it has no valid run claim.
- `src/credentials/store.ts`: added `snapliiRunClaim(amount,intent)`; `snapliiQuote(amount,intent,runClaim)` now requires the claim.
- `src/passport/ui/components/SnapliiPurchase.tsx` + `src/auth/AccountSettings.tsx` (WalletsTab `runQuote`): both buy flows mint the run claim first, then quote→authorize→purchase.

### Item 3 — Project-wide InsForge function CORS ✅
- `src/insforge.ts`: `createClient({ …, functionsUrl: \`${VITE_INSFORGE_URL}/functions\` })`. The SDK (`@insforge/sdk@1.4.2`) routes `functions.invoke` to that base-host path (CORS-correct) instead of the broken `…functions.insforge.app` subdomain. This fixes **all 5 SDK call sites with zero edits**: `credential-broker`, `agent-token-mint`, `account-delete`, `wallet-link-challenge`, `wallet-link-verify`.
- **Decision:** the Snaplii client stays on an **explicit base-host `fetch`** (`invokeFn` in `store.ts`) — deliberately, to read the HTTP status for precise money-path fail-closed messaging (401 vs 403 vs business codes). It hits the same CORS-correct base host.

### Item 4 — `passport_purchase_nonces` migration checked in ✅
- Copied `migrations/20260627000000_create-passport-purchase-nonces.sql` from the reference repo into repo B (source parity). **No backend re-apply needed** — both repos share InsForge project `8ccc649d-…` and the table+unique-index are already live (idempotent `CREATE … IF NOT EXISTS`).

### Item 5 — Runtime worker-level delegation attenuation ✅
- `src/passport/engine/toolRouter.ts`: `route()` gained an optional `actor?: {agentId; permits}`; a new gate (1b) runs after liveness and before the grant authz — if `actor && !actor.permits(cap)` it **denies fail-closed** and emits a `delegation.exceeded` audit event (with `detail.agent`).
- `src/passport/engine/session.ts`: `actorFor(agentId)` binds `Delegation.permits(this.delegationTree, agentId, cap)`; passed at both `route()` call sites (`runTool`/`runCommit`).
- `delegation.ts` unchanged (`permits()` already correct). Verified: all 5 scenarios drive clean with **0 false-denies**; positive test proves an out-of-subset/missing actor is denied. The tree is `needs ∩ parentSet` built from the same `workerForTool` mapping → a worker can never be denied a step it legitimately owns.

### Item 6 — 1Password Lease / `op://` server-side reconcile ✅
- **NEW `functions/_onePasswordBroker.ts`** — Deno port of repo A's `server/onePasswordBroker.ts`: `Lease`/`LeaseView`, async `leaseScopedSecret` (`pph_…` handle), `useLease` (JIT `client.secrets.resolve(op://…)` inside an action closure, redacted result only), `revokeLease`, `listLeases`, vault pinning, bounded delegation, TTL clamps, `isAvailable`. `node:crypto`→Web Crypto, `npm:@1password/sdk@^0.4.0`.
- `functions/credential-broker.ts`: `resolveOnePassword()` rewritten to **Service-Account + `op://`** (was Connect-REST metadata-only); allow path mints a real lease (handle + `LeaseView`); new `use`/`revoke`/`list` ops; **`assertNoSecret` backstop** added over every response.
- `src/credentials/onepasswordProvider.ts`: real provider (was a throwing scaffold), fail-closed when `OP_SERVICE_ACCOUNT_TOKEN` unset → mock fallback. `mockProvider.ts`/`broker.ts`/`types.ts` contract unchanged.
- **Secret never leaves the server:** `view()` strips `item_ref`+values; `useLease` returns only `{resolved:boolean}`; `resolveOnePassword` returns redacted metadata only; `assertNoSecret` is the final backstop.

### Logo
- Processed `Origin Logo.png` → `public/{origin-logo.png(256²), apple-touch-icon.png(180²), favicon.png(48²)}`.
- Swapped all **7 lockup marks** (console nav, landing nav+footer, hero pill, auth top + auth canvas, Passport top) from gradient/`OR`-initials to `<img src="/origin-logo.png">` (CSS kept width/height/border-radius, dropped bg/shadow/color/font, added `object-fit:cover`). Updated **4 HTML heads** (favicon → `/favicon.png`, added `apple-touch-icon`). Removed the now-unused `PRODUCT_INITIALS` imports. Decorative/other-brand marks (step numbers, dots, the red Snaplii `S`) left untouched. The PPTX deck (`~/Documents/Origin-Pitch/`) also now uses the logo.

---

## Security decisions (rationale for the reviewer)
1. **Owner allowlist fails closed when unset** (deny all), the opposite of the prior "any authed user passes." Deploying the new function **without setting `ORIGIN_OWNER_EMAILS`/`IDS` will lock out everyone, including the owner** — by design. Set the secret as part of any deploy.
2. **Run claim is HMAC + 5-min TTL + owner/amount/intent-bound, but NOT yet durably one-shot.** Forgery and amount-tampering are blocked; reusing one claim for multiple quotes within its TTL is not (low severity — owner is trusted; each purchase still has its own one-shot durable nonce). Durable rc-nonce = flagged follow-up.
3. **Snaplii client kept on explicit base-host `fetch`** (not `functions.invoke`) for HTTP-status precision on the money path. The other 5 functions use the now-CORS-correct SDK.
4. **1Password in-process `Map` ledger** is safe only within a single Deno invocation (issue→use→revoke in one call), matching repo A. Multi-call lifecycles across cold isolates need a durable `credential_leases` table — flagged follow-up, migration intentionally not created.

## Remaining risks / follow-ups
- **Secrets NOT set (required before any deploy):** `ORIGIN_OWNER_USER_IDS`/`ORIGIN_OWNER_EMAILS` (else the broker denies everyone), and `OP_SERVICE_ACCOUNT_TOKEN`+`OP_VAULT` (else 1Password stays mock-fallback). Functions NOT redeployed — the live `snaplii-broker`/`credential-broker` still run the OLD code until a deploy.
- **Durable ledgers (2):** run-claim one-shot nonce; 1Password `credential_leases` table. Both flagged in code comments.
- **Bare Deno function URL** (`…function2.insforge.app`) returns 200 on an unauth `connect` (the gated SDK/base-host path is 401/403). Consider an explicit in-function token+owner check that runs regardless of path.
- **4 pre-existing lint errors** (from the prior UI iteration's strict react-hooks rules, NOT this work): `promptInjection.ts:72` (`_ctx` unused), `AccessLedger.tsx:37` (setState-in-effect), `DelegationChain.tsx:88` (refs-during-render ×2). Components are verified-working; recommend a focused UI lint pass.
- **`SNAPLII_LIVE=0`** (simulation) — flip only at demo time.

## Files changed
NEW: `functions/snaplii-run-claim.ts`, `functions/_onePasswordBroker.ts`, `migrations/20260627000000_create-passport-purchase-nonces.sql`, `public/{origin-logo,apple-touch-icon,favicon}.png`.
EDIT: `functions/snaplii-broker.ts`, `functions/credential-broker.ts`, `src/insforge.ts`, `src/credentials/{store,onepasswordProvider}.ts`, `src/passport/engine/{toolRouter,session}.ts`, `src/passport/ui/components/SnapliiPurchase.tsx`, `src/auth/{AccountSettings,AuthPage}.tsx`, `src/auth/authPage.css`, `src/App.tsx`, `src/App.css`, `src/factorydad/{Dashboard.tsx,factorydad.css,components/Hero.tsx,components/SiteFooter.tsx}`, `src/passport/ui/App.tsx`, `src/passport/ui/passport.css`, `index.html`, `app.html`, `auth.html`, `passport.html`.

---

## Copy-paste prompt back to Codex (re-review)

```text
Codex — re-review Claude's implementation of your 6 security items (LOCAL ONLY, nothing
deployed; Snaplii still SIMULATION). Read CLAUDE_HANDOFF_ORIGIN_SECURITY.md (repo root) first,
then audit the diffs in /Users/bohueilin/hackathons/0620-test/physical-ai-demo-test:

1. Snaplii owner allowlist (functions/snaplii-broker.ts ownerAllowlist/isOwner + the 403 gate):
   confirm fail-closed-when-unset, that ALL four actions are gated, and store.ts maps 401/403.
2. Run-claim binding (functions/snaplii-run-claim.ts + quoteOrder's run_claim check): confirm a
   direct out-of-band quote is rejected, owner/amount/intent binding holds, and HMAC label
   domain-separation is correct. Is the missing durable one-shot rc-nonce an acceptable gap?
3. CORS (src/insforge.ts functionsUrl) — confirm all 5 SDK functions now route to the base host;
   sanity-check that keeping Snaplii on the explicit fetch is acceptable vs unifying.
4. Migration parity (migrations/20260627000000…).
5. Delegation gate (toolRouter.ts gate 1b + session.ts actorFor): confirm fail-closed, that
   permits() is the right primitive, no false-deny of legitimate worker steps, and the
   delegation.exceeded audit is correct.
6. 1Password reconcile (functions/_onePasswordBroker.ts + credential-broker.ts + onepasswordProvider.ts):
   confirm NO secret value can leave the server (view()/useLease/assertNoSecret boundaries),
   fail-closed mock fallback when OP_SERVICE_ACCOUNT_TOKEN unset, and assess the in-process Map
   ledger limitation + whether the durable credential_leases table is needed before any real use.

Also flag: (a) the deploy preconditions (ORIGIN_OWNER_* and OP_* secrets must be set or the
broker denies everyone / 1Password stays mock), (b) the bare Deno-URL unauth `connect`, and
(c) the 4 pre-existing UI lint errors. Gates currently: tsc clean, 211 tests pass, build clean,
lint = 4 pre-existing errors. Return a prioritized findings list and a go/no-go for setting the
owner-allowlist secret + a controlled deploy. Do NOT deploy or flip SNAPLII_LIVE.
```
