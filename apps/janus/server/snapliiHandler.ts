// ----------------------------------------------------------------------------
// Snaplii real-payment broker — runs ONLY in the Node server. The SNAPLII_API_KEY
// (snp_sk_live_…) lives here and is never sent to the browser. Mirrors Janus's
// own thesis: Snaplii alone allows within-cap auto-spend; Janus overrides that
// to require a per-action, one-shot, amount-bound, HMAC-signed human approval.
//
// Flow (hardened after an adversarial review):
//   quote      → real price preview + a signed, NON-spendable quote claim (no money authority)
//   authorize  → the human-approval step: verifies the quote, ATOMICALLY reserves the spend
//                against the caps, and mints a one-shot, mode-bound purchase token
//   purchase   → settles the reserved spend; one-shot; ambiguous outcomes FAIL CLOSED
//
// Safety rails: key server-side only; codes masked, never logged; one-shot nonce;
// synchronous reserve-then-settle (no TOCTOU); per-buy + session caps (fail-closed on
// a bad cap); domain-separated HMAC; live-mode bound into the token; real money only
// when SNAPLII_LIVE=1 AND a non-dev signing secret is set.
// ----------------------------------------------------------------------------

import crypto from 'node:crypto'
import type { InsforgeConfig, SnapliiConfig } from './config.ts'
import { consumeNonceDurable, releaseNonceDurable } from './nonceStore.ts'

const DEFAULT_TIMEOUT = 15000
const TOKEN_TTL_MS = 10 * 60 * 1000

// One-shot + reservation ledgers. The one-shot NONCE is now DURABLE: purchaseOrder also records
// each consumed nonce in an InsForge unique-index ledger (server/nonceStore.ts, migration
// 20260627000000), so replay protection survives a restart and holds across instances — with this
// in-process Set as the zero-latency fast path, degrading to it if InsForge is unreachable. The
// reservation cap below stays in-process: a soft secondary ceiling only (Snaplii enforces its own
// cap; the real guard is the stateless per-buy cap + the durable one-shot nonce).
const consumedNonces = new Set<string>()
let reservedUsd = 0 // spend reserved at authorize-time (the cap is enforced here, atomically)

// ---- session token cache (Snaplii JWT from the snp_sk_live_ key) ----
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
      body: JSON.stringify({ agent_id: 'passport-origin', api_key: cfg.apiKey }), // agent_id is the Snaplii-side external identifier paired with this API key — do NOT rename with the app
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
function verifyToken<T>(secret: string, label: string, token: string): T | null {
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

// ====================================================================
// CONNECT — verify the key works; report scope + DoorDash brand. Read-only.
// ====================================================================
export interface WalletConnectResult {
  ok: boolean
  connected: boolean
  scope: string
  live: boolean
  brand: { id: string; name: string } | null
  note?: string
  error?: string
}
export async function connectWallet(cfg: SnapliiConfig, live: boolean): Promise<WalletConnectResult> {
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
export interface WalletQuoteResult {
  ok: boolean
  amount: number
  currency: string
  cashback: number
  brand: string
  quote_claim?: string
  error?: string
  code?: 'no_key' | 'over_cap' | 'upstream' | 'bad_request'
}
export async function quoteOrder(body: unknown, cfg: SnapliiConfig, secret: string): Promise<WalletQuoteResult> {
  const b = (body ?? {}) as Record<string, unknown>
  const amount = Number(b.amount)
  const intent = String(b.intent ?? 'enrich-my-life').slice(0, 64)
  const currency = 'USD'
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, amount: 0, currency, cashback: 0, brand: 'DoorDash', code: 'bad_request', error: 'Invalid amount.' }
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

  // A quote carries NO spend authority — it is a tamper-proof price, exchanged for a token only at /authorize.
  const quote_claim = mintToken(secret, QUOTE_LABEL, { amount, currency, item: brand.id || 'doordash', intent, exp: Date.now() + TOKEN_TTL_MS } satisfies QuoteClaim)
  return { ok: true, amount, currency, cashback, brand: brand.name, quote_claim }
}

// ====================================================================
// AUTHORIZE — the human-approval step. Verifies the quote, ATOMICALLY reserves the
// spend against the caps (no await between check and reserve → no TOCTOU), and mints
// a one-shot, mode-bound purchase token. Refuses real money under an insecure secret.
// ====================================================================
export interface WalletAuthorizeResult {
  ok: boolean
  approval_token?: string
  error?: string
  code?: 'bad_quote' | 'over_cap' | 'insecure_secret'
}
export function authorizeOrder(body: unknown, cfg: SnapliiConfig, secret: string, secretIsDev: boolean, live: boolean): WalletAuthorizeResult {
  const b = (body ?? {}) as Record<string, unknown>
  const claim = verifyToken<QuoteClaim>(secret, QUOTE_LABEL, String(b.quote_claim ?? ''))
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
export interface WalletPurchaseResult {
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
export async function purchaseOrder(body: unknown, cfg: SnapliiConfig, secret: string, live: boolean, insforge: InsforgeConfig): Promise<WalletPurchaseResult> {
  const b = (body ?? {}) as Record<string, unknown>
  const fail = (code: WalletPurchaseResult['code'], error: string): WalletPurchaseResult => ({
    ok: false, simulated: false, amount: 0, currency: 'USD', brand: 'DoorDash', masked_code: '', message: '', code, error,
  })
  const token = typeof b.approval_token === 'string' ? b.approval_token : ''
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
    void releaseNonceDurable(claim.nonce, insforge) // best-effort durable release on a definite no-charge
  }

  // Durable one-shot ledger: a UNIQUE index (migration 20260627000000) makes replay protection
  // survive a restart and hold across instances.
  const durable = await consumeNonceDurable(claim.nonce, Math.round(claim.amount * 100), live, insforge)
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
