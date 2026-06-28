// Mint a restricted agent token for one grant.
//
// The agent must NEVER hold the user's JWT (that would let it bypass the broker and hit
// the DB directly). Instead the owner mints an OPAQUE token bound to a single grant +
// scope + short expiry. We store only its SHA-256 hash; the plaintext is shown once. The
// token is useless against PostgREST — only the credential-broker function honours it,
// and only for the grant it is bound to.
//
// Body: { grantId }  ->  { token, expiresAt }   (token returned once, never again)
import { createClient } from 'npm:@insforge/sdk'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
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
  const grantId = String(body.grantId || '')
  if (!grantId) return json({ error: 'grantId required' }, 400)

  // The grant must exist, be active, and belong to the caller (RLS already scopes it).
  const { data: rows } = await client.database.from('credential_grants').select('*').eq('id', grantId).limit(1)
  // deno-lint-ignore no-explicit-any
  const g: any = rows && (rows as any[])[0]
  if (!g) return json({ error: 'grant not found' }, 404)
  if (g.status !== 'active' || g.revoked_at) return json({ error: 'grant not active' }, 400)

  // Opaque token: a prefix + 32 random bytes. We persist only its hash. The agent token's
  // lifetime is bounded by min(grant expiry, 1h) so a leaked token ages out fast.
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const plaintext = 'cak_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  const hash = await sha256Hex(plaintext)
  const grantExp = Date.parse(g.expires_at)
  const expiresAt = new Date(Math.min(grantExp, Date.now() + 3_600_000)).toISOString()

  const { error } = await client.database.from('agent_tokens').insert([{ grant_id: grantId, token_hash: hash, scope: g.scope, expires_at: expiresAt }])
  if (error) return json({ error: 'could not mint token' }, 500)

  await client.database.from('audit_events').insert([{ user_id: userId, actor_type: 'user', event_type: 'agent_token_minted', target_type: 'credential_grant', target_id: grantId, metadata_json: { scope: g.scope, expiresAt } }])

  return json({ token: plaintext, expiresAt })
}
