# Codex Inspection Brief — Origin × Passport (2026-06-27)

You are doing an **independent inspection + recommendations** pass on work just completed by another
agent. **Read `SESSION_SUMMARY_2026-06-27.md` (same folder) first** for the full context, then audit
the code and report findings + recommendations. This is **inspection/recommendation only — do not
change code** unless explicitly asked.

There is **real money** involved (a live Snaplii payment key) and a **live production site**
(`https://origin-physical-ai.pages.dev`). Bias toward security/correctness rigor.

## Repos
- **Repo B (LIVE, primary):** `/Users/bohueilin/hackathons/0620-test/physical-ai-demo-test` (branch `hud-factorydad-1`).
- **Repo A (reference):** `/Users/bohueilin/hackathons/0619/autonomy-trace-console` (original Passport + `server/snapliiHandler.ts` + the `guardian-agent-foundations` skill).

## Inspect these, in priority order

### 1. Snaplii real-payment broker — SECURITY (highest priority; real money)
- `repo B/functions/snaplii-broker.ts` (the deployed Deno edge function) vs its source of truth `repo A/server/snapliiHandler.ts`.
- Verify the port preserved EVERY safety rail: server-side-only key; HMAC domain separation (quote vs authz labels); one-shot nonce (in-process + durable `passport_purchase_nonces`); atomic reserve-then-settle (no TOCTOU); per-buy + session caps (fail-closed on bad/unset cap); mode-bound token (sim approval can't redeem live); `Idempotency-Key`; ambiguous 5xx/timeout **fail closed** (nonce/budget NOT released).
- Confirm owner-auth is enforced for all 4 actions (`connect/quote/authorize/purchase`); confirm the masked redemption code never leaks the full code; confirm `SNAPLII_LIVE`/`EPISODE_SIGNING_SECRET` gating refuses real spend under an insecure secret.
- **Flagged gap to confirm:** the raw `…function2.insforge.app` Deno deploy URL returned 200 on an unauth `connect` (the gated SDK/base-host path returns 401). Assess whether the in-function auth check should run regardless of path (defense-in-depth) and whether unauth `connect`/`quote` can be abused (rate/cost).
- Check the durable nonce ledger logic against double-charge / replay across instances.

### 2. The CORS fix + the un-migrated remainder (HIGH)
- `repo B/src/credentials/store.ts` `invokeSnaplii` now calls `${VITE_INSFORGE_URL}/functions/snaplii-broker` directly with `localStorage` token + anon `apikey`. Review: is reading the token from `localStorage` (`insforge_access_token`/`insforge-token`) the right/robust source vs an SDK accessor? Token-refresh edge cases? Any token-leak risk?
- **The bug is project-wide:** every other `insforge.functions.invoke(...)` call (`credential-broker`, `agent-token-mint`, `account-delete`, `wallet-link-*`) still routes to the CORS-failing `functions.insforge.app` subdomain and is **broken in production**. Recommend the cleanest shared fix (a single helper? an SDK config to set the function host? confirm whether a newer `@insforge/sdk` resolves functions to the base host). This blocks Item 2 (1Password grants live in the same Account Settings).

### 3. Owner gating (MEDIUM)
- `repo B/src/passport/ui/App.tsx` (`isOwner`, the six trigger guards), `Home.tsx`, `RunHeader/ApprovalCard/PhoneApproval/PassportCard/SnapliiPurchase` (`canRun`/`interactive`). Confirm no non-owner trigger path. Note explicitly that this is **client-side UX gating**, not a security boundary — assess whether that's acceptable given the only real side effect (the Snaplii function) is independently server-auth'd.

### 4. Passport engine correctness (MEDIUM)
- Intent monitor (`engine/intentMonitor.ts` + `IntentConformanceMonitor.tsx`): is the `severity:'block'` refusal truly **before** the ToolRouter executes? Is `conformance.state` sticky-correct? Any other `useMemo([snapshot-array])` stale-reference bugs like the one already fixed (the engine mutates `conformanceChecks`/others in place)?
- Attenuated delegation (`engine/delegation.ts`): is `child.caps ⊆ parent.caps` genuinely enforced, not just displayed? Does an injection-pulled worker truly get zero authority at the authz layer (not only in the viz)?
- Access ledger + revoke (`engine/accessLedger.ts`): does revoke flip ALL leases atomically; any way a lease outlives revoke?
- `payment.spend` stays in `GLOBAL_FORBIDDEN`; `snaplii.purchase` is approval-gated and only reachable through `SnapliiPurchase` (which charges the real broker) — confirm no path resolves the `snaplii.purchase` approval WITHOUT charging (e.g., a stray approve handler).

### 5. Auth/login + regressions (LOW)
- `src/auth/{AuthProvider,AuthPage}.tsx`: the `next`→`redirectTo` derivation (open-redirect safe?), the OAuth-return `replaceState(pathname)`. `insforge.toml` `allowed_redirect_urls`.
- Confirm the landing redesign (`src/factorydad/`) didn't drop any section; `npm run build` + `npx tsc --noEmit -p tsconfig.app.json` clean; `npm test` (expected 211 passing).

## Deliverable
A prioritized findings list — `{file:line, issue, severity, why-it-matters, recommended fix}` — plus
a short recommendation on (a) the safest path to flip Snaplii to LIVE for the demo, and (b) the
cleanest project-wide CORS fix. Adversarially verify each high/critical finding before reporting it.

## Quick verification commands (repo B)
```
cd /Users/bohueilin/hackathons/0620-test/physical-ai-demo-test
npx tsc --noEmit -p tsconfig.app.json     # expect clean
npm run build                              # expect clean
npm test                                   # expect 211 passing
npx @insforge/cli secrets list             # SNAPLII_* + EPISODE_SIGNING_SECRET present, SNAPLII_LIVE=0
npx @insforge/cli functions list           # snaplii-broker active
```
Do NOT print secret values. Test the live broker only via the prod origin while logged in as the owner.
