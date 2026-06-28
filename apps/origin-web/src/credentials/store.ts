// Owner-side persistence for the credential broker (InsForge, RLS-scoped to the
// signed-in user). This is the ACCOUNT OWNER managing their own integrations,
// grants, and wallets — never the agent runtime resolving a secret. No secret is
// ever written here: grants hold references, the audit log holds redacted metadata.
import { insforge } from '../insforge'
import { redact } from './redact'
import { REPRESENTATIVE_VAULT, REPRESENTATIVE_VAULT_NAME, type VaultItem } from './mockVault'
import { evaluatePolicy, type SessionKeyPolicy } from '../wallet/sessionPolicy'
import type {
  ApprovalPolicy,
  AuditEvent,
  CredentialGrant,
  CredentialScope,
  GrantStatus,
} from './types'

const T_GRANTS = 'credential_grants'
const T_INTEGRATIONS = 'integration_connections'
const T_WALLETS = 'wallet_connections'
const T_AUDIT = 'audit_events'
const T_APPROVALS = 'credential_approval_requests'
const T_WALLET_ACTIONS = 'wallet_action_requests'

function ms(ts: string | null | undefined): number {
  const n = Date.parse(ts ?? '')
  return Number.isFinite(n) ? n : 0
}

// ---- Grants -------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToGrant(r: any): CredentialGrant {
  return {
    id: r.id,
    userId: r.user_id,
    orgId: r.org_id ?? null,
    agentId: r.agent_id ?? null,
    runId: r.run_id ?? null,
    provider: r.provider,
    targetService: r.target_service,
    targetDomain: r.target_domain,
    vaultRef: r.vault_ref ?? null,
    itemRef: r.item_ref ?? null,
    scope: r.scope as CredentialScope,
    approvalPolicy: (r.approval_policy ?? 'approval_required') as ApprovalPolicy,
    expiresAt: ms(r.expires_at),
    usageLimit: r.usage_limit ?? 0,
    usageCount: r.usage_count ?? 0,
    status: (r.status ?? 'active') as GrantStatus,
    createdAt: ms(r.created_at),
    revokedAt: r.revoked_at ? ms(r.revoked_at) : null,
    trifectaPrivateData: Boolean(r.trifecta_private_data),
    trifectaUntrustedContent: Boolean(r.trifecta_untrusted_content),
    trifectaExternalComms: Boolean(r.trifecta_external_comms),
  }
}

/** A grant has effectively expired even if its stored status is still 'active'. */
export function effectiveStatus(g: CredentialGrant, now = Date.now()): GrantStatus {
  if (g.status === 'revoked') return 'revoked'
  if (now >= g.expiresAt) return 'expired'
  return 'active'
}

export interface NewGrantInput {
  agentId: string
  provider: string
  targetService: string
  targetDomain: string
  scope: CredentialScope
  approvalPolicy: ApprovalPolicy
  expiresAt: number // epoch ms
  usageLimit: number // 0 = unlimited
  vaultRef?: string | null
  itemRef?: string | null
  trifectaPrivateData?: boolean
  trifectaUntrustedContent?: boolean
  trifectaExternalComms?: boolean
}

export async function listGrants(): Promise<CredentialGrant[]> {
  if (!insforge) return []
  const { data, error } = await insforge.database.from(T_GRANTS).select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(rowToGrant)
}

export async function createGrant(input: NewGrantInput): Promise<CredentialGrant | null> {
  if (!insforge) return null
  const row = {
    agent_id: input.agentId.trim(),
    provider: input.provider,
    target_service: input.targetService.trim(),
    target_domain: input.targetDomain.trim().toLowerCase(),
    scope: input.scope,
    approval_policy: input.approvalPolicy,
    expires_at: new Date(input.expiresAt).toISOString(),
    usage_limit: Math.max(0, Math.floor(input.usageLimit)),
    usage_count: 0,
    status: 'active' as const,
    vault_ref: input.vaultRef ?? null,
    item_ref: input.itemRef ?? null,
    trifecta_private_data: Boolean(input.trifectaPrivateData),
    trifecta_untrusted_content: Boolean(input.trifectaUntrustedContent),
    trifecta_external_comms: Boolean(input.trifectaExternalComms),
  }
  const { data, error } = await insforge.database.from(T_GRANTS).insert([row]).select()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (error || !(data as any[])?.length) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grant = rowToGrant((data as any[])[0])
  await writeAudit({ actorType: 'user', eventType: 'grant_created', targetType: 'credential_grant', targetId: grant.id, metadata: { provider: grant.provider, service: grant.targetService, domain: grant.targetDomain, scope: grant.scope } })
  return grant
}

export async function revokeGrant(id: string): Promise<boolean> {
  if (!insforge) return false
  const { error } = await insforge.database.from(T_GRANTS).update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', id)
  if (error) return false
  await writeAudit({ actorType: 'user', eventType: 'grant_revoked', targetType: 'credential_grant', targetId: id, metadata: {} })
  return true
}

/** Kill switch — revoke ALL active agent authority at once: every grant, agent token,
 *  and wallet session key the user holds. RLS scopes this to the caller. Returns ok=false
 *  if ANY table failed, so the UI never claims success on a partial/total failure. */
export async function revokeAllAuthority(): Promise<{ ok: boolean }> {
  if (!insforge) return { ok: false }
  const ts = new Date().toISOString()
  const results = await Promise.allSettled([
    insforge.database.from(T_GRANTS).update({ status: 'revoked', revoked_at: ts }).eq('status', 'active'),
    insforge.database.from('agent_tokens').update({ status: 'revoked' }).eq('status', 'active'),
    insforge.database.from(T_SESSION_KEYS).update({ status: 'revoked', revoked_at: ts }).eq('status', 'active'),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ok = results.every((r) => r.status === 'fulfilled' && !(r.value as any)?.error)
  await writeAudit({ actorType: 'user', eventType: 'kill_switch_revoke_all', targetType: 'account', metadata: { ok } })
  return { ok }
}

// ---- Integrations -------------------------------------------------------------

export interface IntegrationConnection {
  id: string
  provider: string
  status: string
  metadata: Record<string, unknown>
  createdAt: number
  revokedAt: number | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToIntegration(r: any): IntegrationConnection {
  return { id: r.id, provider: r.provider, status: r.status ?? 'active', metadata: r.metadata_json ?? {}, createdAt: ms(r.created_at), revokedAt: r.revoked_at ? ms(r.revoked_at) : null }
}

export async function listIntegrations(): Promise<IntegrationConnection[]> {
  if (!insforge) return []
  const { data, error } = await insforge.database.from(T_INTEGRATIONS).select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(rowToIntegration)
}

export async function connectIntegration(provider: string, label: string, vault?: string): Promise<IntegrationConnection | null> {
  if (!insforge) return null
  // We store only a label + the vault NAME — never a vault token or service-account secret.
  // Real provider linking (the 1Password service account) happens server-side in the edge
  // function; the browser only ever records which vault the agents draw from. `vault` is the
  // human-readable vault name (e.g. "Origin-Demo-Vault"), persisted under metadata_json.vault.
  const row = { provider, status: 'linked_pending_server', metadata_json: redact({ label, ...(vault?.trim() ? { vault: vault.trim() } : {}) }) }
  const { data, error } = await insforge.database.from(T_INTEGRATIONS).insert([row]).select()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (error || !(data as any[])?.length) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = rowToIntegration((data as any[])[0])
  await writeAudit({ actorType: 'user', eventType: 'integration_connected', targetType: 'integration_connection', targetId: c.id, metadata: { provider, vault: vault?.trim() || null } })
  return c
}

/** Vault catalog for the owner UI (Fleet permissions + the advanced grant form). Titles +
 *  refs ONLY — never a value. Calls the broker's `op:'catalog'` op when reachable; if the
 *  broker is live (OP_SERVICE_ACCOUNT_TOKEN set) the real 1Password item list comes back,
 *  otherwise (or on any transport error) we fall back to the clearly-labeled representative
 *  roster so the whole assign/revoke/test pipeline still runs in demo mode. The returned
 *  `representative` flag drives the amber/green banner in the UI. */
export async function listVaultItems(): Promise<{ items: VaultItem[]; representative: boolean; live: boolean; vault: string | null }> {
  const fallback = { items: REPRESENTATIVE_VAULT, representative: true, live: false, vault: REPRESENTATIVE_VAULT_NAME }
  if (!insforge) return fallback
  try {
    const { data, error } = await insforge.functions.invoke('credential-broker', { body: { op: 'catalog' } })
    if (error || !data) return fallback
    const d = data as { live?: boolean; representative?: boolean; vault?: string | null; items?: Array<{ vaultRef: string; itemRef: string; title: string; fieldLabels?: string[] }> }
    // Live broker with a real item list → use it; otherwise stay on the representative roster.
    if (d.live && Array.isArray(d.items) && d.items.length > 0) {
      const items: VaultItem[] = d.items.map((it) => ({ vaultRef: it.vaultRef, itemRef: it.itemRef, title: it.title, fieldLabels: it.fieldLabels ?? ['credential'], representative: false }))
      return { items, representative: false, live: true, vault: d.vault ?? null }
    }
    return fallback
  } catch {
    return fallback
  }
}

export async function disconnectIntegration(id: string): Promise<void> {
  if (!insforge) return
  await insforge.database.from(T_INTEGRATIONS).update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', id)
  await writeAudit({ actorType: 'user', eventType: 'integration_disconnected', targetType: 'integration_connection', targetId: id, metadata: {} })
}

// ---- Wallets ------------------------------------------------------------------

export interface WalletConnection {
  id: string
  address: string
  network: string
  provider: string
  status: string
  verifiedAt: number | null // non-null only when ownership was proven via SIWE
  chainId: number | null
  createdAt: number
  revokedAt: number | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToWallet(r: any): WalletConnection {
  return { id: r.id, address: r.wallet_address, network: r.network, provider: r.provider ?? 'manual', status: r.status ?? 'active', verifiedAt: r.verified_at ? ms(r.verified_at) : null, chainId: r.chain_id ?? null, createdAt: ms(r.created_at), revokedAt: r.revoked_at ? ms(r.revoked_at) : null }
}

export async function listWallets(): Promise<WalletConnection[]> {
  if (!insforge) return []
  const { data, error } = await insforge.database.from(T_WALLETS).select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(rowToWallet)
}

export async function connectWallet(address: string, network: string): Promise<WalletConnection | null> {
  if (!insforge) return null
  // ONLY a public address + network. Never a seed phrase or private key — by design
  // the schema has no column for them, so a secret cannot be persisted here.
  const row = { wallet_address: address.trim(), network: network.trim(), provider: 'manual', status: 'active' as const }
  const { data, error } = await insforge.database.from(T_WALLETS).insert([row]).select()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (error || !(data as any[])?.length) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = rowToWallet((data as any[])[0])
  await writeAudit({ actorType: 'user', eventType: 'wallet_connected', targetType: 'wallet_connection', targetId: w.id, metadata: { network: w.network, address: w.address } })
  return w
}

export async function disconnectWallet(id: string): Promise<void> {
  if (!insforge) return
  await insforge.database.from(T_WALLETS).update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', id)
  await writeAudit({ actorType: 'user', eventType: 'wallet_disconnected', targetType: 'wallet_connection', targetId: id, metadata: {} })
}

// ---- Audit (append-only) ------------------------------------------------------

export interface AuditRow {
  id: string
  actorType: string
  actorId: string | null
  eventType: string
  targetType: string | null
  targetId: string | null
  metadata: Record<string, unknown>
  createdAt: number
}

export async function listAudit(limit = 100): Promise<AuditRow[]> {
  if (!insforge) return []
  const { data, error } = await insforge.database.from(T_AUDIT).select('*').order('created_at', { ascending: false }).limit(limit)
  if (error || !data) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((r) => ({ id: r.id, actorType: r.actor_type, actorId: r.actor_id ?? null, eventType: r.event_type, targetType: r.target_type ?? null, targetId: r.target_id ?? null, metadata: r.metadata_json ?? {}, createdAt: ms(r.created_at) }))
}

/** Append a redacted owner-action audit event. The table is append-only at the RLS
 *  layer (no UPDATE/DELETE), so the log is tamper-evident. */
export async function writeAudit(e: Pick<AuditEvent, 'actorType' | 'eventType'> & Partial<AuditEvent>): Promise<void> {
  if (!insforge) return
  const row = {
    actor_type: e.actorType,
    actor_id: e.actorId ?? null,
    event_type: e.eventType,
    target_type: e.targetType ?? null,
    target_id: e.targetId ?? null,
    metadata_json: redact(e.metadata ?? {}),
  }
  try { await insforge.database.from(T_AUDIT).insert([row]) } catch { /* audit is best-effort from the client */ }
}

// ---- Step-up approval requests ------------------------------------------------

export interface ApprovalRequest {
  id: string
  grantId: string | null
  agentId: string
  scope: CredentialScope
  targetDomain: string
  action: string
  reason: string | null
  status: string // pending | approved | denied | consumed | expired
  createdAt: number
  expiresAt: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToApproval(r: any): ApprovalRequest {
  return { id: r.id, grantId: r.grant_id ?? null, agentId: r.agent_id, scope: r.scope as CredentialScope, targetDomain: r.target_domain, action: r.action, reason: r.reason ?? null, status: r.status ?? 'pending', createdAt: ms(r.created_at), expiresAt: ms(r.expires_at) }
}

export async function listApprovalRequests(): Promise<ApprovalRequest[]> {
  if (!insforge) return []
  const { data, error } = await insforge.database.from(T_APPROVALS).select('*').order('created_at', { ascending: false }).limit(100)
  if (error || !data) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(rowToApproval)
}

/** Approve a step-up request. The grant's `approval_policy` is unchanged — approval is
 *  per-request (the broker consumes it once), never a standing permission. */
export async function decideApproval(id: string, decision: 'approved' | 'denied'): Promise<boolean> {
  if (!insforge) return false
  const { error } = await insforge.database.from(T_APPROVALS).update({ status: decision, decided_at: new Date().toISOString() }).eq('id', id)
  if (error) return false
  await writeAudit({ actorType: 'user', eventType: decision === 'approved' ? 'approval_granted' : 'approval_denied', targetType: 'credential_approval_request', targetId: id, metadata: {} })
  return true
}

// ---- Wallet action requests (prepare -> human sign) ---------------------------

export interface WalletActionRequest {
  id: string
  agentId: string
  actionType: string
  destinationAddress: string | null
  amount: string | null
  asset: string | null
  network: string | null
  status: string // prepared | approved | rejected | signed
  createdAt: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToWalletAction(r: any): WalletActionRequest {
  return { id: r.id, agentId: r.agent_id, actionType: r.action_type, destinationAddress: r.destination_address ?? null, amount: r.amount ?? null, asset: r.asset ?? null, network: r.network ?? null, status: r.status ?? 'prepared', createdAt: ms(r.created_at) }
}

export async function listWalletActions(): Promise<WalletActionRequest[]> {
  if (!insforge) return []
  const { data, error } = await insforge.database.from(T_WALLET_ACTIONS).select('*').order('created_at', { ascending: false }).limit(100)
  if (error || !data) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(rowToWalletAction)
}

export interface NewWalletDraft { agentId: string; walletConnectionId: string; destination: string; amount: string; asset: string; network: string }

/** Record a transaction DRAFT an agent prepared (scope `wallet_prepare`). No signing —
 *  the agent can never sign; a human reviews and signs out-of-band. */
export async function prepareWalletAction(d: NewWalletDraft): Promise<WalletActionRequest | null> {
  if (!insforge) return null
  const row = {
    agent_id: d.agentId.trim(), wallet_connection_id: d.walletConnectionId, action_type: 'transfer',
    destination_address: d.destination.trim(), amount: d.amount.trim(), asset: d.asset.trim(), network: d.network.trim(),
    transaction_payload_redacted: redact({ to: d.destination, amount: d.amount, asset: d.asset }), status: 'prepared' as const,
  }
  const { data, error } = await insforge.database.from(T_WALLET_ACTIONS).insert([row]).select()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (error || !(data as any[])?.length) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wa = rowToWalletAction((data as any[])[0])
  await writeAudit({ actorType: 'agent', actorId: d.agentId, eventType: 'wallet_action_prepared', targetType: 'wallet_action_request', targetId: wa.id, metadata: { network: d.network, asset: d.asset } })
  return wa
}

/** A human approves or rejects a prepared draft. Approval marks it ready to sign — the
 *  actual signature still happens out-of-band in the user's own wallet. */
export async function decideWalletAction(id: string, decision: 'approved' | 'rejected'): Promise<boolean> {
  if (!insforge) return false
  const { error } = await insforge.database.from(T_WALLET_ACTIONS).update({ status: decision, decided_at: new Date().toISOString() }).eq('id', id)
  if (error) return false
  await writeAudit({ actorType: 'user', eventType: decision === 'approved' ? 'wallet_action_approved' : 'wallet_action_rejected', targetType: 'wallet_action_request', targetId: id, metadata: {} })
  return true
}

// ---- Wallet session keys (bounded autonomy) -----------------------------------

const T_SESSION_KEYS = 'wallet_session_keys'

export interface SessionKey extends SessionKeyPolicy {
  id: string
  walletConnectionId: string | null
  createdAt: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSessionKey(r: any): SessionKey {
  return {
    id: r.id, walletConnectionId: r.wallet_connection_id ?? null, agentId: r.agent_id,
    chainId: r.chain_id ?? 8453, asset: r.asset ?? 'ETH', decimals: r.decimals ?? 18,
    maxPerTx: String(r.max_per_tx ?? '0'), maxPerWindow: String(r.max_per_window ?? '0'),
    windowSeconds: r.window_seconds ?? 86_400, allowlist: Array.isArray(r.allowlist) ? r.allowlist : [],
    expiresAt: ms(r.expires_at), status: (r.status === 'revoked' ? 'revoked' : 'active'), createdAt: ms(r.created_at),
  }
}

export async function listSessionKeys(): Promise<SessionKey[]> {
  if (!insforge) return []
  const { data, error } = await insforge.database.from(T_SESSION_KEYS).select('*').order('created_at', { ascending: false }).limit(100)
  if (error || !data) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(rowToSessionKey)
}

export interface NewSessionKey {
  walletConnectionId: string; agentId: string; chainId: number; asset: string; decimals: number
  maxPerTx: string; maxPerWindow: string; windowSeconds: number; allowlist: string[]; expiresAt: number
}

export async function createSessionKey(k: NewSessionKey): Promise<SessionKey | null> {
  if (!insforge) return null
  const row = {
    wallet_connection_id: k.walletConnectionId, agent_id: k.agentId.trim(), chain_id: k.chainId, asset: k.asset,
    decimals: k.decimals, max_per_tx: k.maxPerTx || '0', max_per_window: k.maxPerWindow || '0',
    window_seconds: k.windowSeconds, allowlist: k.allowlist.map((a) => a.trim()).filter(Boolean),
    expires_at: new Date(k.expiresAt).toISOString(), status: 'active' as const,
  }
  const { data, error } = await insforge.database.from(T_SESSION_KEYS).insert([row]).select()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (error || !(data as any[])?.length) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sk = rowToSessionKey((data as any[])[0])
  await writeAudit({ actorType: 'user', eventType: 'session_key_created', targetType: 'wallet_session_key', targetId: sk.id, metadata: { agentId: sk.agentId, asset: sk.asset, maxPerTx: sk.maxPerTx, allowlist: sk.allowlist.length } })
  return sk
}

export async function revokeSessionKey(id: string): Promise<boolean> {
  if (!insforge) return false
  const { error } = await insforge.database.from(T_SESSION_KEYS).update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', id)
  if (error) return false
  await writeAudit({ actorType: 'user', eventType: 'session_key_revoked', targetType: 'wallet_session_key', targetId: id, metadata: {} })
  return true
}

export interface GovernedPrepareResult { ok: boolean; request?: WalletActionRequest; violations?: string[]; error?: string }

/** Prepare a wallet draft UNDER a session-key policy. If an active session key exists for
 *  (wallet, agent), the draft is checked against its caps + allowlist BEFORE a human ever
 *  sees it — a policy violation is refused, not queued. This mirrors the on-chain
 *  ERC-4337 session-key validation. With no session key, the draft is queued for human
 *  review with no autonomous bound (the human is the only gate). */
export async function prepareWalletActionGoverned(d: NewWalletDraft): Promise<GovernedPrepareResult> {
  if (!insforge) return { ok: false, error: 'not configured' }
  const keys = await listSessionKeys()
  const key = keys.find((k) => k.walletConnectionId === d.walletConnectionId && k.agentId === d.agentId && k.status === 'active')
  if (key) {
    // Sum prior approved spend for this wallet+asset within the rolling window.
    const since = new Date(Date.now() - key.windowSeconds * 1000).toISOString()
    const { data: prior } = await insforge.database.from(T_WALLET_ACTIONS).select('amount,asset,status,created_at').eq('wallet_connection_id', d.walletConnectionId).eq('asset', d.asset).eq('status', 'approved').gte('created_at', since)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priorSum = ((prior as any[]) ?? []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
    const verdict = evaluatePolicy(key, { to: d.destination, amount: d.amount, asset: d.asset, chainId: key.chainId }, { priorWindowSpend: String(priorSum) })
    if (!verdict.allowed) {
      await writeAudit({ actorType: 'agent', actorId: d.agentId, eventType: 'wallet_action_refused_by_policy', targetType: 'wallet_session_key', targetId: key.id, metadata: { violations: verdict.violations, asset: d.asset, amount: d.amount } })
      return { ok: false, violations: verdict.violations }
    }
  }
  const request = await prepareWalletAction(d)
  return request ? { ok: true, request } : { ok: false, error: 'could not prepare draft' }
}

// ---- Agent-runtime broker (server-side edge function) -------------------------

export interface BrokerResponse { decision: 'allowed' | 'denied' | 'approval_required'; reason: string; capability?: unknown }

/** Invoke the deployed `credential-broker` edge function as an agent would. Used by the
 *  UI to exercise the real server-side pipeline (e.g. to populate the approval queue). */
export async function brokerRequest(input: { grantId: string; agentId: string; runId?: string; scope: CredentialScope; targetDomain: string; action: string; reason?: string }): Promise<BrokerResponse | null> {
  if (!insforge) return null
  try {
    const { data, error } = await insforge.functions.invoke('credential-broker', { body: input })
    // A transport error is "we don't know", NOT a policy denial — return null so the UI
    // shows a neutral "unreachable" message instead of a red "Denied".
    if (error || !data) return null
    return data as BrokerResponse
  } catch {
    return null
  }
}

/** Mint a restricted, grant-bound opaque agent token. Returned once; we never see it
 *  again (only its hash is stored server-side). The agent uses it via `x-agent-token`. */
export async function mintAgentToken(grantId: string): Promise<{ token: string; expiresAt: string } | null> {
  if (!insforge) return null
  try {
    const { data, error } = await insforge.functions.invoke('agent-token-mint', { body: { grantId } })
    if (error || !data?.token) return null
    return data as { token: string; expiresAt: string }
  } catch {
    return null
  }
}

// ---- Snaplii payment broker (server-side edge function) -----------------------
// A real money-path broker. The Snaplii key lives ONLY on the server; the browser
// (and any agent) never sees it. Every purchase is a four-step, server-brokered,
// one-shot flow — connect (once) → quote → authorize (the human-approval gate) →
// purchase — and is capped server-side ($25/buy, $50/day). SIMULATION is the default
// (no real money) until the owner flips SNAPLII_LIVE=1.

/** Result of `snaplii-broker` `connect`: the live/simulation mode and the linked brand. */
export interface SnapliiConnectResult {
  ok: boolean
  connected: boolean
  scope?: string // e.g. PAY_WRITE
  live: boolean // false ⇒ SIMULATION mode (approved buys are simulated, no real money)
  brand: { id: string; name: string } | null
  note?: string
  error?: string
}

/** Result of `snaplii-broker` `quote`: the real price + cashback for an intended buy. */
export interface SnapliiQuoteResult {
  ok: boolean
  amount?: number
  currency?: string // 'USD'
  cashback?: number
  brand?: string
  quote_claim?: string // opaque, signed; pass to authorize
  error?: string
  code?: 'no_key' | 'over_cap' | 'upstream' | 'bad_request'
}

/** Result of `snaplii-broker` `authorize`: the HUMAN-APPROVAL step. Exchanges a quote
 *  claim for a one-shot approval token. This is the moment a human authorizes the spend. */
export interface SnapliiAuthorizeResult {
  ok: boolean
  approval_token?: string // one-shot; pass to purchase
  error?: string
  code?: 'bad_quote' | 'over_cap' | 'insecure_secret'
}

/** Result of `snaplii-broker` `purchase`: redeems a one-shot approval token. `simulated`
 *  is true unless the owner enabled LIVE mode (real spend). */
export interface SnapliiPurchaseResult {
  ok: boolean
  simulated?: boolean
  amount?: number
  currency?: string
  brand?: string
  masked_code?: string // redacted redemption code
  message?: string
  error?: string
  code?: 'no_token' | 'bad_token' | 'replayed' | 'mode_mismatch' | 'no_key' | 'upstream' | 'uncertain'
}

// The money path goes through the SDK's `functions.invoke`, which attaches the live session
// bearer automatically (the @insforge/sdk does NOT persist the token to localStorage, so a
// hand-read of localStorage was always null → spurious 401). `functionsUrl` (src/insforge.ts)
// makes invoke CORS-correct. We keep fail-closed money-path semantics: the SDK returns
// `{ data, error }` (no throw on HTTP errors), and `InsForgeError.statusCode` preserves precise
// 401 (not signed in) vs 403 (signed in, NOT the Origin owner) messaging.
async function invokeFn<T>(slug: string, body: Record<string, unknown>): Promise<T> {
  if (!insforge) throw new Error('not configured')
  const { data, error } = await insforge.functions.invoke(slug, { body })
  if (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) throw new Error('Sign in as the Origin owner to authorize a purchase.')
    if (status === 403) throw new Error('This account is not the Origin owner — only the owner can authorize a purchase.')
    throw new Error(error.message || `Snaplii broker error${status ? ` (${status})` : ''}`)
  }
  if (!data) throw new Error('Snaplii broker returned no data')
  return data as T
}

/** Mint a server-side Passport "run claim" bound to {owner, amount, intent}. The browser cannot
 *  forge it (HMAC, server-only secret); the hardened broker's `quote` requires it, so out-of-band
 *  direct broker purchases are rejected.
 *
 *  Degrade-when-absent: if the `snaplii-run-claim` function isn't deployed yet (404), we return
 *  `degraded:true` with no claim so the flow proceeds against a broker that doesn't require one.
 *  A real owner-denial (401/403) still hard-fails. Net effect: the run-claim binding self-activates
 *  the moment the hardened backend (function + `ORIGIN_OWNER_EMAILS`) is deployed — no frontend change. */
export async function snapliiRunClaim(amount: number, intent: string): Promise<{ ok?: boolean; run_claim?: string; expiresAt?: number; error?: string; degraded?: boolean }> {
  if (!insforge) return { ok: false, error: 'not configured' }
  const { data, error } = await insforge.functions.invoke('snaplii-run-claim', { body: { amount, intent } })
  if (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 404) return { ok: true, degraded: true } // function not deployed → broker doesn't require a claim
    if (status === 401) return { ok: false, error: 'Sign in as the Origin owner to authorize a purchase.' }
    if (status === 403) return { ok: false, error: 'This account is not the Origin owner — only the owner can authorize a purchase.' }
    return { ok: false, error: error.message || 'Run claim refused.' }
  }
  return (data ?? { ok: false, error: 'Run claim returned no data.' }) as { ok?: boolean; run_claim?: string; expiresAt?: number; error?: string }
}

/** Probe the broker once up front: are we connected, what brand, and are we LIVE or in
 *  SIMULATION? The key is resolved server-side; nothing secret crosses the wire. */
export async function snapliiConnect(): Promise<SnapliiConnectResult> {
  return invokeFn<SnapliiConnectResult>('snaplii-broker', { action: 'connect' })
}

/** Get the real price + cashback for an intended buy. The hardened broker requires the
 *  server-minted `runClaim` (binding owner+amount+intent); when run-claim minting degraded
 *  (function not deployed), it's omitted and a non-hardened broker quotes without it. Returns a
 *  signed `quote_claim` to carry into the approval step. */
export async function snapliiQuote(amount: number, intent: string, runClaim?: string): Promise<SnapliiQuoteResult> {
  const body: Record<string, unknown> = { action: 'quote', amount, intent }
  if (runClaim) body.run_claim = runClaim
  return invokeFn<SnapliiQuoteResult>('snaplii-broker', body)
}

/** THE HUMAN-APPROVAL STEP. Exchange a quote claim for a one-shot approval token. Calling
 *  this is the human authorizing the spend — the agent can never reach it on its own. */
export async function snapliiAuthorize(quoteClaim: string): Promise<SnapliiAuthorizeResult> {
  return invokeFn<SnapliiAuthorizeResult>('snaplii-broker', { action: 'authorize', quote_claim: quoteClaim })
}

/** Redeem a one-shot approval token. The broker enforces single-use server-side — a
 *  replayed token fails closed (`code: 'replayed'`). `simulated` unless LIVE mode is on. */
export async function snapliiPurchase(approvalToken: string): Promise<SnapliiPurchaseResult> {
  return invokeFn<SnapliiPurchaseResult>('snaplii-broker', { action: 'purchase', approval_token: approvalToken })
}

/** Invoke the `account-delete` edge function to purge the signed-in user's data. */
export async function purgeAccountData(): Promise<{ ok: boolean; note?: string } | null> {
  if (!insforge) return null
  try {
    const { data, error } = await insforge.functions.invoke('account-delete', { body: { confirm: 'DELETE' } })
    if (error) return { ok: false }
    return data as { ok: boolean; note?: string }
  } catch {
    return { ok: false }
  }
}
