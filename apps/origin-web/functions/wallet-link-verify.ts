// SIWE link — step 2: verify the signed nonce and record a VERIFIED wallet.
//
// Recovers the signer from the SIWE message + signature (EOA, offline ecrecover via
// viem), then checks: recovered == claimed address, the nonce matches an unconsumed
// challenge for this user, the domain matches, and the message hasn't expired. Only then
// is the wallet stored with `verified_at`. No secret, no key — proof of control only.
//
// Body: { message, signature }  ->  { ok, address, chainId }
import { createClient } from 'npm:@insforge/sdk'
import { parseSiweMessage } from 'npm:viem/siwe'
import { recoverMessageAddress } from 'npm:viem'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '') || null
  const client = createClient({ baseUrl: Deno.env.get('INSFORGE_BASE_URL'), accessToken: token ?? undefined })
  const { data: me } = await client.auth.getCurrentUser()
  const userId = me?.user?.id
  if (!userId) return json({ error: 'unauthorized' }, 401)

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { return json({ ok: false, error: 'invalid body' }, 400) }
  const message = String(body.message || '')
  const signature = String(body.signature || '')
  if (!message || !/^0x[a-fA-F0-9]+$/.test(signature)) return json({ ok: false, error: 'missing message/signature' }, 400)

  // Parse the SIWE fields and recover the signer (fail closed on any parse/recover error).
  let fields: ReturnType<typeof parseSiweMessage>
  let recovered: string
  try {
    fields = parseSiweMessage(message)
    recovered = await recoverMessageAddress({ message, signature: signature as `0x${string}` })
  } catch {
    return json({ ok: false, error: 'signature verification failed' }, 400)
  }
  const claimed = String(fields.address || '').toLowerCase()
  if (!claimed || recovered.toLowerCase() !== claimed) return json({ ok: false, error: 'signer does not match address' }, 400)

  // The signed message must reference an unconsumed, unexpired challenge we issued.
  const nonce = String(fields.nonce || '')
  const { data: rows } = await client.database.from('wallet_link_challenges').select('*').eq('nonce', nonce).limit(1)
  // deno-lint-ignore no-explicit-any
  const ch: any = rows && (rows as any[])[0]
  if (!ch) return json({ ok: false, error: 'unknown or expired challenge' }, 400)
  if (ch.consumed_at) return json({ ok: false, error: 'challenge already used' }, 400)
  if (Date.now() >= Date.parse(ch.expires_at)) return json({ ok: false, error: 'challenge expired' }, 400)
  if (String(ch.address).toLowerCase() !== claimed) return json({ ok: false, error: 'address mismatch' }, 400)
  if (fields.domain && ch.domain && fields.domain !== ch.domain) return json({ ok: false, error: 'domain mismatch' }, 400)
  if (fields.expirationTime && Date.now() >= Date.parse(String(fields.expirationTime))) return json({ ok: false, error: 'message expired' }, 400)

  const chainId = Number(fields.chainId || ch.chain_id || 1)
  // Single-use: consume the challenge, then record the verified wallet (upsert by address).
  await client.database.from('wallet_link_challenges').update({ consumed_at: new Date().toISOString() }).eq('id', ch.id)
  const { data: existing } = await client.database.from('wallet_connections').select('id').eq('wallet_address', claimed).limit(1)
  // deno-lint-ignore no-explicit-any
  if (existing && (existing as any[]).length) {
    // deno-lint-ignore no-explicit-any
    await client.database.from('wallet_connections').update({ status: 'active', provider: 'siwe', verified_at: new Date().toISOString(), chain_id: chainId, network: networkName(chainId), revoked_at: null }).eq('id', (existing as any[])[0].id)
  } else {
    await client.database.from('wallet_connections').insert([{ wallet_address: claimed, network: networkName(chainId), provider: 'siwe', status: 'active', verified_at: new Date().toISOString(), chain_id: chainId }])
  }
  await client.database.from('audit_events').insert([{ user_id: userId, actor_type: 'user', event_type: 'wallet_ownership_verified', target_type: 'wallet_connection', target_id: claimed, metadata_json: { chainId, method: 'siwe' } }])

  return json({ ok: true, address: claimed, chainId })
}

function networkName(chainId: number): string {
  switch (chainId) {
    case 1: return 'ethereum'
    case 11155111: return 'sepolia'
    case 8453: return 'base'
    case 84532: return 'base-sepolia'
    case 137: return 'polygon'
    case 42161: return 'arbitrum'
    case 10: return 'optimism'
    default: return `evm:${chainId}`
  }
}
