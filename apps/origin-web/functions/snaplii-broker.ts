// Snaplii real-payment broker — InsForge edge function (Deno Subhosting).
//
// PORTED FAITHFULLY from repo A's Node/Hono server (server/snapliiHandler.ts +
// server/config.ts + server/nonceStore.ts). Same thesis: Snaplii alone allows
// within-cap auto-spend; Passport overrides that to require a per-action, one-shot,
// amount-bound, HMAC-signed HUMAN approval. The SNAPLII_API_KEY (snp_sk_live_…) lives
// server-side here and is NEVER sent to the browser. The agent never holds the key —
// the human approving in the UI calls this function with their own InsForge user token.
//
// One self-contained Deno file dispatching on an `action` field:
//   connect    → verify the key works; report scope + DoorDash brand (read-only)
//   quote      → real price preview + a signed, NON-spendable quote claim (no money authority)
//   authorize  → the human-approval step: verifies the quote, ATOMICALLY reserves the spend
//                against the caps, and mints a one-shot, mode-bound purchase token
//   purchase   → settles the reserved spend; one-shot; ambiguous outcomes FAIL CLOSED
//
// Safety rails preserved EXACTLY:
//   • SNAPLII_API_KEY server-side only — never returned, never logged.
//   • Domain-separated, HMAC-signed quote/authz tokens (the label is part of the signed body).
//   • One-shot nonce — in-process Set fast path + DURABLE InsForge ledger (passport_purchase_nonces).
//   • Per-buy + session caps; a malformed/unset cap FAILS CLOSED (0 = deny).
//   • Synchronous reserve-then-settle (no await between check + reserve → no TOCTOU).
//   • Mode-bound token: an approval minted in sim can't redeem in live, and vice-versa.
//   • Idempotency-Key on the real purchase so a retry can't double-charge.
//   • AMBIGUOUS outcomes (5xx / timeout) FAIL CLOSED — do NOT release the nonce/budget.
//   • Real money ONLY when SNAPLII_LIVE=1 AND a non-dev EPISODE_SIGNING_SECRET is set.
//   • AUTH: every action requires an authenticated OWNER (a normal InsForge user token).
//
// Body: { action: 'connect' | 'quote' | 'authorize' | 'purchase', ...actionFields }

import { createClient, createAdminClient } from 'npm:@insforge/sdk'
import crypto from 'node:crypto'
// Buffer is a Node global; under Deno it must be imported explicitly via the node: specifier.
// (b64url / verifyToken below use Buffer for base64url encode/decode.)
import { Buffer } from 'node:buffer'

// ----------------------------------------------------------------------------
// Config (ported from server/config.ts — the SnapliiConfig slice).
// ----------------------------------------------------------------------------
const DEFAULT_TIMEOUT = 15000
const TOKEN_TTL_MS = 10 * 60 * 1000
const NONCE_TABLE = 'passport_purchase_nonces'
const DEV_EPISODE_SECRET = 'dev-insecure-episode-secret-change-me'

interface SnapliiConfig {
  apiKey?: string
  baseUrl: string
  perBuyCapUsd: number
  dailyCapUsd: number
  live: boolean
}

// Caps are a real-money safety ceiling — a malformed value must FAIL CLOSED (0 = deny),
// never silently become NaN (which would disable the cap) or absurdly large.
function cap(raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? fallback)
  return Number.isFinite(n) && n > 0 && n <= 100000 ? n : 0
}

function loadSnapliiConfig(): SnapliiConfig {
  return {
    apiKey: Deno.env.get('SNAPLII_API_KEY') || undefined,
    baseUrl: (Deno.env.get('SNAPLII_BASE_URL') ?? 'https://aipayment.snaplii.com').replace(/\/+$/, ''),
    perBuyCapUsd: cap(Deno.env.get('SNAPLII_PER_BUY_CAP_USD'), 25),
    dailyCapUsd: cap(Deno.env.get('SNAPLII_DAILY_CAP_USD'), 100),
    live: Deno.env.get('SNAPLII_LIVE') === '1',
  }
}

/** The HMAC signing secret + whether it's the insecure dev placeholder (real money refused). */
function loadSigningSecret(): { secret: string; secretIsDev: boolean } {
  const raw = Deno.env.get('EPISODE_SIGNING_SECRET') ?? ''
  if (!raw) return { secret: DEV_EPISODE_SECRET, secretIsDev: true }
  if (raw === DEV_EPISODE_SECRET) return { secret: raw, secretIsDev: true }
  return { secret: raw, secretIsDev: false }
}

// ----------------------------------------------------------------------------
// CORS (mirrors credential-broker.ts).
// ----------------------------------------------------------------------------
const ALLOWED_ORIGINS = [
  'http://localhost:5275',
  'http://localhost:5283',
  'https://origin-physical-ai.pages.dev',
  'https://passport-preview.origin-physical-ai.pages.dev',
]
function corsFor(origin: string): Record<string, string> {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[2]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  }
}

// ----------------------------------------------------------------------------
// Session-scoped, in-process state. A Subhosting instance is reused across requests
// within its lifetime, so these mirror the Node server's in-process guards:
//   • consumedNonces — zero-latency same-instance one-shot guard (fast path)
//   • reservedUsd    — soft secondary session ceiling enforced atomically at authorize
// The DURABLE source of truth for one-shot is the InsForge unique index on `nonce`.
// ----------------------------------------------------------------------------
const consumedNonces = new Set<string>()
let reservedUsd = 0

// ---- Snaplii session token cache (the JWT minted from the snp_sk_live_ key) ----
let cachedJwt: { token: string; exp: number } | null = null
let cachedDoorDashBrand: { id: string; name: string } | null = null

function timedFetch(url: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

async function snapliiToken(cfg: SnapliiConfig): Promise<string | null> {
  if (!cfg.apiKey) return null
  if (cachedJwt && cachedJwt.exp > Date.now() + 30000) return cachedJwt.token
  try {
    const resp = await timedFetch(`${cfg.baseUrl}/v2/auth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent_id: 'passport-origin', api_key: cfg.apiKey }),
    })
    if (!resp.ok) {
      console.error(`[snaplii] auth ${resp.status}`)
      return null
    }
    const data = (await resp.json()) as { token?: string; access_token?: string; jwt?: string }
    const token = data.token ?? data.access_token ?? data.jwt
    if (!token) return null
    cachedJwt = { token, exp: Date.now() + 50 * 60 * 1000 }
    return token
  } catch (err) {
    console.error('[snaplii] auth failed:', (err as Error)?.name ?? 'error')
    return null
  }
}

// ---- HMAC tokens with domain separation (the label is part of the signed body) ----
const QUOTE_LABEL = 'snaplii.quote.v1'
const AUTHZ_LABEL = 'snaplii.authz.v1'
// A server-minted Passport "run claim" (minted only by functions/snaplii-run-claim.ts, which
// holds the same EPISODE_SIGNING_SECRET). `quote` requires one, so a direct/out-of-band broker
// call (curl quote→authorize→purchase) without a real Passport-initiated run is rejected.
const RUN_LABEL = 'snaplii.run.v1'

function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url')
}
function sign(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url')
}
function mintToken(secret: string, label: string, claim: object): string {
  const body = `${label}.${b64url(JSON.stringify(claim))}`
  return `${body}.${sign(secret, body)}`
}
function verifyToken<T>(secret: string, label: string, token: string): (T & { exp?: number }) | null {
  if (typeof token !== 'string') return null
  const dot = token.lastIndexOf('.')
  if (dot < 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  // Byte-safe constant-time compare (a multibyte char must not throw / 500).
  let sigBuf: Buffer
  let expBuf: Buffer
  try {
    sigBuf = Buffer.from(sig, 'base64url')
    expBuf = Buffer.from(sign(secret, body), 'base64url')
  } catch {
    return null
  }
  if (sigBuf.length === 0 || sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null
  if (!body.startsWith(`${label}.`)) return null // domain separation: wrong-purpose token rejected
  let claim: T & { exp?: number }
  try {
    claim = JSON.parse(Buffer.from(body.slice(label.length + 1), 'base64url').toString('utf8')) as T & { exp?: number }
  } catch {
    return null
  }
  if (typeof claim.exp !== 'number' || claim.exp < Date.now()) return null
  return claim
}

interface QuoteClaim { amount: number; currency: string; item: string; intent: string; exp: number }
interface AuthzClaim { amount: number; currency: string; item: string; intent: string; live: boolean; nonce: string; exp: number }
interface RunClaim { owner: string; amount: number; intent: string; rc: string; exp: number }

// ---- Owner allowlist (server-side, fail-closed) ----------------------------------------
// Only InsForge users on the allowlist may touch the money path. UNSET ⇒ NOBODY is owner
// (deny all) — the opposite of the prior "any authenticated user passes" behavior.
function ownerAllowlist(): { ids: Set<string>; emails: Set<string>; configured: boolean } {
  const ids = (Deno.env.get('ORIGIN_OWNER_USER_IDS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const emails = (Deno.env.get('ORIGIN_OWNER_EMAILS') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return { ids: new Set(ids), emails: new Set(emails), configured: ids.length + emails.length > 0 }
}
function isOwner(userId: string, email: string | undefined, al: ReturnType<typeof ownerAllowlist>): boolean {
  if (!al.configured) return false // FAIL CLOSED: no allowlist ⇒ deny everyone
  if (al.ids.has(userId)) return true
  if (email && al.emails.has(email.toLowerCase())) return true
  return false
}

function mask(v: unknown): string {
  const s = String(v ?? '')
  if (s.length <= 4) return '••••'
  return `${'•'.repeat(Math.max(4, s.length - 4))}${s.slice(-4)}`
}

async function findDoorDashBrand(cfg: SnapliiConfig, token: string): Promise<{ id: string; name: string } | null> {
  if (cachedDoorDashBrand) return cachedDoorDashBrand
  try {
    const resp = await timedFetch(`${cfg.baseUrl}/v2/card-brands`, { headers: { authorization: `Bearer ${token}` } })
    if (!resp.ok) return null
    const data = (await resp.json()) as unknown
    const cats = (Array.isArray(data) ? data : ((data as Record<string, unknown>)?.data ?? [])) as Record<string, unknown>[]
    const brands: Record<string, unknown>[] = []
    for (const c of cats) for (const b of ((c.cardBrands ?? []) as Record<string, unknown>[])) brands.push(b)
    const dd = brands.find((b) => /door\s?dash/i.test(String(b.name ?? b.brandName ?? b.alternativeName ?? '')))
    if (!dd) return null
    const id = String(dd.cardBrandId ?? dd.id ?? dd.brandId ?? dd.itemId ?? '')
    if (!id) return null
    cachedDoorDashBrand = { id, name: String(dd.name ?? 'DoorDash') }
    return cachedDoorDashBrand
  } catch {
    return null
  }
}

// ----------------------------------------------------------------------------
// Durable one-shot purchase-nonce ledger (ported from server/nonceStore.ts).
//
// Uses the InsForge ADMIN client. A UNIQUE index on `nonce` makes the FIRST insert win;
// a duplicate returns a unique violation → 'replayed'. So one-shot protection survives a
// restart and holds across instances. Fail-safe: if InsForge is unconfigured/unreachable
// or the table is missing, returns 'unavailable' and the caller falls back to the
// in-process Set (sim still works before the migration). Never throws, never logs the key.
// ----------------------------------------------------------------------------
type NonceConsumeOutcome =
  | { status: 'consumed' } // first use — inserted now
  | { status: 'replayed' } // the unique index rejected it — already consumed (durable, cross-restart)
  | { status: 'unavailable' } // not configured / unreachable / table missing — caller falls back

// deno-lint-ignore no-explicit-any
function adminClient(): any | null {
  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')
  const apiKey = Deno.env.get('API_KEY')
  if (!baseUrl || !apiKey) return null
  return createAdminClient({ baseUrl, apiKey })
}

/** A unique-constraint conflict signal from the SDK error (mirrors insforgeStore). */
function isUniqueConflict(err: unknown): boolean {
  if (!err) return false
  const e = err as Record<string, unknown>
  const status = Number(e.status ?? e.statusCode ?? 0)
  if (status === 409) return true
  const t = `${e.code ?? ''} ${e.message ?? ''} ${JSON.stringify(e)}`.toLowerCase()
  return t.includes('23505') || t.includes('duplicate key') || t.includes('unique constraint') || t.includes('already exists')
}

async function consumeNonceDurable(nonce: string, amountCents: number, live: boolean): Promise<NonceConsumeOutcome> {
  const admin = adminClient()
  if (!admin) return { status: 'unavailable' }
  try {
    // id / created_at are InsForge-managed, so we never send them. Array body, as the data API requires.
    const { error } = await admin.database.from(NONCE_TABLE).insert([{ nonce, amount_cents: amountCents, live }])
    if (!error) return { status: 'consumed' }
    if (isUniqueConflict(error)) return { status: 'replayed' }
    console.error('[nonce] insert failed')
    return { status: 'unavailable' }
  } catch (err) {
    console.error('[nonce] insert threw:', (err as Error)?.name ?? 'error')
    return { status: 'unavailable' }
  }
}

/** Release a nonce on a DEFINITE no-charge outcome, so the same approval can be retried. Best-effort. */
async function releaseNonceDurable(nonce: string): Promise<void> {
  const admin = adminClient()
  if (!admin) return
  try {
    await admin.database.from(NONCE_TABLE).delete().eq('nonce', nonce)
  } catch (err) {
    console.warn('[nonce] release failed:', (err as Error)?.name ?? 'error')
  }
}

// ====================================================================
// CONNECT — verify the key works; report scope + DoorDash brand. Read-only.
// ====================================================================
interface WalletConnectResult {
  ok: boolean
  connected: boolean
  scope: string
  live: boolean
  brand: { id: string; name: string } | null
  note?: string
  error?: string
}
async function connectWallet(cfg: SnapliiConfig, live: boolean): Promise<WalletConnectResult> {
  if (!cfg.apiKey) return { ok: false, connected: false, scope: 'none', live, brand: null, error: 'Snaplii is not configured on the server.' }
  const token = await snapliiToken(cfg)
  if (!token) return { ok: false, connected: false, scope: 'unknown', live, brand: null, error: 'Could not connect to Snaplii (auth failed).' }
  const brand = await findDoorDashBrand(cfg, token)
  return {
    ok: true, connected: true, scope: 'PAY_WRITE', live, brand,
    note: live ? 'Live purchases enabled — approved buys spend real Snaplii Cash.' : 'Simulation mode — approved buys are simulated (set SNAPLII_LIVE=1 for real spend).',
  }
}

// ====================================================================
// QUOTE — real price preview + a NON-spendable signed quote claim. Read-only.
// ====================================================================
interface WalletQuoteResult {
  ok: boolean
  amount: number
  currency: string
  cashback: number
  brand: string
  quote_claim?: string
  error?: string
  code?: 'no_key' | 'over_cap' | 'upstream' | 'bad_request' | 'no_run'
}
async function quoteOrder(body: Record<string, unknown>, cfg: SnapliiConfig, secret: string, userId: string): Promise<WalletQuoteResult> {
  const amount = Number(body.amount)
  const intent = String(body.intent ?? 'enrich-my-life').slice(0, 64)
  const currency = 'USD'
  const noRun = (error: string): WalletQuoteResult => ({ ok: false, amount: Number.isFinite(amount) ? amount : 0, currency, cashback: 0, brand: 'DoorDash', code: 'no_run', error })
  // CLAIM BINDING: require a server-minted Passport run claim, bound to THIS owner + the exact
  // amount + intent. Without it (e.g. a direct out-of-band curl), the quote is refused — the
  // client cannot forge the HMAC claim (the secret is server-only).
  const rc = verifyToken<RunClaim>(secret, RUN_LABEL, String(body.run_claim ?? ''))
  if (!rc) return noRun('Missing or invalid Passport run claim — start the purchase from the Passport flow.')
  if (rc.owner !== userId) return noRun('Run claim is not bound to this account.')
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, amount: 0, currency, cashback: 0, brand: 'DoorDash', code: 'bad_request', error: 'Invalid amount.' }
  if (Math.abs(rc.amount - amount) > 0.001) return noRun('Amount does not match the approved Passport run.')
  if (rc.intent !== intent) return noRun('Intent does not match the approved Passport run.')
  if (!(cfg.perBuyCapUsd > 0) || amount > cfg.perBuyCapUsd) return { ok: false, amount, currency, cashback: 0, brand: 'DoorDash', code: 'over_cap', error: `Over the per-purchase cap of $${cfg.perBuyCapUsd}.` }
  const token = await snapliiToken(cfg)
  if (!token) return { ok: false, amount, currency, cashback: 0, brand: 'DoorDash', code: 'no_key', error: 'Snaplii not connected.' }
  const brand = (await findDoorDashBrand(cfg, token)) ?? { id: '', name: 'DoorDash' }

  let cashback = Math.round(amount * 0.04 * 100) / 100
  try {
    const resp = await timedFetch(`${cfg.baseUrl}/v2/quote`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        orderInfo: { orderType: 'GIFT_CARD', item: { itemId: brand.id, price: String(amount) } },
        paymentContext: { specifiedPrimaryPaymentMethod: 'SNAPLII_CREDIT', voucherOption: 'BEST_FIT', cashbackOption: 'USE' },
      }),
    })
    if (resp.ok) {
      const data = (await resp.json()) as Record<string, unknown>
      const cb = Number(data.cashback ?? (data.paymentContext as Record<string, unknown> | undefined)?.cashback)
      if (Number.isFinite(cb) && cb >= 0) cashback = Math.round(cb * 100) / 100
    } else {
      console.error(`[snaplii] quote ${resp.status}`)
    }
  } catch {
    /* keep estimate */
  }

  // A quote carries NO spend authority — it is digest-bound and replay-checkable, exchanged for a token only at authorize.
  const quote_claim = mintToken(secret, QUOTE_LABEL, { amount, currency, item: brand.id || 'doordash', intent, exp: Date.now() + TOKEN_TTL_MS } satisfies QuoteClaim)
  return { ok: true, amount, currency, cashback, brand: brand.name, quote_claim }
}

// ====================================================================
// AUTHORIZE — the human-approval step. Verifies the quote, ATOMICALLY reserves the
// spend against the caps (no await between check and reserve → no TOCTOU), and mints
// a one-shot, mode-bound purchase token. Refuses real money under an insecure secret.
// ====================================================================
interface WalletAuthorizeResult {
  ok: boolean
  approval_token?: string
  error?: string
  code?: 'bad_quote' | 'over_cap' | 'insecure_secret'
}
function authorizeOrder(body: Record<string, unknown>, cfg: SnapliiConfig, secret: string, secretIsDev: boolean, live: boolean): WalletAuthorizeResult {
  const claim = verifyToken<QuoteClaim>(secret, QUOTE_LABEL, String(body.quote_claim ?? ''))
  if (!claim) return { ok: false, code: 'bad_quote', error: 'Quote is missing, invalid, or expired — request a fresh quote.' }
  if (live && secretIsDev) return { ok: false, code: 'insecure_secret', error: 'Real purchases are refused with the insecure dev signing secret. Set EPISODE_SIGNING_SECRET.' }

  // Atomic reserve: check + reserve run synchronously together — no await between them.
  if (!(cfg.perBuyCapUsd > 0) || !(cfg.dailyCapUsd > 0)) return { ok: false, code: 'over_cap', error: 'Spend cap is not configured.' }
  if (claim.amount > cfg.perBuyCapUsd) return { ok: false, code: 'over_cap', error: `Over the per-purchase cap of $${cfg.perBuyCapUsd}.` }
  if (reservedUsd + claim.amount > cfg.dailyCapUsd) return { ok: false, code: 'over_cap', error: `Over the session spend cap of $${cfg.dailyCapUsd}.` }
  reservedUsd += claim.amount // RESERVED — released only on a definite no-charge outcome

  const approval_token = mintToken(secret, AUTHZ_LABEL, {
    amount: claim.amount, currency: claim.currency, item: claim.item, intent: claim.intent,
    live, nonce: crypto.randomUUID(), exp: Date.now() + TOKEN_TTL_MS,
  } satisfies AuthzClaim)
  return { ok: true, approval_token }
}

// ====================================================================
// PURCHASE — settles the reserved spend. One-shot. Ambiguous live outcomes FAIL CLOSED.
// ====================================================================
interface WalletPurchaseResult {
  ok: boolean
  simulated: boolean
  amount: number
  currency: string
  brand: string
  masked_code: string
  message: string
  error?: string
  code?: 'no_token' | 'bad_token' | 'replayed' | 'mode_mismatch' | 'no_key' | 'upstream' | 'uncertain'
}
async function purchaseOrder(body: Record<string, unknown>, cfg: SnapliiConfig, secret: string, live: boolean): Promise<WalletPurchaseResult> {
  const fail = (code: WalletPurchaseResult['code'], error: string): WalletPurchaseResult => ({
    ok: false, simulated: false, amount: 0, currency: 'USD', brand: 'DoorDash', masked_code: '', message: '', code, error,
  })
  const token = typeof body.approval_token === 'string' ? body.approval_token : ''
  if (!token) return fail('no_token', 'Purchase requires an approval token (approve first).')
  const claim = verifyToken<AuthzClaim>(secret, AUTHZ_LABEL, token)
  if (!claim) return fail('bad_token', 'Approval token is invalid or expired.')
  // An approval granted under one mode can never be redeemed under another (no silent flip to real money).
  if (claim.live !== live) return fail('mode_mismatch', 'This approval was granted under a different mode; re-approve.')
  if (claim.currency !== 'USD') return fail('bad_token', 'Unsupported currency.')

  // One-shot, BEFORE any side effect. Fast path: in-process Set (zero-latency same-instance guard).
  if (consumedNonces.has(claim.nonce)) return fail('replayed', 'This approval was already used (one-shot).')
  consumedNonces.add(claim.nonce)

  const release = () => {
    consumedNonces.delete(claim.nonce)
    reservedUsd = Math.max(0, reservedUsd - claim.amount)
    void releaseNonceDurable(claim.nonce) // best-effort durable release on a definite no-charge
  }

  // Durable one-shot ledger: a UNIQUE index makes replay protection survive a restart and hold across instances.
  const durable = await consumeNonceDurable(claim.nonce, Math.round(claim.amount * 100), live)
  if (durable.status === 'replayed') return fail('replayed', 'This approval was already used (one-shot).')
  // LIVE money FAILS CLOSED: if the durable consume was not confirmed (InsForge unreachable / table
  // not provisioned), refuse to charge rather than risk a cross-instance double-charge. SIM has no
  // money at stake, so it proceeds on the in-process guard alone (and works before the migration).
  if (live && durable.status !== 'consumed') {
    release() // nothing charged yet — let the user re-approve once durability is restored
    return fail('uncertain', 'Could not record this one-shot purchase in the durable ledger — refusing to charge real money. Verify InsForge / apply the migration, then re-approve.')
  }

  if (!live) {
    return {
      ok: true, simulated: true, amount: claim.amount, currency: claim.currency, brand: 'DoorDash',
      masked_code: mask(`SIM-${claim.nonce}`),
      message: `Simulated: a $${claim.amount} DoorDash credit would be purchased via Snaplii. Set SNAPLII_LIVE=1 for a real buy.`,
    }
  }

  // LIVE: real Snaplii purchase. The reservation already counted this spend at authorize.
  const sessionToken = await snapliiToken(cfg)
  if (!sessionToken) {
    release() // nothing was charged
    return fail('no_key', 'Snaplii not connected.')
  }
  try {
    const resp = await timedFetch(`${cfg.baseUrl}/v2/purchase`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${sessionToken}`,
        'content-type': 'application/json',
        'Idempotency-Key': claim.nonce, // a retry cannot double-charge if Snaplii honors it
      },
      body: JSON.stringify({
        orderInfo: { orderType: 'GIFT_CARD', item: { itemId: claim.item, price: String(claim.amount) } },
        paymentContext: { specifiedPrimaryPaymentMethod: 'SNAPLII_CREDIT', voucherOption: 'BEST_FIT', cashbackOption: 'USE' },
        delivery: { type: 'WALLET', immediateSend: 'true' },
      }),
    })
    if (!resp.ok) {
      if (resp.status >= 500) {
        // AMBIGUOUS 5xx: Snaplii may have charged before failing. Fail closed — do NOT release the
        // nonce/budget; require out-of-band reconciliation before any retry.
        console.error(`[snaplii] purchase ${resp.status} (uncertain)`)
        return fail('uncertain', 'The purchase result is unconfirmed. Check your Snaplii wallet before retrying — it may have completed.')
      }
      // A definite 4xx rejection means no charge — safe to release + allow a fresh approval.
      release()
      console.error(`[snaplii] purchase ${resp.status}`)
      return fail('upstream', 'Snaplii declined the purchase.')
    }
    const data = (await resp.json()) as Record<string, unknown>
    const rawCode = data.redemptionCode ?? data.code ?? (data.card as Record<string, unknown> | undefined)?.code ?? claim.nonce
    return {
      ok: true, simulated: false, amount: claim.amount, currency: claim.currency, brand: 'DoorDash',
      masked_code: mask(rawCode),
      message: 'Purchased a DoorDash credit via Snaplii Cash. The redemption code is in your Snaplii wallet.',
    }
  } catch (err) {
    // AMBIGUOUS (timeout / network): the charge MAY have gone through. Fail closed — do NOT
    // release the nonce or budget; require out-of-band reconciliation before any retry.
    console.error('[snaplii] purchase uncertain:', (err as Error)?.name ?? 'error')
    return fail('uncertain', 'The purchase result is unconfirmed. Check your Snaplii wallet before retrying — it may have completed.')
  }
}

// ====================================================================
// HTTP entrypoint — dispatch on `action`, after requiring an authenticated OWNER.
// ====================================================================
export default async function (req: Request): Promise<Response> {
  const origin = req.headers.get('Origin') || ''
  const cors = corsFor(origin)
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // AUTH: require an authenticated OWNER (a normal InsForge user access token). The human
  // approving in the UI calls this — the agent never holds the Snaplii key. (Owner mode,
  // exactly as credential-broker.ts does it.)
  const accessToken = (req.headers.get('Authorization') || '').replace('Bearer ', '') || null
  const client = createClient({ baseUrl: Deno.env.get('INSFORGE_BASE_URL'), accessToken })
  const { data: me } = await client.auth.getCurrentUser()
  const userId = me?.user?.id
  if (!userId) return json({ error: 'unauthorized' }, 401)

  // OWNER ALLOWLIST (fail-closed): a signed-in user is not enough — they must be on the
  // server-side owner allowlist. 403 (distinct from 401) so the UI can say "signed in, not owner".
  const al = ownerAllowlist()
  if (!isOwner(userId, me?.user?.email, al)) return json({ error: 'forbidden: owner only' }, 403)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'invalid body' }, 400) }

  const action = String(body.action || '')
  const cfg = loadSnapliiConfig()
  const { secret, secretIsDev } = loadSigningSecret()
  const live = cfg.live

  switch (action) {
    case 'connect':
      return json(await connectWallet(cfg, live))
    case 'quote':
      return json(await quoteOrder(body, cfg, secret, userId))
    case 'authorize':
      return json(authorizeOrder(body, cfg, secret, secretIsDev, live))
    case 'purchase':
      return json(await purchaseOrder(body, cfg, secret, live))
    default:
      return json({ error: `unknown action: ${action || '(none)'} — expected connect | quote | authorize | purchase` }, 400)
  }
}
