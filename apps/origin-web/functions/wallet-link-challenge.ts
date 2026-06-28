// SIWE link — step 1: issue a single-use nonce challenge.
//
// Sign-In-With-Ethereum (EIP-4361) ownership proof. The user proves they control an
// address by signing a server-issued nonce in their own wallet. We never trust a typed
// address. Runs under the user's token (RLS scopes the challenge to them).
//
// Body: { address, chainId? }  ->  { nonce, domain, uri, version, chainId, issuedAt, expiresAt, statement }
import { createClient } from 'npm:@insforge/sdk'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

// URL-safe random nonce (>= 8 alphanumerics per EIP-4361).
function makeNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24)
}

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '') || null
  const client = createClient({ baseUrl: Deno.env.get('INSFORGE_BASE_URL'), accessToken: token })
  const { data: me } = await client.auth.getCurrentUser()
  const userId = me?.user?.id
  if (!userId) return json({ error: 'unauthorized' }, 401)

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* empty */ }
  const address = String(body.address || '').trim()
  const chainId = Number(body.chainId || 1)
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return json({ error: 'invalid address' }, 400)

  // The verifier must bind the signature to OUR origin. Allow an override via secret for
  // the deployed site; default to the request origin host.
  const origin = req.headers.get('Origin') || ''
  const domain = (Deno.env.get('SIWE_DOMAIN') || origin.replace(/^https?:\/\//, '') || 'localhost:5275')
  const uri = origin || `https://${domain}`
  const nonce = makeNonce()
  const statement = 'Link this wallet to your Origin account. Signing proves you control the address. This does not authorize any transaction.'

  const { error } = await client.database.from('wallet_link_challenges').insert([{ nonce, address: address.toLowerCase(), chain_id: chainId, domain }])
  if (error) return json({ error: 'could not issue challenge' }, 500)

  return json({ nonce, domain, uri, version: '1', chainId, address, statement })
}
