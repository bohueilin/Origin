# Credential Broker — Autonomy License

The security core for **"agents act on your behalf without ever holding your secrets."**
Built per the lead instruction: *the safe auth foundation first; for 1Password and
wallet access, build the broker abstraction + mock provider before any production
integration.*

## Core principle (non-negotiable)

> Agents must never directly receive raw passwords, seed phrases, private keys,
> long-lived credentials, or unrestricted wallet access. An agent may request a
> **scoped credential capability** through a controlled broker, with explicit user
> consent, least privilege, time limits, audit logs, and step-up approval for
> sensitive actions.

What an agent gets on success is an `AgentCapability` — a policy decision plus an
**opaque, task-scoped `sessionHandle`**. The handle cannot be exchanged for the
underlying secret; the real credential is used only server-side inside a provider.

## What's live now (architecture map)

| Layer | What it is | Where |
|---|---|---|
| **Delegation** | The agent holds an **opaque, grant-bound token** (`x-agent-token`) with *no* database access. The broker resolves it with the admin key and acts on the agent's behalf. A leaked token can only call the broker, for one grant, until it expires. | `functions/agent-token-mint.ts`, `agent_tokens` table |
| **Broker** | Deterministic 10-step fail-closed pipeline; CORS-scoped; 30 req/min/user rate limit; one redacted audit row per call. | `functions/credential-broker.ts` ↔ `broker.ts` (parity) |
| **Providers** | `mock` (handle only) · `onepassword` (real Connect REST, fail-closed until `OP_CONNECT_*` set; returns redacted metadata, never a value). | broker function |
| **Wallet ownership** | **SIWE / EIP-4361** proof: user signs a server nonce in their own wallet; we verify the signer offline (viem) and record `verified_at`. No key, ever. | `functions/wallet-link-challenge.ts`, `wallet-link-verify.ts`, `src/wallet/siwe.ts` |
| **Bounded autonomy** | **ERC-4337 session keys**: per-tx cap, rolling-window cap, address allowlist, asset+chain binding, expiry. Enforced pre-flight here; on-chain in production. A violating draft is refused before a human sees it. | `src/wallet/sessionPolicy.ts` (+14 tests), `wallet_session_keys` |
| **Rule of Two** | Enforces the lethal trifecta: a grant carrying all three of {private data, untrusted content, external comms} cannot act autonomously — the broker forces a human in the loop, independent of whether the model resists the injection. | `src/credentials/ruleOfTwo.ts` (+5 tests), broker step 8b |
| **Human gate** | Step-up approval queue (single-use) + wallet drafts to sign. Agents can `wallet_prepare`; `wallet_sign` is always human. | Approvals tab, `credential_approval_requests`, `wallet_action_requests` |
| **Containment** | Kill switch (revoke all grants/tokens/session-keys) · expiry sweeper (DB is source of truth) · append-only audit. | Danger zone, `functions/expiry-sweeper.ts` |
| **Owner UI** | Overview (posture) · Integrations · Agent permissions · Approvals · Wallets · Audit · Danger. | `src/auth/AccountSettings.tsx` |

## Files

| File | Role |
|---|---|
| `types.ts` | The type surface. `CredentialGrant` holds only *references* (`vaultRef`/`itemRef`), never a secret. |
| `redact.ts` | `redact()` (key-based) + `assertNoSecret()` (hard agent-boundary backstop, fail-closed). |
| `broker.ts` | `brokerCapability()` — the deterministic 10-step governance pipeline. Pure, framework-agnostic. |
| `mockProvider.ts` | Holds `MOCK_SECRET`, performs the action, returns only a handle. For tests/dev. |
| `onepasswordProvider.ts` | **Scaffold, fail-closed.** Throws "not configured"/"not implemented" → broker denies. |
| `broker.test.ts` | 21 security tests: every enforcement, no-secret-leak, audit-on-every-call. |

## The governance pipeline (broker.ts)

Every agent request runs through these gates, in order, **fail-closed** (any failure
denies; an unmatched condition never falls through to "allow"):

1. **Grant exists** — unknown grant → deny.
2. **Agent/run authorization** — the grant is bound to `agentId` (+ optional `runId`); a different agent → deny.
3. **Active / not revoked** — `status === 'active'` and no `revokedAt`.
4. **Not expired** — `now < expiresAt`.
5. **Scope match** — the requested scope must equal the grant's scope exactly.
6. **Usage limit** — `usageLimit > 0` && `usageCount >= usageLimit` → deny.
7. **Domain binding** — normalized `targetDomain` must match (strips scheme/`www`/path); mismatch → deny.
8. **Wallet signing is human-only** — `wallet_sign` *always* returns `approval_required`; the broker never auto-resolves it, even with `context.approved`. Agents may only `wallet_prepare` a draft.
9. **Step-up approval** — required when the grant policy is `approval_required`, or for a high-risk scope (`website_login`, `wallet_prepare`) **on first use**, unless `context.approved` is already true.
10. **Provider resolve + secret strip** — the provider performs the action and returns only a handle; `assertNoSecret()` then verifies no known secret value appears in the agent-facing result. Provider error → deny (fail-closed).

**Every call emits exactly one redacted `AuditEvent`** (allowed / denied / approval_required) — including denials and provider errors.

## Data model (InsForge / Postgres, per-user RLS)

Created via the InsForge CLI. All tables carry `user_id uuid default auth.uid()
references auth.users(id) on delete cascade` with per-user RLS (`auth.uid() = user_id`).

| Table | Purpose | Notes |
|---|---|---|
| `integration_connections` | A user↔provider link (e.g. their 1Password account). | Holds connection metadata + references, **no secrets**. |
| `credential_grants` | A scoped, time-limited, revocable grant to an agent. | Mirrors `CredentialGrant`: `scope`, `approval_policy`, `expires_at`, `usage_limit/count`, `status`. References only. |
| `audit_events` | **Append-only** governance log. | Only `SELECT` + `INSERT` policies — **no UPDATE/DELETE**. Redacted metadata only. |
| `wallet_connections` | A linked wallet (address + chain). | No seed phrase, no private key — ever. |
| `wallet_action_requests` | A prepared transaction draft awaiting human signature. | The agent prepares; a human signs out-of-band. |

## Security design summary

- **Least privilege:** a grant is one provider + one service + one domain + one scope.
- **Time-bound + revocable:** `expiresAt` + `status='revoked'` (`revokedAt`); both checked every call.
- **Bounded use:** optional `usageLimit`.
- **Domain binding, fail-closed:** the agent's acting domain must match the grant; normalization prevents `www`/scheme/path bypass but not cross-domain use.
- **Step-up approval:** sensitive scopes need an explicit human approval the agent cannot self-grant (`context.approved` is set only by the server after the user approves).
- **Wallet safety:** signing is structurally impossible to automate here — `wallet_sign` is always `approval_required`.
- **No secret egress:** providers return handles, not secrets; `assertNoSecret()` is a final backstop that throws (and the broker denies) if a known secret would reach the agent.
- **Append-only audit:** the audit table cannot be updated or deleted via RLS; every decision is logged with redacted metadata.
- **Fail-closed providers:** an unconfigured/unimplemented provider throws → the broker denies rather than proceeding.

## Environment variables

The broker library itself needs **no new env vars** (it's pure + provider-injected).
Existing auth env (from the account foundation) still applies:

| Var | Where | Secret? | Purpose |
|---|---|---|---|
| `VITE_INSFORGE_URL` | `.env.local` (build-time, public) | No | InsForge app host. |
| `VITE_INSFORGE_ANON_KEY` | `.env.local` (build-time, public) | No | InsForge anon key (RLS-guarded). |
| `INSFORGE_API_KEY` | `.env.local` (server/CLI only) | **Yes** | Admin key — never in client code or the bundle. |

The future production 1Password provider will require **server-side only** config
(e.g. a Connect host + a service-account token reference held in a secret manager).
These are intentionally **not** `VITE_*` and must never reach the browser.

## Manual QA checklist

- [ ] A valid low-risk grant returns `allowed` with a `sessionHandle` and **no secret** in the payload.
- [ ] A wrong `agentId` / wrong `runId` → `denied`.
- [ ] Revoked / expired grant → `denied`.
- [ ] Scope mismatch / domain mismatch → `denied`.
- [ ] Usage limit reached → `denied`.
- [ ] `approval_required` policy → `approval_required`, then `allowed` after approval.
- [ ] High-risk scope first use → `approval_required`; subsequent use → `allowed`.
- [ ] `wallet_sign` → `approval_required` even when `context.approved` is true.
- [ ] Unconfigured 1Password provider → broker `denied` (fail-closed), not a thrown error.
- [ ] Every path emits exactly one audit event; no secret appears in any event.
- [ ] `npm run build` + `npm run lint` + `npx vitest run` all green.

## Owner UI (built)

`src/auth/AccountSettings.tsx` (+ `accountSettings.css`), opened from the account
menu when signed in. Tabs: **Integrations · Agent permissions · Approvals · Wallets ·
Audit log · Danger zone**. Backed by `src/credentials/store.ts` (InsForge, RLS-scoped to
the signed-in user). This is the account owner managing their own grants — the browser
never resolves a secret. The store writes only references + redacted audit metadata; the
wallet table has no column for a seed phrase or private key, so a secret cannot be
persisted even by mistake.

- **Agent permissions** — create/revoke grants; **Test** invokes the live broker
  function as an agent would (allowed → usage bumps; step-up scope → lands in Approvals).
- **Approvals** — pending step-up requests + wallet transactions awaiting signature.
  Each approval is single-use: the broker consumes it once, so it is never a standing
  permission.
- **Wallets** — connect by public address only; **Prepare draft** simulates an agent
  preparing a transfer (the agent can never sign — a human approves, then signs
  out-of-band).
- **Danger zone** — "Delete data" invokes the `account-delete` function (real purge).

## Server surface (deployed InsForge edge functions)

`functions/credential-broker.ts` and `functions/account-delete.ts` (Deno Subhosting),
deployed via `npx @insforge/cli functions deploy <slug> --file <path>`.

- **`credential-broker`** — the agent-runtime enforcement point. Ports the `broker.ts`
  pipeline verbatim (one inlined file, since Deno deploy ships a single module). Runs
  under the caller's access token so RLS scopes every read/write. On `approval_required`
  it creates a `credential_approval_requests` row; on `allowed` it bumps `usage_count`,
  consumes a one-shot approval, and returns a capability (handle only). Verified
  fail-closed: an unauthenticated call returns `{decision:'denied', reason:'unauthorized'}`
  (HTTP 401).
- **`account-delete`** — purges the caller's grants/integrations/wallets/requests (RLS +
  explicit `user_id`), retains the append-only audit log as the deletion record, and
  reports `authUserRemoved:false` (login removal needs the admin API — see limitations).

**Auth model (MVP):** the agent acts within a delegated user session and presents the
user's access token. **Production must mint a *restricted* agent token** (not the full
user JWT) so the agent cannot bypass the function and hit the DB directly. The function
is the enforcement point; this delegation hardening is the key follow-up.

## 1Password provider — activation (real, fail-closed)

The production provider lives **server-side** in `functions/credential-broker.ts`
(`resolveOnePassword`). It resolves a grant's item by reference via the 1Password
Connect REST API and returns only redacted metadata (item title, category, field
**labels** — never values). The secret never leaves 1Password and never reaches the
agent. Without config it throws → onepassword grants are denied fail-closed.

To activate:
1. Stand up a **1Password Connect** server (or use a service-account gateway) and mint a
   Connect/service-account token scoped to the vault you'll broker.
2. Set two server secrets (never `VITE_*`):
   ```
   npx @insforge/cli secrets add OP_CONNECT_HOST  https://<your-connect-host>
   npx @insforge/cli secrets add OP_CONNECT_TOKEN <connect-or-sa-token>
   ```
3. Create a grant with `provider='onepassword'` and set its `vault_ref` + `item_ref` to
   the Connect vault id + item id. The broker then verifies the item and issues a
   handle; the field values are never fetched.

## Google OAuth — enablement (your dashboard action)

Sign-in code is wired (`signInWithGoogle`); the provider just needs turning on:
1. In Google Cloud, create an OAuth 2.0 client; authorized redirect URIs already match
   `insforge.toml.allowed_redirect_urls` (localhost:5275 + origin-physical-ai.pages.dev,
   each with `/app`).
2. In the InsForge dashboard → Auth → Providers → Google, paste the client id + secret
   and enable. (This is a console action; it can't be done from code.)

## Known limitations (MVP)

- **1Password provider needs your tenant.** The Connect integration above is real but
  inert until `OP_CONNECT_HOST` + `OP_CONNECT_TOKEN` are set; verify against your vault.
  Linking an integration in the UI still stores only a label + `linked_pending_server`.
- **Delegation hardening pending.** The broker function currently accepts the user's
  access token; production must issue a restricted agent token (above).
- **Auth-user removal needs admin.** `account-delete` purges credential data under RLS
  but cannot delete the `auth.users` row from a user token; that step needs the admin
  API or the dashboard (`authUserRemoved:false` signals this).
- **Wallet signing stays out-of-band.** Approving a prepared transaction marks it ready;
  the actual signature happens in the user's own wallet (no key custody here, by design).
- **Google OAuth provider** must still be enabled in the InsForge dashboard (a Google
  Cloud OAuth client + the already-set redirect URLs). This is a console action, not code.

## Env / secrets

- App (build-time, public): `VITE_INSFORGE_URL`, `VITE_INSFORGE_ANON_KEY`.
- Functions (runtime, auto-injected reserved secrets): `INSFORGE_BASE_URL`, `ANON_KEY`.
- Production 1Password (future, server-side only, never `VITE_*`): a Connect host +
  a service-account token reference held in a secret manager.

## Status

Done: broker core + tests · owner UI (Overview/Integrations/Permissions/Approvals/
Wallets/Audit/Danger) · agent-runtime broker function (deployed, fail-closed verified) ·
**restricted agent-token delegation** (opaque grant-bound token, no DB access — verified) ·
step-up approval flow · wallet prepare→approve flow · **SIWE wallet ownership proof** ·
**ERC-4337 session-key policy engine** (+14 tests) · 1Password Connect provider
(fail-closed) · CORS scoping · rate limiting · kill switch · expiry sweeper · account-data
deletion.

Follow-ups (need infra/keys or are owner actions):
- Schedule the expiry sweeper: `npx @insforge/cli schedules create --name credential-expiry-sweep --cron "*/15 * * * *" --url <oss_host>/functions/expiry-sweeper --method POST`
- Activate 1Password (`OP_CONNECT_HOST` + `OP_CONNECT_TOKEN`) and Google OAuth (dashboard).
- On-chain ERC-4337 session-key issuance + UserOperation/bundler/paymaster (testnet).
- Contract-wallet (EIP-1271) SIWE verification (needs an RPC client).
- Admin auth-user removal; Profile/Security tabs + session management.
