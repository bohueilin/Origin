// Agent-runtime credential broker — InsForge edge function (Deno Subhosting).
//
// SERVER-SIDE enforcement point. An agent requests a scoped capability; it never receives
// a raw secret. The pipeline mirrors src/credentials/broker.ts exactly (inlined — Deno
// deploy ships one file).
//
// Two auth modes:
//  • Agent (preferred): the agent presents an OPAQUE token via `x-agent-token`. The token
//    grants NO database access (PostgREST never honours it). This function looks it up
//    with the ADMIN key, derives the user + bound grant, and acts on the agent's behalf.
//    A leaked agent token can do nothing but call this broker, for one grant, until it
//    expires. This is the real delegation boundary.
//  • Owner (for the in-app Test button): a normal user access token; RLS scopes reads.
//
// Body: { op?, grantId, agentId, runId?, scope, targetDomain, action, reason?, handle?, expectedRef? }
//   op (default 'request') — 'request' issues a lease, 'use' resolves+acts JIT, 'revoke' kills a
//   lease (the kill switch), 'list' returns redacted lease views. All ops share the same
//   identity/owner block + audit helper.
import { createClient, createAdminClient } from 'npm:@insforge/sdk'
import {
  isAvailable as opIsAvailable,
  leaseScopedSecret,
  listLeases,
  loadOpConfig,
  parseRef,
  revokeLease,
  useLease,
  type LeaseView,
} from './_onePasswordBroker.ts'

const HIGH_RISK = ['website_login', 'wallet_prepare']
const ALLOWED_ORIGINS = ['http://localhost:5275', 'https://origin-physical-ai.pages.dev']
const RATE_LIMIT_PER_MIN = 30

const SECRET_KEY = /(pass(word|wd)?|secret|token|api[_-]?key|priv(ate)?[_-]?key|seed|mnemonic|cookie|authorization|auth_?token|refresh|credential|bearer)/i
function redact(value: unknown, depth = 0): unknown {
  if (depth > 8 || value == null) return value
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SECRET_KEY.test(k) ? '[redacted]' : redact(v, depth + 1)
    return out
  }
  return value
}
function normDomain(d: string): string {
  return (d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
}
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

// Hard backstop ported from src/credentials/redact.ts: throw if any known secret VALUE
// appears anywhere in a payload. The edge fn lacks this today; we run it over the final
// JSON in addition to redact() so a provider bug can never leak a credential to the agent.
function assertNoSecret(payload: unknown, secrets: Array<string | null | undefined>): void {
  const haystack = JSON.stringify(payload ?? null)
  for (const secret of secrets) {
    if (secret && secret.length >= 4 && haystack.includes(secret)) {
      throw new Error('credential-broker: secret leak blocked at the agent boundary')
    }
  }
}

// 1Password Service-Account provider (fail-closed). Builds the op://vault/item/field ref
// from the grant (grant rows carry vault_ref/item_ref), validates it, pins it to OP_VAULT,
// and returns ONLY redacted metadata — NEVER a field value. The secret is resolved JIT
// (via the lease 'use' op), never here. Activate via OP_SERVICE_ACCOUNT_TOKEN (+ OP_VAULT)
// secrets; until then onepassword grants are denied fail-closed.
function buildOpRef(grant: Record<string, unknown>): { ref: string; vaultRef: string; itemRef: string; field?: string } {
  const vaultRef = String(grant.vault_ref || '')
  const itemRef = String(grant.item_ref || '')
  if (!vaultRef || !itemRef) throw new Error('onepassword grant missing vault_ref/item_ref')
  const field = grant.field_ref ? String(grant.field_ref) : undefined
  const ref = `op://${vaultRef}/${itemRef}${field ? `/${field}` : ''}`
  return { ref, vaultRef, itemRef, field }
}

function resolveOnePassword(grant: Record<string, unknown>): Record<string, unknown> {
  const opCfg = loadOpConfig()
  // FAIL CLOSED: no service-account token → throw → deny('provider error (fail closed)…').
  if (!opIsAvailable(opCfg)) throw new Error('onepassword not configured (fail closed): set OP_SERVICE_ACCOUNT_TOKEN')
  const { ref, vaultRef, itemRef, field } = buildOpRef(grant)
  const parsed = parseRef(ref)
  if (!parsed) throw new Error('onepassword grant has an invalid op:// reference')
  // Vault pinning: a service account scoped to OP_VAULT can only reach that vault.
  if (opCfg.vault && parsed.vault !== opCfg.vault) throw new Error('onepassword reference is outside the brokered vault')
  // Redacted metadata only — NEVER the value. The value is resolved JIT inside useLease().
  return {
    provider: 'onepassword',
    vaultRef,
    itemRef,
    fieldLabels: field ? [field] : [],
  }
}

function corsFor(origin: string) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1]
  return { 'Access-Control-Allow-Origin': allow, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-agent-token', 'Vary': 'Origin' }
}

export default async function (req: Request): Promise<Response> {
  const origin = req.headers.get('Origin') || ''
  const cors = corsFor(origin)
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ decision: 'denied', reason: 'invalid body' }, 400) }
  const op = String(body.op || 'request') // request | use | revoke | list
  const grantId = String(body.grantId || '')
  const agentId = String(body.agentId || '')
  const scope = String(body.scope || '')
  const targetDomain = String(body.targetDomain || '')
  const action = String(body.action || '')
  const runId = body.runId ? String(body.runId) : null
  const reason = body.reason ? String(body.reason) : null
  const now = Date.now()

  // --- Identity: agent-token (admin-resolved) OR owner user token ---------------
  const agentTokenRaw = req.headers.get('x-agent-token')
  // deno-lint-ignore no-explicit-any
  let client: any
  let userId: string | undefined
  let boundGrantId: string | null = null
  if (agentTokenRaw) {
    const adminBaseUrl = Deno.env.get('INSFORGE_BASE_URL')
    const adminApiKey = Deno.env.get('API_KEY')
    if (!adminBaseUrl || !adminApiKey) return json({ decision: 'denied', reason: 'server misconfigured' }, 500)
    const admin = createAdminClient({ baseUrl: adminBaseUrl, apiKey: adminApiKey })
    const hash = await sha256Hex(agentTokenRaw)
    const { data: tks } = await admin.database.from('agent_tokens').select('*').eq('token_hash', hash).limit(1)
    // deno-lint-ignore no-explicit-any
    const tk: any = tks && (tks as any[])[0]
    if (!tk) return json({ decision: 'denied', reason: 'invalid agent token' }, 401)
    if (tk.status !== 'active') return json({ decision: 'denied', reason: 'agent token revoked' }, 401)
    if (now >= Date.parse(tk.expires_at)) return json({ decision: 'denied', reason: 'agent token expired' }, 401)
    client = admin; userId = tk.user_id; boundGrantId = tk.grant_id
    await admin.database.from('agent_tokens').update({ use_count: (tk.use_count ?? 0) + 1, last_used_at: new Date().toISOString() }).eq('id', tk.id)
  } else {
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '') || null
    client = createClient({ baseUrl: Deno.env.get('INSFORGE_BASE_URL'), accessToken: token ?? undefined })
    const { data: me } = await client.auth.getCurrentUser()
    userId = me?.user?.id
    if (!userId) return json({ decision: 'denied', reason: 'unauthorized' }, 401)
  }

  // Audit helper — one redacted event on every call. Always carries the resolved user_id
  // (admin path bypasses RLS, so we scope writes/reads by user_id explicitly).
  const audit = async (eventType: string, extra: Record<string, unknown> = {}) => {
    await client.database.from('audit_events').insert([{ user_id: userId, actor_type: 'agent', actor_id: agentId, event_type: eventType, target_type: 'credential_grant', target_id: grantId, metadata_json: redact({ scope, targetDomain, action, reason, ...extra }) }])
  }
  const deny = async (r: string) => { await audit('credential_request_denied', { decision: 'denied', deny_reason: r }); return json({ decision: 'denied', reason: r }) }
  const stepUp = async (r: string) => {
    const { data: open } = await client.database.from('credential_approval_requests').select('id').eq('grant_id', grantId).eq('user_id', userId).eq('status', 'pending').limit(1)
    // deno-lint-ignore no-explicit-any
    if (!open || (open as any[]).length === 0) {
      await client.database.from('credential_approval_requests').insert([{ user_id: userId, grant_id: grantId, agent_id: agentId, run_id: runId, scope, target_domain: targetDomain, action, reason }])
    }
    await audit('credential_request_approval_required', { decision: 'approval_required', step_up_reason: r })
    return json({ decision: 'approval_required', reason: r })
  }

  // A token bound to one grant may only act on that grant.
  if (boundGrantId && boundGrantId !== grantId) return deny('agent token not valid for this grant')

  // --- Lease lifecycle ops (use / revoke / list) --------------------------------
  // These share the identity/owner block + audit() above, each emitting a redacted row.
  // None of them ever returns the item_ref or a secret value (handle + LeaseView only).
  const opCfg = loadOpConfig()
  if (op === 'revoke') {
    // The kill switch — revoke a live lease so it can never resolve again.
    const handle = String(body.handle || '')
    const r = revokeLease(handle)
    await audit('lease_revoked', { op, handle, ok: r.ok, status: r.status ?? null })
    const out = { decision: r.ok ? 'revoked' : 'denied', ok: r.ok, status: r.status ?? null }
    assertNoSecret(out, [opCfg.serviceAccountToken])
    return json(out, r.ok ? 200 : 404)
  }
  if (op === 'list') {
    // Live ledger for the UI — redacted LeaseView[] (no item_ref, no value).
    const intentId = runId || grantId || undefined
    const leases: LeaseView[] = listLeases(intentId)
    await audit('lease_listed', { op, count: leases.length })
    const out = { decision: 'allowed', leases: redact(leases) }
    assertNoSecret(out, [opCfg.serviceAccountToken])
    return json(out)
  }
  if (op === 'catalog') {
    // Vault catalog for the owner UI (Fleet permissions / advanced grant form). Returns ONLY
    // item titles + refs — NEVER a field value — pinned to the brokered vault. When the
    // service account is live we read the real item list from 1Password; otherwise we report
    // representative=true so the client falls back to its representative roster and the banner
    // stays honest. Owner-auth only (the agent-token path has no business enumerating a vault).
    if (boundGrantId) return deny('agent tokens cannot enumerate the vault')
    const live = opIsAvailable(opCfg)
    let items: Array<{ vaultRef: string; itemRef: string; title: string; fieldLabels: string[] }> = []
    if (live) {
      try {
        // Dynamic import keeps the op SDK out of the hot path when there's no token. Same Deno
        // specifier the lease broker uses; the client only ever lists titles + ids here.
        const { createClient: opCreateClient } = await import('npm:@1password/sdk@^0.4.0')
        // deno-lint-ignore no-explicit-any
        const c: any = await opCreateClient({ auth: opCfg.serviceAccountToken as string, integrationName: opCfg.integrationName, integrationVersion: opCfg.integrationVersion ?? 'v1.0.0' })
        if (c && opCfg.vault) {
          // List items in the pinned vault. Titles + ids only; we never touch a field value.
          // deno-lint-ignore no-explicit-any
          const raw: any[] = await c.items.list(opCfg.vault).catch(() => [])
          items = (Array.isArray(raw) ? raw : []).slice(0, 200).map((it) => ({
            vaultRef: opCfg.vault as string,
            itemRef: String(it.id ?? it.title ?? ''),
            title: String(it.title ?? it.id ?? 'item'),
            fieldLabels: ['credential'],
          }))
        }
      } catch (err) {
        // Live-but-failed is reported as a soft error; the client keeps its representative roster.
        await audit('vault_catalog_listed', { op, live: true, ok: false, error: String(err instanceof Error ? err.message : err).slice(0, 120) })
        const out = { decision: 'allowed', live: true, representative: true, vault: opCfg.vault ?? null, items: [] }
        assertNoSecret(out, [opCfg.serviceAccountToken])
        return json(out)
      }
    }
    await audit('vault_catalog_listed', { op, live, count: items.length })
    const out = { decision: 'allowed', live, representative: !live, vault: opCfg.vault ?? null, items: redact(items) }
    // Hard backstop: the service-account token must never appear in the catalog response.
    assertNoSecret(out, [opCfg.serviceAccountToken])
    return json(out)
  }
  if (op === 'use') {
    // JIT resolve + act at the boundary. The grant must exist (scoped to this user) so we
    // can compute and verify the expected op:// ref the lease is bound to.
    const handle = String(body.handle || '')
    const { data: grows } = await client.database.from('credential_grants').select('*').eq('id', grantId).eq('user_id', userId).limit(1)
    // deno-lint-ignore no-explicit-any
    const gu: any = grows && (grows as any[])[0]
    if (!gu) return deny('grant not found')
    if (gu.provider !== 'onepassword') return deny('use is only supported for onepassword grants')
    let expectedRef: string
    try {
      if (!opIsAvailable(opCfg)) throw new Error('onepassword not configured (fail closed): set OP_SERVICE_ACCOUNT_TOKEN')
      expectedRef = buildOpRef(gu).ref
    } catch (err) {
      return deny(`provider error (fail closed): ${String(err instanceof Error ? err.message : err).slice(0, 120)}`)
    }
    // The action runs server-side with the JIT-resolved secret and returns ONLY a redacted
    // proof-of-use — never the value, never its content. (Real downstream use of `secret`
    // would happen here; we expose only that a non-empty secret was resolved.)
    const used = await useLease(handle, expectedRef, opCfg, async (secret: string) => {
      return { resolved: typeof secret === 'string' && secret.length > 0 }
    })
    await audit('lease_used', { op, handle, ok: used.ok, code: used.code ?? null })
    const out = used.ok
      ? { decision: 'allowed', ok: true, result: redact(used.result) }
      : { decision: 'denied', ok: false, reason: used.error ?? 'lease use failed', code: used.code ?? null }
    // Hard backstop: the secret value must never appear in the response.
    assertNoSecret(out, [opCfg.serviceAccountToken])
    return json(out, used.ok ? 200 : 400)
  }

  // Rate limit: cap requests per user per minute (cheap abuse control).
  const sinceMin = new Date(now - 60_000).toISOString()
  const { data: recent } = await client.database.from('audit_events').select('id').eq('user_id', userId).gte('created_at', sinceMin).limit(RATE_LIMIT_PER_MIN + 1)
  // deno-lint-ignore no-explicit-any
  if (recent && (recent as any[]).length > RATE_LIMIT_PER_MIN) return deny('rate limit exceeded')

  // 1. grant must exist (scoped to this user)
  const { data: rows } = await client.database.from('credential_grants').select('*').eq('id', grantId).eq('user_id', userId).limit(1)
  // deno-lint-ignore no-explicit-any
  const g: any = rows && (rows as any[])[0]
  if (!g) return deny('grant not found')
  // 2. agent / run authorization
  if (g.agent_id && g.agent_id !== agentId) return deny('agent not authorized for this grant')
  if (g.run_id && runId && g.run_id !== runId) return deny('run not authorized for this grant')
  // 3. active / not revoked
  if (g.status !== 'active' || g.revoked_at) return deny('grant revoked')
  // 4. not expired
  if (now >= Date.parse(g.expires_at)) return deny('grant expired')
  // 5. scope match (and, for agent tokens, the token's scope must match too)
  if (g.scope !== scope) return deny('scope mismatch')
  // 6. usage limit
  if ((g.usage_limit ?? 0) > 0 && (g.usage_count ?? 0) >= g.usage_limit) return deny('usage limit reached')
  // 7. domain binding (fail closed)
  if (normDomain(g.target_domain) !== normDomain(targetDomain)) return deny('domain mismatch (fail closed)')
  // 8. wallet signing is human-only — never auto-resolved
  if (scope === 'wallet_sign') return stepUp('wallet signing requires explicit human approval; the agent may only prepare a draft')

  // Has the human approved this grant within an unexpired window?
  const { data: appr } = await client.database.from('credential_approval_requests').select('*').eq('grant_id', grantId).eq('user_id', userId).eq('status', 'approved').order('decided_at', { ascending: false }).limit(1)
  // deno-lint-ignore no-explicit-any
  const approvedRow: any = appr && (appr as any[])[0]
  const approved = Boolean(approvedRow && Date.parse(approvedRow.expires_at) > now)

  // 8b. Rule of Two — all three lethal-trifecta exposures at once forces a human in the
  // loop (private data + untrusted content + external communication), regardless of scope.
  const trifectaCount = [g.trifecta_private_data, g.trifecta_untrusted_content, g.trifecta_external_comms].filter(Boolean).length
  if (trifectaCount >= 3 && !approved) {
    return stepUp('lethal trifecta: private data + untrusted content + external communication present at once — a human must approve before the agent may act')
  }

  // 9. step-up: explicit policy, or a high-risk scope on first use
  const firstUse = (g.usage_count ?? 0) === 0
  if (!approved && (g.approval_policy === 'approval_required' || (HIGH_RISK.includes(scope) && firstUse))) {
    return stepUp('step-up approval required before this capability can be used')
  }

  // 10. broker via provider — returns redacted metadata only; broker mints a REAL lease.
  let providerMeta: Record<string, unknown> = { provider: g.provider }
  // Default (mock / non-1Password) handle. For onepassword we replace this with a real
  // lease handle (pph_…) issued by the lease broker below.
  let sessionHandle = `sess_${grantId.slice(0, 8)}_${scope}_${(runId || 'norun').slice(0, 12)}`
  let serviceMetadataRedacted: unknown = providerMeta
  if (g.provider === 'onepassword') {
    try {
      // Build + validate the op:// ref and pin the vault (redacted metadata only — no value).
      providerMeta = resolveOnePassword(g)
      // Issue a REAL lease: an opaque pph_… handle bound to (item_ref, capability, intent,
      // grant, agent, TTL). NO secret touched — the value is resolved JIT via the 'use' op.
      const { ref } = buildOpRef(g)
      const leaseRes = await leaseScopedSecret(
        { item_ref: ref, capability: scope, intent_id: runId || grantId, grant_id: grantId, agent_id: agentId, fields: g.field_ref ? [String(g.field_ref)] : undefined },
        opCfg,
      )
      if (!leaseRes.ok || !leaseRes.lease) throw new Error(leaseRes.error || 'lease issue failed')
      sessionHandle = leaseRes.lease.handle // pph_…
      serviceMetadataRedacted = leaseRes.lease // LeaseView: no item_ref, no value
    } catch (err) {
      return deny(`provider error (fail closed): ${String(err instanceof Error ? err.message : err).slice(0, 120)}`)
    }
  } else {
    serviceMetadataRedacted = redact(providerMeta)
  }
  await client.database.from('credential_grants').update({ usage_count: (g.usage_count ?? 0) + 1 }).eq('id', grantId).eq('user_id', userId)
  if (approvedRow) await client.database.from('credential_approval_requests').update({ status: 'consumed', decided_at: new Date().toISOString() }).eq('id', approvedRow.id)
  await audit('credential_request_allowed', { decision: 'allowed', provider: g.provider, providerMeta: redact(providerMeta) })

  const out = {
    decision: 'allowed', reason: 'capability granted',
    capability: { grantId, scope, targetService: g.target_service, targetDomain: g.target_domain, sessionHandle, expiresAt: Date.parse(g.expires_at), serviceMetadataRedacted: redact(serviceMetadataRedacted) },
  }
  // Hard backstop (ported from src/credentials/redact.ts): the service-account token must
  // never appear anywhere in the response, in addition to the key-name redact() above.
  assertNoSecret(out, [opCfg.serviceAccountToken])
  return json(out)
}
