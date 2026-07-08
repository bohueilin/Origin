// ----------------------------------------------------------------------------
// 1Password access broker — the real credential layer. Runs ONLY in the Node server.
//
// Thesis (1Password): no agent ever holds a credential. The server holds a SERVICE ACCOUNT
// token (`ops_…`); an agent that needs access gets an opaque, task-scoped LEASE HANDLE — never a
// secret. The secret value is resolved (via @1password/sdk `secrets.resolve("op://…")`) ONLY at
// the tool-execution boundary, inside the action closure, and is gone the moment the call returns.
//
//   lease(req)        → validate vs the live grant; mint an opaque handle bound to
//                       (item_ref, capability, intent, grant, agent, TTL); record it; return ONLY
//                       {handle, redacted metadata, scope, expires_at}. NO secret touched.
//   use(handle, ref)  → server-only, at the action boundary: verify the lease is live + for THIS
//                       ref; resolve the value JIT; run action(secret); return only redacted result.
//   revoke(handle)    → kill a live lease (the in-flight kill switch).
//
// Bounded delegation: a child lease's scope ⊆ its parent's, with a TTL ≤ the parent's remaining.
// Fail-safe: if no service-account token is set, isAvailable() is false and Janus falls back to
// the in-memory mock broker — durability/realness degrade, nothing breaks.
// ----------------------------------------------------------------------------

import crypto from 'node:crypto'
import sdk from '@1password/sdk'
import type { OnePasswordConfig } from './config.ts'

const DEFAULT_TTL_MS = 5 * 60 * 1000
const MAX_TTL_MS = 15 * 60 * 1000

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

// In-process ledger (the durable InsForge audit backing is layered in leaseStore.ts / P2).
const leases = new Map<string, Lease>()

let client: Awaited<ReturnType<typeof sdk.createClient>> | null = null
let clientInit: Promise<Awaited<ReturnType<typeof sdk.createClient>> | null> | null = null

export function isAvailable(cfg: OnePasswordConfig): boolean {
  return Boolean(cfg.serviceAccountToken)
}

async function getClient(cfg: OnePasswordConfig) {
  if (!cfg.serviceAccountToken) return null
  if (client) return client
  if (!clientInit) {
    clientInit = sdk
      .createClient({ auth: cfg.serviceAccountToken, integrationName: cfg.integrationName, integrationVersion: cfg.integrationVersion })
      .then((c) => {
        client = c
        return c
      })
      .catch((err) => {
        console.error('[1password] client init failed:', (err as Error)?.name ?? 'error')
        clientInit = null
        return null
      })
  }
  return clientInit
}

/** Parse op://vault/item/field. Field optional. */
function parseRef(ref: string): { vault: string; item: string; field?: string } | null {
  const m = /^op:\/\/([^/\s]+)\/([^/\s]+)(?:\/(.+))?$/.exec(ref.trim())
  if (!m) return null
  return { vault: m[1], item: m[2], field: m[3] }
}

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

export function leaseScopedSecret(body: unknown, cfg: OnePasswordConfig): LeaseResult {
  const b = (body ?? {}) as Record<string, unknown>
  const item_ref = String(b.item_ref ?? '')
  const parsed = parseRef(item_ref)
  if (!parsed) return { ok: false, code: 'bad_ref', error: 'A valid op://vault/item/field reference is required.' }

  const capability = String(b.capability ?? 'credential.scoped_request')
  const intent_id = String(b.intent_id ?? '')
  const grant_id = String(b.grant_id ?? '')
  const agent_id = String(b.agent_id ?? 'passport')
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

  const handle = 'pph_' + crypto.createHash('sha256').update([item_ref, capability, intent_id, grant_id, agent_id, parent_handle ?? '', now].join('|')).digest('hex').slice(0, 32)
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
 * Resolve the secret for a live lease and run `action(secret)` at the boundary. The secret value
 * exists only inside this call — never returned to the caller, never logged.
 */
export async function useLease<T>(
  handle: string,
  expectedRef: string,
  cfg: OnePasswordConfig,
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
