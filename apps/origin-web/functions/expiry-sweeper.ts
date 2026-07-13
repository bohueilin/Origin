// Expiry sweeper — scheduled job (InsForge schedule). Flips anything past its expiry
// from active/pending to expired across all users, so the database is the source of
// truth rather than relying on read-time checks. Idempotent and safe to run often: it
// only ever moves already-expired rows to 'expired'. Uses the admin key (cross-user).
import { createAdminClient } from 'npm:@insforge/sdk'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const adminBaseUrl = Deno.env.get('INSFORGE_BASE_URL')
  const adminApiKey = Deno.env.get('API_KEY')
  if (!adminBaseUrl || !adminApiKey) return json({ ok: false, error: 'server misconfigured' }, 500)
  const admin = createAdminClient({ baseUrl: adminBaseUrl, apiKey: adminApiKey })
  const nowIso = new Date().toISOString()
  const swept: Record<string, boolean> = {}
  const sweep = async (table: string, fromStatus: string) => {
    const { error } = await admin.database.from(table).update({ status: 'expired' }).lt('expires_at', nowIso).eq('status', fromStatus)
    swept[table] = !error
  }
  await sweep('credential_grants', 'active')
  await sweep('agent_tokens', 'active')
  await sweep('wallet_session_keys', 'active')
  await sweep('credential_approval_requests', 'pending')
  return json({ ok: true, ranAt: nowIso, swept })
}
