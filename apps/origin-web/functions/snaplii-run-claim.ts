// Snaplii run-claim minter — InsForge edge function (Deno Subhosting).
//
// THE ONLY place a Passport "run claim" is minted. The browser cannot produce one (the claim is
// HMAC-signed with EPISODE_SIGNING_SECRET, which lives only in function env). snaplii-broker's
// `quote` REQUIRES a valid run claim, so a direct/out-of-band broker call (curl quote→authorize→
// purchase) without a real Passport-initiated run is rejected.
//
// Auth: same authenticated-OWNER allowlist as snaplii-broker (fail-closed). The claim binds
// { owner, amount, intent } so the downstream quote/authorize/purchase amount cannot drift.
//
// Body: { amount: number, intent: string } → { ok, run_claim, expiresAt } | { error }
//
// NOTE (follow-up): the run claim is HMAC + short-TTL + owner/amount/intent-bound, but is NOT yet
// durably one-shot (a durable rc-nonce table would prevent one claim funding multiple quotes within
// its TTL). The owner is trusted and each purchase still has its own one-shot nonce, so this is a
// low-severity hardening left for later.

import { createClient } from 'npm:@insforge/sdk'
import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'

const RUN_LABEL = 'snaplii.run.v1'
const RUN_TTL_MS = 5 * 60 * 1000
const DEV_EPISODE_SECRET = 'dev-insecure-episode-secret-change-me'

function cap(raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? fallback)
  return Number.isFinite(n) && n > 0 && n <= 100000 ? n : 0
}
function loadSigningSecret(): { secret: string; secretIsDev: boolean } {
  const raw = Deno.env.get('EPISODE_SIGNING_SECRET') ?? ''
  if (!raw || raw === DEV_EPISODE_SECRET) return { secret: raw || DEV_EPISODE_SECRET, secretIsDev: true }
  return { secret: raw, secretIsDev: false }
}

// ---- owner allowlist (fail-closed; identical to snaplii-broker) ----
function ownerAllowlist(): { ids: Set<string>; emails: Set<string>; configured: boolean } {
  const ids = (Deno.env.get('ORIGIN_OWNER_USER_IDS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const emails = (Deno.env.get('ORIGIN_OWNER_EMAILS') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return { ids: new Set(ids), emails: new Set(emails), configured: ids.length + emails.length > 0 }
}
function isOwner(userId: string, email: string | undefined, al: ReturnType<typeof ownerAllowlist>): boolean {
  if (!al.configured) return false
  if (al.ids.has(userId)) return true
  if (email && al.emails.has(email.toLowerCase())) return true
  return false
}

// ---- HMAC token (domain-separated; same scheme as snaplii-broker) ----
function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url')
}
function mintToken(secret: string, label: string, claim: object): string {
  const body = `${label}.${b64url(JSON.stringify(claim))}`
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`
}

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

export default async function (req: Request): Promise<Response> {
  const origin = req.headers.get('Origin') || ''
  const cors = corsFor(origin)
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const accessToken = (req.headers.get('Authorization') || '').replace('Bearer ', '') || null
  const client = createClient({ baseUrl: Deno.env.get('INSFORGE_BASE_URL'), accessToken: accessToken ?? undefined })
  const { data: me } = await client.auth.getCurrentUser()
  const userId = me?.user?.id
  if (!userId) return json({ error: 'unauthorized' }, 401)
  const al = ownerAllowlist()
  if (!isOwner(userId, me?.user?.email, al)) return json({ error: 'forbidden: owner only' }, 403)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'invalid body' }, 400) }

  const amount = Number(body.amount)
  const intent = String(body.intent ?? '').slice(0, 64)
  const perBuyCap = cap(Deno.env.get('SNAPLII_PER_BUY_CAP_USD'), 25)
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'invalid amount' }, 400)
  if (!intent) return json({ error: 'missing intent' }, 400)
  // Defense in depth: refuse to mint a claim above the per-buy cap (the broker re-checks too).
  if (!(perBuyCap > 0) || amount > perBuyCap) return json({ error: `over the per-purchase cap of $${perBuyCap}` }, 400)

  const { secret } = loadSigningSecret()
  const run_claim = mintToken(secret, RUN_LABEL, {
    owner: userId,
    amount,
    intent,
    rc: crypto.randomUUID(),
    exp: Date.now() + RUN_TTL_MS,
  })
  return json({ ok: true, run_claim, expiresAt: Date.now() + RUN_TTL_MS })
}
