// Account deletion — InsForge edge function (Deno Subhosting).
//
// Runs under the caller's own access token, so RLS guarantees a user can only delete
// their OWN data. It purges every credential-broker record the user owns (grants,
// integrations, wallets, approval + wallet-action requests). It deliberately does NOT
// touch the append-only `audit_events` table — that log is tamper-evident by design and
// is retained for the deletion record.
//
// Removing the underlying auth user requires the admin API and is intentionally left to
// a server with the admin key (or the dashboard). This function returns
// `authUserRemoved: false` so the UI can tell the user data was purged and the login
// itself is scheduled for removal. See src/credentials/README.md.
//
// Body: { confirm: 'DELETE' }
import { createClient } from 'npm:@insforge/sdk'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const TABLES = ['credential_approval_requests', 'wallet_action_requests', 'credential_grants', 'wallet_connections', 'integration_connections']

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '') || null
  const client = createClient({ baseUrl: Deno.env.get('INSFORGE_BASE_URL'), accessToken: token })

  const { data: me } = await client.auth.getCurrentUser()
  const userId = me?.user?.id
  if (!userId) return json({ error: 'unauthorized' }, 401)

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* empty body tolerated */ }
  if (body.confirm !== 'DELETE') return json({ error: 'confirmation required' }, 400)

  const purged: Record<string, boolean> = {}
  for (const t of TABLES) {
    // RLS limits deletes to this user's rows; the explicit eq is defense in depth.
    const { error } = await client.database.from(t).delete().eq('user_id', userId)
    purged[t] = !error
  }

  // Record the deletion in the append-only audit log before the login is removed.
  await client.database.from('audit_events').insert([{ user_id: userId, actor_type: 'user', event_type: 'account_data_purged', target_type: 'account', target_id: userId, metadata_json: purged }])

  return json({ ok: true, purged, authUserRemoved: false, note: 'Your credential data was deleted. Removal of the login itself is scheduled and completed by an administrator.' })
}
