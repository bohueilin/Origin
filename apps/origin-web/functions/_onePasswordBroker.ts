// ----------------------------------------------------------------------------
// 1Password access broker — Deno edge port of the real credential layer.
//
// Thesis (1Password): no agent ever holds a credential. The edge function holds a
// SERVICE ACCOUNT token (`ops_…`); an agent that needs access gets an opaque,
// task-scoped LEASE HANDLE (`pph_…`) — never a secret. The secret value is resolved
// (via @1password/sdk `secrets.resolve("op://…")`) ONLY at the tool-execution
// boundary, inside the action closure, and is gone the moment the call returns.
//
//   leaseScopedSecret(req) → validate vs the live grant; mint an opaque handle bound to
//                            (item_ref, capability, intent, grant, agent, TTL); record it;
//                            return ONLY {handle, redacted LeaseView}. NO secret touched.
//   useLease(handle, ref)  → server-only, at the action boundary: verify the lease is live
//                            + for THIS ref; resolve the value JIT; run action(secret);
//                            return only a REDACTED result.
//   revokeLease(handle)    → kill a live lease (the in-flight kill switch).
//   listLeases(intentId)   → redacted LeaseView[] for the UI ledger.
//
// Bounded delegation: a child lease's scope ⊆ its parent's, with a TTL ≤ the parent's
// remaining. Vault pinning: a service account scoped to OP_VAULT can only reach that vault.
// Fail-safe: if no service-account token is set, isAvailable() is false and the caller
// falls back to the in-memory mock broker — durability/realness degrade, nothing breaks.
//
// NOTE: a Deno edge isolate may be cold per request; the in-process `Map` ledger below is
// only safe within a SINGLE invocation (issue→use→revoke in one call). A multi-call
// issue→use→revoke across invocations needs a durable InsForge-backed ledger (e.g. a
// `credential_leases` table) — left as a documented follow-up (do NOT create the migration
// in this task).
// ----------------------------------------------------------------------------

// Deno resolves npm specifiers natively; this is the same SDK repo A imports as `@1password/sdk`.
import { createClient as opCreateClient } from 'npm:@1password/sdk@^0.4.0'

const DEFAULT_TTL_MS = 5 * 60 * 1000
const MAX_TTL_MS = 15 * 60 * 1000

/** Local config for the Deno port — built from Deno.env, never a hard-coded secret. */
export interface OpConfig {
  serviceAccountToken?: string
  vault?: string
  integrationName: string
  integrationVersion?: string
}

/** Build OpConfig from the edge environment (the token never leaves this function). */
export function loadOpConfig(): OpConfig {
  return {
    serviceAccountToken: Deno.env.get('OP_SERVICE_ACCOUNT_TOKEN') || undefined,
    vault: Deno.env.get('OP_VAULT') || undefined,
    integrationName: 'OriginPhysicalAI',
    integrationVersion: 'v1.0.0',
  }
}

export type LeaseStatus = 'active' | 'expired' | 'revoked'

export interface Lease {
  handle: string
  item_ref: string // op://vault/item/field — server-side only
  item_title: string // redacted: item name only, never a value
  field_labels: string[]
  capability: string
  scope: string
  intent_id: string
  grant_id: string
  agent_id: string
  parent_handle: string | null
  issued_at: number
  expires_at: number
  status: LeaseStatus
  uses: number
  last_used_at: number | null
}

/** What crosses back to the client: NEVER the item_ref or a value. */
export interface LeaseView {
  handle: string
  item_title: string
  field_labels: string[]
  capability: string
  scope: string
  agent_id: string
  parent_handle: string | null
  issued_at: number
  expires_at: number
  status: LeaseStatus
  uses: number
}

// In-process ledger (single-invocation only — see the cold-isolate NOTE in the header).
const leases = new Map<string, Lease>()

// deno-lint-ignore no-explicit-any
let client: any = null
// deno-lint-ignore no-explicit-any
let clientInit: Promise<any> | null = null

export function isAvailable(cfg: OpConfig): boolean {
  return Boolean(cfg.serviceAccountToken)
}

async function getClient(cfg: OpConfig) {
  if (!cfg.serviceAccountToken) return null
  if (client) return client
  if (!clientInit) {
    clientInit = opCreateClient({
      auth: cfg.serviceAccountToken,
      integrationName: cfg.integrationName,
      integrationVersion: cfg.integrationVersion ?? 'v1.0.0',
    })
      // deno-lint-ignore no-explicit-any
      .then((c: any) => {
        client = c
        return c
      })
      // deno-lint-ignore no-explicit-any
      .catch((err: any) => {
        console.error('[1password] client init failed:', (err as Error)?.name ?? 'error')
        clientInit = null
        return null
      })
  }
  return clientInit
}

/** sha256 → hex (Web Crypto). Ported from credential-broker.ts so handle minting is async. */
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Parse op://vault/item/field. Field optional. */
export function parseRef(ref: string): { vault: string; item: string; field?: string } | null {
  const m = /^op:\/\/([^/\s]+)\/([^/\s]+)(?:\/(.+))?$/.exec(ref.trim())
  if (!m) return null
  return { vault: m[1], item: m[2], field: m[3] }
}

/** Strip item_ref and any value — the only shape that ever crosses back to a caller. */
function view(l: Lease): LeaseView {
  return {
    handle: l.handle,
    item_title: l.item_title,
    field_labels: l.field_labels,
    capability: l.capability,
    scope: l.scope,
    agent_id: l.agent_id,
    parent_handle: l.parent_handle,
    issued_at: l.issued_at,
    expires_at: l.expires_at,
    status: l.status,
    uses: l.uses,
  }
}

function sweep(now: number): void {
  for (const l of leases.values()) if (l.status === 'active' && now >= l.expires_at) l.status = 'expired'
}

export interface LeaseResult {
  ok: boolean
  lease?: LeaseView
  error?: string
  code?: 'bad_ref' | 'bad_request' | 'parent_missing' | 'scope_escalation' | 'ttl_escalation'
}

/**
 * Issue an opaque, task-scoped lease handle. Validates the ref, pins the vault, enforces
 * bounded delegation + TTL clamps, and records the lease. NEVER touches the secret value.
 * Async because handle minting now uses Web Crypto sha256.
 */
export async function leaseScopedSecret(body: unknown, cfg: OpConfig): Promise<LeaseResult> {
  const b = (body ?? {}) as Record<string, unknown>
  const item_ref = String(b.item_ref ?? '')
  const parsed = parseRef(item_ref)
  if (!parsed) return { ok: false, code: 'bad_ref', error: 'A valid op://vault/item/field reference is required.' }

  const capability = String(b.capability ?? 'credential.scoped_request')
  const intent_id = String(b.intent_id ?? '')
  const grant_id = String(b.grant_id ?? '')
  const agent_id = String(b.agent_id ?? 'agent')
  const fields = Array.isArray(b.fields) ? b.fields.map(String).slice(0, 12) : parsed.field ? [parsed.field] : []
  const parent_handle = b.parent_handle ? String(b.parent_handle) : null
  const now = Date.now()
  sweep(now)

  // Vault pinning (defense in depth): a service account scoped to OP_VAULT can only reach that vault.
  if (cfg.vault && parsed.vault !== cfg.vault) {
    return { ok: false, code: 'scope_escalation', error: `Reference is outside the brokered vault (${cfg.vault}).` }
  }

  let ttl = Math.min(MAX_TTL_MS, Math.max(30_000, Number(b.ttl_ms) > 0 ? Number(b.ttl_ms) : DEFAULT_TTL_MS))

  // Bounded delegation: a child lease cannot exceed its parent's scope or remaining lifetime.
  if (parent_handle) {
    const parent = leases.get(parent_handle)
    if (!parent || parent.status !== 'active') return { ok: false, code: 'parent_missing', error: 'Parent lease is missing, expired, or revoked.' }
    if (parsed.vault !== parseRef(parent.item_ref)?.vault) return { ok: false, code: 'scope_escalation', error: 'Child lease must stay within the parent vault.' }
    if (!fields.every((f) => parent.field_labels.length === 0 || parent.field_labels.includes(f))) {
      return { ok: false, code: 'scope_escalation', error: 'Child lease requests a field outside the parent scope.' }
    }
    const parentRemaining = parent.expires_at - now
    if (ttl > parentRemaining) ttl = parentRemaining // child TTL ≤ parent remaining
  }

  const digest = await sha256Hex([item_ref, capability, intent_id, grant_id, agent_id, parent_handle ?? '', now].join('|'))
  const handle = 'pph_' + digest.slice(0, 32)
  const lease: Lease = {
    handle,
    item_ref,
    item_title: parsed.item,
    field_labels: fields,
    capability,
    scope: capability,
    intent_id,
    grant_id,
    agent_id,
    parent_handle,
    issued_at: now,
    expires_at: now + ttl,
    status: 'active',
    uses: 0,
    last_used_at: null,
  }
  leases.set(handle, lease)
  return { ok: true, lease: view(lease) }
}

export interface UseResult<T> {
  ok: boolean
  result?: T
  error?: string
  code?: 'no_lease' | 'expired' | 'revoked' | 'ref_mismatch' | 'no_client' | 'resolve_failed' | 'action_failed'
}

/**
 * Resolve the secret for a live lease and run `action(secret)` at the boundary. The secret
 * value exists ONLY inside this call — never returned to the caller, never logged. The
 * caller's `action` must itself return only a redacted/non-secret result.
 */
export async function useLease<T>(
  handle: string,
  expectedRef: string,
  cfg: OpConfig,
  action: (secret: string) => Promise<T>,
): Promise<UseResult<T>> {
  const now = Date.now()
  sweep(now)
  const lease = leases.get(handle)
  if (!lease) return { ok: false, code: 'no_lease', error: 'No such lease.' }
  if (lease.status === 'revoked') return { ok: false, code: 'revoked', error: 'Lease was revoked.' }
  if (lease.status === 'expired' || now >= lease.expires_at) {
    lease.status = 'expired'
    return { ok: false, code: 'expired', error: 'Lease has expired.' }
  }
  if (lease.item_ref !== expectedRef) return { ok: false, code: 'ref_mismatch', error: 'Lease does not authorize this reference.' }

  const c = await getClient(cfg)
  if (!c) return { ok: false, code: 'no_client', error: '1Password is not configured.' }

  let secret: string
  try {
    secret = await c.secrets.resolve(lease.item_ref) // JIT resolution — value only lives below
  } catch (err) {
    console.error('[1password] resolve failed:', (err as Error)?.name ?? 'error')
    return { ok: false, code: 'resolve_failed', error: 'Could not resolve the secret from 1Password.' }
  }
  try {
    const result = await action(secret)
    lease.uses += 1
    lease.last_used_at = now
    return { ok: true, result }
  } catch (err) {
    console.error('[1password] brokered action failed:', (err as Error)?.name ?? 'error')
    return { ok: false, code: 'action_failed', error: 'The brokered action failed.' }
  }
}

/** The in-flight kill switch — revoke a live lease so it can never resolve again. */
export function revokeLease(handle: string): { ok: boolean; status?: LeaseStatus } {
  const lease = leases.get(handle)
  if (!lease) return { ok: false }
  if (lease.status === 'active') lease.status = 'revoked'
  return { ok: true, status: lease.status }
}

/** Live ledger for the UI — redacted views only; never the item_ref or a value. */
export function listLeases(intentId?: string): LeaseView[] {
  sweep(Date.now())
  return [...leases.values()]
    .filter((l) => !intentId || l.intent_id === intentId)
    .sort((a, b) => b.issued_at - a.issued_at)
    .map(view)
}

/** Test seam: clear the in-process ledger. */
export function _resetLeases(): void {
  leases.clear()
}
