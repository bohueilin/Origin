// Account Settings — the owner-facing surface for the credential broker. Tabs:
// Integrations · Agent Permissions · Wallets · Audit · Danger Zone. Everything here
// is the account owner managing their own data (RLS-scoped); no secret is shown or
// stored. Grants are scoped, time-limited, and revocable; the audit log is read-only.
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthProvider'
import {
  brokerRequest, connectIntegration, connectWallet, createGrant, createSessionKey, decideApproval, decideWalletAction,
  disconnectIntegration, disconnectWallet, effectiveStatus, listApprovalRequests, listAudit, listGrants,
  listIntegrations, listSessionKeys, listVaultItems, listWalletActions, listWallets, mintAgentToken, prepareWalletActionGoverned, purgeAccountData,
  revokeAllAuthority, revokeGrant, revokeSessionKey,
  snapliiAuthorize, snapliiConnect, snapliiPurchase, snapliiQuote, snapliiRunClaim,
  type ApprovalRequest, type AuditRow, type IntegrationConnection, type NewGrantInput, type SessionKey,
  type SnapliiConnectResult, type SnapliiPurchaseResult, type SnapliiQuoteResult,
  type WalletActionRequest, type WalletConnection,
} from '../credentials/store'
import { type VaultItem } from '../credentials/mockVault'
import { FleetPermissions } from './FleetPermissions'
import type { ApprovalPolicy, CredentialGrant, CredentialScope } from '../credentials/types'
import { describePolicy } from '../wallet/sessionPolicy'
import { useDialog } from './useDialog'
import { getMyRole, roleLabel, isStaff, type Role } from '../roleStore'
import { adminListAccounts, adminAssignRole, listMyTickets, adminListTickets, adminUpdateTicket, adminListAudit, adminListUserTemplates, adminViewTemplate, type AdminAccount, type SupportTicket, type AdminTicket, type AuditEntry, type UserTemplate, type TemplateDetail } from '../adminStore'
import { SupportForm } from '../components/SupportForm'
import { hasInjectedWallet, linkWalletWithSiwe } from '../wallet/siwe'
import './accountSettings.css'

type Tab = 'overview' | 'integrations' | 'fleet' | 'permissions' | 'approvals' | 'wallets' | 'support' | 'admin' | 'audit' | 'danger'

const TABS: { id: Tab; label: string; staffOnly?: boolean }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'integrations', label: 'Credential vault' },
  { id: 'fleet', label: 'Fleet permissions' },
  { id: 'permissions', label: 'Agent permissions' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'wallets', label: 'Wallets' },
  { id: 'support', label: 'Support' },
  { id: 'admin', label: 'Admin', staffOnly: true },
  { id: 'audit', label: 'Audit log' },
  { id: 'danger', label: 'Danger zone' },
]

// The finish / escalate / refuse triad is the spine of the whole surface: allowed = go,
// approval_required = pause for a human, denied/revoked = stop. Map any audit event to it.
type Tone = 'go' | 'wait' | 'stop' | 'flat'
function auditTone(eventType: string): Tone {
  if (/denied|refused|revoked|disconnected|purged|expired/.test(eventType)) return 'stop'
  if (/approval_required/.test(eventType)) return 'wait'
  if (/allowed|granted|approved|verified|created|minted|connected|prepared/.test(eventType)) return 'go'
  return 'flat'
}
function eventLabel(t: string): string {
  return t.replace(/_/g, ' ').replace(/\bcredential request\b/, 'request')
}

const SCOPES: { id: CredentialScope; label: string; note: string; risk: 'low' | 'high' | 'wallet' }[] = [
  { id: 'api_read', label: 'API read', note: 'Read-only API access.', risk: 'low' },
  { id: 'login_session', label: 'Login session', note: 'Open a logged-in session.', risk: 'low' },
  { id: 'cli_auth', label: 'CLI auth', note: 'Authenticate a CLI.', risk: 'low' },
  { id: 'website_login', label: 'Website login', note: 'Log in to an approved site. Approval required on first use.', risk: 'high' },
  { id: 'wallet_prepare', label: 'Wallet — prepare', note: 'Draft a transaction. No signing. Approval required on first use.', risk: 'high' },
  { id: 'wallet_sign', label: 'Wallet — sign', note: 'Signing is human-only. The agent can never sign autonomously.', risk: 'wallet' },
]

// Wall-clock read kept in a module-level helper so component bodies stay pure
// (react-hooks/purity flags lexical Date.now() inside components, not helper calls).
const nowMs = () => Date.now()

function fmtDate(ms: number): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function relExpiry(ms: number): string {
  const d = ms - Date.now()
  if (d <= 0) return 'expired'
  const days = Math.floor(d / 86_400_000)
  if (days >= 1) return `in ${days}d`
  const hrs = Math.floor(d / 3_600_000)
  if (hrs >= 1) return `in ${hrs}h`
  return `in ${Math.max(1, Math.floor(d / 60_000))}m`
}

export function AccountSettings({ onClose }: { onClose: () => void }) {
  const auth = useAuth()
  const [tab, setTab] = useState<Tab>('overview')
  const [role, setRole] = useState<Role>('user')
  const shellRef = useDialog<HTMLDivElement>(onClose)

  useEffect(() => { let alive = true; void getMyRole().then((r) => { if (alive) setRole(r) }); return () => { alive = false } }, [])
  // Admin tab is hidden for non-staff. (The DB also rejects admin RPCs from non-staff —
  // this is convenience, not the gate.)
  const visibleTabs = TABS.filter((t) => !t.staffOnly || isStaff(role))

  return (
    <div className="cset-overlay" role="dialog" aria-modal="true" aria-label="Account settings" onClick={onClose}>
      <div className="cset-shell" ref={shellRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <aside className="cset-rail">
          <div className="cset-rail-head">
            <strong>{auth.user?.name || 'Account'}</strong>
            <span>{auth.user?.email}</span>
            <span className={`cset-role-badge role-${role}`}>{roleLabel(role)}</span>
          </div>
          <nav className="cset-nav" aria-label="Settings sections">
            {visibleTabs.map((t) => (
              <button key={t.id} className={`cset-nav-item${tab === t.id ? ' is-active' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="cset-rail-foot">Agents act through scoped, revocable grants — never your raw secrets.</div>
        </aside>
        <section className="cset-main">
          <button className="cset-x" aria-label="Close" onClick={onClose}>×</button>
          {tab === 'overview' && <OverviewTab onJump={setTab} />}
          {tab === 'integrations' && <IntegrationsTab />}
          {tab === 'fleet' && <FleetPermissions />}
          {tab === 'permissions' && <PermissionsTab />}
          {tab === 'approvals' && <ApprovalsTab />}
          {tab === 'wallets' && <WalletsTab />}
          {tab === 'support' && <SupportTab />}
          {tab === 'admin' && <AdminTab role={role} />}
          {tab === 'audit' && <AuditTab />}
          {tab === 'danger' && <DangerTab />}
        </section>
      </div>
    </div>
  )
}

// ---- Overview (security posture at a glance) ----------------------------------

function OverviewTab({ onJump }: { onJump: (t: Tab) => void }) {
  const [grants, setGrants] = useState<CredentialGrant[] | null>(null)
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [wallets, setWallets] = useState<WalletConnection[]>([])
  const [keys, setKeys] = useState<SessionKey[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [g, a, w, k, au] = await Promise.all([listGrants(), listApprovalRequests(), listWallets(), listSessionKeys(), listAudit(40)])
      if (!alive) return
      setGrants(g); setApprovals(a); setWallets(w); setKeys(k); setAudit(au)
    })()
    return () => { alive = false }
  }, [])

  const now = nowMs()
  const activeGrants = (grants ?? []).filter((g) => effectiveStatus(g, now) === 'active').length
  const pending = approvals.filter((a) => a.status === 'pending' && a.expiresAt > now).length
  const verifiedWallets = wallets.filter((w) => w.verifiedAt && w.status !== 'revoked').length
  const activeKeys = keys.filter((k) => k.status === 'active' && k.expiresAt > now).length
  const refused24 = audit.filter((e) => auditTone(e.eventType) === 'stop' && e.createdAt > now - 86_400_000).length
  const loading = grants === null

  const headline = loading ? 'Reading your security posture…'
    : pending > 0 ? `${pending} action${pending > 1 ? 's' : ''} need your approval`
    : activeGrants === 0 ? 'No agent can act on your behalf yet'
    : 'Your agents are operating within the limits you set'

  return (
    <div className="cset-panel">
      <header className="cset-h">
        <h2>Security overview</h2>
        <p>Agents act through scoped, revocable grants and prove ownership before touching a wallet. Nothing here can read a secret — every action is brokered and logged.</p>
      </header>

      <div className="cset-posture" data-tone={pending > 0 ? 'wait' : activeGrants === 0 ? 'flat' : 'go'}>
        <span className="cset-posture-dot" aria-hidden="true" />
        <strong>{headline}</strong>
      </div>

      <div className="cset-stats">
        <button className="cset-stat" onClick={() => onJump('permissions')}>
          <span className="cset-stat-n">{loading ? '—' : activeGrants}</span>
          <span className="cset-stat-l">Active grants</span>
        </button>
        <button className="cset-stat" data-tone={pending > 0 ? 'wait' : 'flat'} onClick={() => onJump('approvals')}>
          <span className="cset-stat-n">{loading ? '—' : pending}</span>
          <span className="cset-stat-l">Awaiting approval</span>
        </button>
        <button className="cset-stat" onClick={() => onJump('wallets')}>
          <span className="cset-stat-n">{loading ? '—' : verifiedWallets}</span>
          <span className="cset-stat-l">Verified wallets</span>
        </button>
        <button className="cset-stat" onClick={() => onJump('wallets')}>
          <span className="cset-stat-n">{loading ? '—' : activeKeys}</span>
          <span className="cset-stat-l">Session keys</span>
        </button>
        <button className="cset-stat" data-tone={refused24 > 0 ? 'stop' : 'flat'} onClick={() => onJump('audit')}>
          <span className="cset-stat-n">{loading ? '—' : refused24}</span>
          <span className="cset-stat-l">Refused · 24h</span>
        </button>
      </div>

      <h3 className="cset-subh">Live governance feed</h3>
      <ListOrEmpty rows={loading ? null : audit.slice(0, 8)} empty="No activity yet. When an agent requests a capability, it shows here.">
        {audit.slice(0, 8).map((e) => (
          <div key={e.id} className="cset-feed-row" data-tone={auditTone(e.eventType)}>
            <span className="cset-feed-dot" aria-hidden="true" />
            <span className="cset-feed-label">{eventLabel(e.eventType)}</span>
            <span className="cset-feed-meta">{e.actorType === 'agent' ? `agent ${e.actorId ?? ''}` : e.actorType}{e.targetType ? ` · ${e.targetType.replace(/_/g, ' ')}` : ''}</span>
            <time className="cset-feed-time">{fmtDate(e.createdAt)}</time>
          </div>
        ))}
      </ListOrEmpty>
    </div>
  )
}

// ---- Integrations -------------------------------------------------------------

function IntegrationsTab() {
  const [rows, setRows] = useState<IntegrationConnection[] | null>(null)
  const [label, setLabel] = useState('')
  const [vault, setVault] = useState('')
  const [busy, setBusy] = useState(false)
  // Live-vs-representative is authoritatively decided by the broker's catalog probe
  // (live only when OP_SERVICE_ACCOUNT_TOKEN is set). isRepresentative() is the default.
  const [representative, setRepresentative] = useState(true)
  const [vaultName, setVaultName] = useState<string | null>(null)
  const reload = async () => { const r = await listIntegrations(); setRows(r) }
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [r, cat] = await Promise.all([listIntegrations(), listVaultItems()])
      if (!alive) return
      setRows(r); setRepresentative(cat.representative); setVaultName(cat.vault)
    })()
    return () => { alive = false }
  }, [])

  async function add() {
    if (!label.trim()) return
    setBusy(true)
    await connectIntegration('onepassword', label.trim(), vault.trim() || undefined)
    setLabel(''); setVault(''); setBusy(false); await reload()
  }

  return (
    <div className="cset-panel">
      <header className="cset-h">
        <h2>Credential vault (1Password)</h2>
        <p>Link the 1Password vault your agents draw from. Origin stores only a label + the vault name — never your service-account token or any secret. When an agent needs a credential, the server leases it from this vault just-in-time and hands the agent an opaque handle, never the value.</p>
      </header>

      <div className={`fp-banner ${representative ? 'rep' : 'live'}`}>
        <span className={`fp-banner-pill ${representative ? 'rep' : 'live'}`}>
          {representative ? 'Representative vault — demo mode' : '1Password vault linked — broker live'}
        </span>
        <span className="fp-banner-text">
          {representative
            ? <>The broker is running against a clearly-labeled representative vault ({vaultName ?? 'Origin-Demo-Vault'}). Set <code>OP_SERVICE_ACCOUNT_TOKEN</code> on the broker to go live.</>
            : <>The broker is leasing secrets just-in-time from your live 1Password vault ({vaultName}).</>}
        </span>
      </div>

      <div className="cset-row-add">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label — e.g. Work 1Password" aria-label="Integration label" />
        <input value={vault} onChange={(e) => setVault(e.target.value)} placeholder="Vault name — e.g. Origin-Demo-Vault" aria-label="Vault name" />
        <button className="cset-btn" onClick={add} disabled={busy || !label.trim()}>Link vault</button>
      </div>
      <ListOrEmpty rows={rows} empty="No vault linked yet. Link the 1Password vault your agents should draw from.">
        {(rows ?? []).map((r) => (
          <div key={r.id} className="cset-item">
            <div className="cset-item-main">
              <strong>{String((r.metadata.label as string) || r.provider)}</strong>
              <span className="cset-meta">
                {r.provider}{r.metadata.vault ? <> · vault <code>{String(r.metadata.vault)}</code></> : ''} · <Status s={r.status === 'revoked' ? 'revoked' : 'pending'} /> · linked {fmtDate(r.createdAt)}
              </span>
            </div>
            {r.status !== 'revoked' && <button className="cset-link-danger" onClick={async () => { await disconnectIntegration(r.id); setRows(await listIntegrations()) }}>Disconnect</button>}
          </div>
        ))}
      </ListOrEmpty>
    </div>
  )
}

// ---- Agent permissions (grants) ----------------------------------------------

const DURATIONS = [
  { label: '1 hour', ms: 3_600_000 },
  { label: '24 hours', ms: 86_400_000 },
  { label: '7 days', ms: 7 * 86_400_000 },
  { label: '30 days', ms: 30 * 86_400_000 },
]

function PermissionsTab() {
  const [rows, setRows] = useState<CredentialGrant[] | null>(null)
  const [form, setForm] = useState(false)
  const reload = async () => { const r = await listGrants(); setRows(r) }
  useEffect(() => { let alive = true; (async () => { const r = await listGrants(); if (alive) setRows(r) })(); return () => { alive = false } }, [])

  return (
    <div className="cset-panel">
      <header className="cset-h">
        <h2>Agent permissions</h2>
        <p>Each grant is one agent · one service · one domain · one scope — time-limited and revocable. The agent receives a brokered capability, never the secret.</p>
      </header>
      {!form && <button className="cset-btn" onClick={() => setForm(true)}>+ New grant</button>}
      {form && <GrantForm onDone={async () => { setForm(false); await reload() }} onCancel={() => setForm(false)} />}
      <ListOrEmpty rows={rows} empty="No grants yet. A new grant lets a specific agent act on one service, within limits you set.">
        {(rows ?? []).map((g) => <GrantRow key={g.id} g={g} onChange={reload} />)}
      </ListOrEmpty>
    </div>
  )
}

function GrantRow({ g, onChange }: { g: CredentialGrant; onChange: () => Promise<void> }) {
  const st = effectiveStatus(g)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState('')

  // Exercise the real server-side broker as an agent would. Demonstrates the live
  // pipeline: an allowed call bumps usage; a step-up scope lands in Approvals.
  async function test() {
    setBusy(true); setNote('')
    const res = await brokerRequest({ grantId: g.id, agentId: g.agentId ?? '', runId: g.runId ?? undefined, scope: g.scope, targetDomain: g.targetDomain, action: 'simulated agent request', reason: 'owner test from settings' })
    setBusy(false)
    if (!res) { setNote('Broker unreachable.'); return }
    setNote(res.decision === 'allowed' ? 'Allowed — capability issued (no secret).' : res.decision === 'approval_required' ? 'Step-up required — see the Approvals tab.' : `Denied — ${res.reason}.`)
    await onChange()
  }

  async function mint() {
    setBusy(true); setNote('')
    const res = await mintAgentToken(g.id)
    setBusy(false)
    if (!res) { setNote('Could not mint token.'); return }
    setToken(res.token)
  }

  return (
    <div className="cset-item col">
      <div className="cset-item-row">
        <div className="cset-item-main">
          <strong>{g.targetService} <span className="cset-scope">{g.scope}</span>{[g.trifectaPrivateData, g.trifectaUntrustedContent, g.trifectaExternalComms].filter(Boolean).length >= 3 && <span className="cset-badge watch" title="All three lethal-trifecta exposures present — every action requires your approval">trifecta · human-gated</span>}</strong>
          <span className="cset-meta">
            agent <code>{g.agentId}</code> · {g.targetDomain} · <Status s={st} />
            {st === 'active' && <> · expires {relExpiry(g.expiresAt)}</>}
            {' · '}{g.usageLimit > 0 ? `${g.usageCount}/${g.usageLimit} uses` : 'unlimited uses'}
            {g.approvalPolicy === 'approval_required' && ' · step-up'}
          </span>
        </div>
        {st === 'active' && (
          <div className="cset-item-actions">
            <button className="cset-link" onClick={test} disabled={busy}>{busy ? 'Testing…' : 'Test'}</button>
            <button className="cset-link" title="Issue the agent an opaque, grant-bound token (no database access)" onClick={mint} disabled={busy}>Mint token</button>
            <button className="cset-link-danger" disabled={busy} onClick={async () => { setBusy(true); setNote(''); const ok = await revokeGrant(g.id); setBusy(false); if (!ok) { setNote('Could not revoke — try again.'); return } await onChange() }}>Revoke</button>
          </div>
        )}
      </div>
      {token && (
        <div className="cset-token">
          <span className="cset-token-label">Agent token — copy now, it won't be shown again. It grants no database access and works only for this grant.</span>
          <code className="cset-token-val">{token}</code>
          <button className="cset-link" onClick={async () => { try { await navigator.clipboard.writeText(token); setNote('Copied.') } catch { setNote('Copy failed — select the token above and copy it manually.') } }}>Copy</button>
          <button className="cset-link-danger" onClick={() => setToken('')}>Dismiss</button>
        </div>
      )}
      {note && <div className={`cset-rowmsg ${note.startsWith('Allowed') || note === 'Copied.' ? 'ok' : note.startsWith('Step-up') ? 'wait' : 'deny'}`}>{note}</div>}
    </div>
  )
}

function GrantForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [agentId, setAgentId] = useState('')
  const [service, setService] = useState('')
  const [domain, setDomain] = useState('')
  const [scope, setScope] = useState<CredentialScope>('api_read')
  const [durIdx, setDurIdx] = useState(1)
  const [usageLimit, setUsageLimit] = useState(5)
  const [priv, setPriv] = useState(false)
  const [untrusted, setUntrusted] = useState(false)
  const [external, setExternal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Vault catalog — so an advanced grant can point at a real vault item and resolve.
  const [catalog, setCatalog] = useState<VaultItem[]>([])
  const [itemRef, setItemRef] = useState('')
  useEffect(() => { let alive = true; void listVaultItems().then((c) => { if (alive) setCatalog(c.items) }); return () => { alive = false } }, [])

  const trifectaCount = [priv, untrusted, external].filter(Boolean).length

  const scopeMeta = useMemo(() => SCOPES.find((s) => s.id === scope)!, [scope])
  const provider = scope.startsWith('wallet') ? 'wallet' : 'onepassword'
  const selectedItem = catalog.find((it) => it.itemRef === itemRef) ?? null
  // High-risk + wallet scopes are forced to step-up approval.
  const policy: ApprovalPolicy = scopeMeta.risk === 'low' ? 'auto_low_risk' : 'approval_required'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!agentId.trim() || !service.trim() || !domain.trim()) { setErr('Agent ID, service, and domain are required.'); return }
    if (provider === 'onepassword' && !selectedItem) { setErr('Pick a vault credential so the broker can resolve this grant.'); return }
    setBusy(true)
    const input: NewGrantInput = {
      agentId, provider,
      targetService: service, targetDomain: domain, scope, approvalPolicy: policy,
      expiresAt: Date.now() + DURATIONS[durIdx].ms, usageLimit,
      // For onepassword grants, carry the vaultRef/itemRef so the broker can build a valid
      // op://vault/item ref and lease the secret JIT — without this the grant is unresolvable.
      vaultRef: selectedItem?.vaultRef ?? null,
      itemRef: selectedItem?.itemRef ?? null,
      trifectaPrivateData: priv, trifectaUntrustedContent: untrusted, trifectaExternalComms: external,
    }
    const created = await createGrant(input)
    setBusy(false)
    if (!created) { setErr('Could not create the grant. Check your connection and try again.'); return }
    onDone()
  }

  return (
    <form className="cset-form" onSubmit={submit}>
      <div className="cset-grid">
        <label className="cset-field"><span>Agent ID</span><input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="travel-concierge" required /></label>
        <label className="cset-field"><span>Service</span><input value={service} onChange={(e) => setService(e.target.value)} placeholder="Acme Airlines" required /></label>
        <label className="cset-field"><span>Domain</span><input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="api.acme.com" required /></label>
        <label className="cset-field"><span>Scope</span>
          <select value={scope} onChange={(e) => setScope(e.target.value as CredentialScope)}>
            {SCOPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        {provider === 'onepassword' && (
          <label className="cset-field"><span>Vault credential</span>
            <select value={itemRef} onChange={(e) => setItemRef(e.target.value)}>
              <option value="">Select a vault item…</option>
              {catalog.map((it) => <option key={it.itemRef} value={it.itemRef}>{it.title} ({it.itemRef})</option>)}
            </select>
          </label>
        )}
        <label className="cset-field"><span>Expires</span>
          <select value={durIdx} onChange={(e) => setDurIdx(Number(e.target.value))}>
            {DURATIONS.map((d, i) => <option key={d.label} value={i}>{d.label}</option>)}
          </select>
        </label>
        <label className="cset-field"><span>Usage limit (0 = unlimited)</span><input type="number" min={0} value={usageLimit} onChange={(e) => setUsageLimit(Number(e.target.value))} /></label>
      </div>
      <p className={`cset-scope-note risk-${scopeMeta.risk}`}>{scopeMeta.note} {policy === 'approval_required' && scopeMeta.risk !== 'wallet' && 'You will approve each first use.'}</p>

      <fieldset className="cset-trifecta">
        <legend>Exposure — Rule of Two</legend>
        <p className="cset-trifecta-help">Declare what this agent can reach. If all three are on, Origin forces your approval on every action — an agent that can touch private data, read untrusted content, and talk to the outside world at once can be turned against you by one hidden instruction.</p>
        <label className="cset-check"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Reads private data</label>
        <label className="cset-check"><input type="checkbox" checked={untrusted} onChange={(e) => setUntrusted(e.target.checked)} /> Exposed to untrusted content</label>
        <label className="cset-check"><input type="checkbox" checked={external} onChange={(e) => setExternal(e.target.checked)} /> Can communicate externally</label>
        {trifectaCount >= 3 && <div className="cset-rowmsg wait">All three present — every action will require your approval (lethal trifecta).</div>}
      </fieldset>

      {err && <div className="cset-err">{err}</div>}
      <div className="cset-form-actions">
        <button type="button" className="cset-btn ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="cset-btn" disabled={busy}>{busy ? 'Creating…' : 'Create grant'}</button>
      </div>
    </form>
  )
}

// ---- Approvals (step-up + wallet actions) ------------------------------------

function ApprovalsTab() {
  const [approvals, setApprovals] = useState<ApprovalRequest[] | null>(null)
  const [wallet, setWallet] = useState<WalletActionRequest[] | null>(null)
  const [note, setNote] = useState('')
  // Record an explicit decision and confirm it; never silently swallow a failed write on
  // a security-critical yes/no.
  const decide = async (run: () => Promise<boolean>, okText: string) => {
    setNote(''); const ok = await run()
    if (!ok) { setNote('Could not record your decision — try again.'); return }
    setNote(okText); await reload()
  }
  // Filter for "pending + unexpired" at fetch time (Date.now() outside render keeps the
  // component pure); reload after every decision refreshes the view.
  const reload = async () => {
    const now = nowMs()
    const [a, w] = await Promise.all([listApprovalRequests(), listWalletActions()])
    setApprovals(a.filter((x) => x.status === 'pending' && x.expiresAt > now))
    setWallet(w.filter((x) => x.status === 'prepared'))
  }
  useEffect(() => { let alive = true; (async () => {
    const now = nowMs()
    const [a, w] = await Promise.all([listApprovalRequests(), listWalletActions()])
    if (alive) { setApprovals(a.filter((x) => x.status === 'pending' && x.expiresAt > now)); setWallet(w.filter((x) => x.status === 'prepared')) }
  })(); return () => { alive = false } }, [])

  const pendingApprovals = approvals ?? []
  const pendingWallet = wallet ?? []

  return (
    <div className="cset-panel">
      <header className="cset-h">
        <h2>Approvals</h2>
        <p>Sensitive actions stop here for your explicit yes. Each approval is single-use — the agent consumes it once and must ask again next time. Nothing here exposes a secret.</p>
      </header>
      {note && <div className={`cset-rowmsg ${note.includes('Could not') ? 'deny' : 'ok'}`}>{note}</div>}

      <h3 className="cset-subh">Step-up requests</h3>
      <ListOrEmpty rows={pendingApprovals.length ? pendingApprovals : (approvals === null ? null : [])} empty="No pending step-up requests. Run “Test” on a step-up grant to create one.">
        {pendingApprovals.map((a) => (
          <div key={a.id} className="cset-item">
            <div className="cset-item-main">
              <strong>{a.action} <span className="cset-scope">{a.scope}</span></strong>
              <span className="cset-meta">agent <code>{a.agentId}</code> · {a.targetDomain} · expires {relExpiry(a.expiresAt)}{a.reason ? ` · ${a.reason}` : ''}</span>
            </div>
            <div className="cset-item-actions">
              <button className="cset-link-danger" onClick={() => decide(() => decideApproval(a.id, 'denied'), 'Denied.')}>Deny</button>
              <button className="cset-btn small" onClick={() => decide(() => decideApproval(a.id, 'approved'), 'Approved.')}>Approve</button>
            </div>
          </div>
        ))}
      </ListOrEmpty>

      <h3 className="cset-subh">Wallet transactions to sign</h3>
      <ListOrEmpty rows={pendingWallet.length ? pendingWallet : (wallet === null ? null : [])} empty="No transactions awaiting approval. Agents can only prepare drafts — you always sign.">
        {pendingWallet.map((w) => (
          <div key={w.id} className="cset-item">
            <div className="cset-item-main">
              <strong>{w.amount} {w.asset} → <span className="cset-addr">{w.destinationAddress}</span></strong>
              <span className="cset-meta">agent <code>{w.agentId}</code> · {w.network} · prepared {fmtDate(w.createdAt)}</span>
            </div>
            <div className="cset-item-actions">
              <button className="cset-link-danger" onClick={() => decide(() => decideWalletAction(w.id, 'rejected'), 'Rejected.')}>Reject</button>
              <button className="cset-btn small" onClick={() => decide(() => decideWalletAction(w.id, 'approved'), 'Approved — ready to sign.')}>Approve to sign</button>
            </div>
          </div>
        ))}
      </ListOrEmpty>
    </div>
  )
}

// ---- Snaplii payment wallet (real server-brokered money path) -----------------

// Human-readable, fail-closed copy for every broker error code. Anything unexpected
// resolves to a generic refusal — a payment path must never render an unknown code as
// if it were benign.
function snapliiCodeNote(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'over_cap': return 'Over the spend cap. The broker refused before any charge — per-buy $25, daily $50.'
    case 'insecure_secret': return 'Refused — the server key failed its integrity check. Failing closed; no spend.'
    case 'replayed': return 'This approval was already used. One-shot tokens can never be replayed — no second charge.'
    case 'uncertain': return 'The outcome could not be confirmed. Failing closed and treating it as not purchased — verify before retrying.'
    case 'mode_mismatch': return 'Live/simulation mode changed mid-flow. Refused to be safe — reconnect and try again.'
    case 'bad_token': return 'That approval token is not valid. No purchase was made.'
    case 'bad_quote': return 'That quote is no longer valid. Request a fresh quote.'
    case 'no_token': return 'No approval token — the human-approval step has not been completed.'
    case 'no_key': return 'No payment key is configured on the server yet. Nothing was charged.'
    case 'upstream': return 'Snaplii was unreachable. No charge was made — try again shortly.'
    case 'bad_request': return 'The broker rejected the request. Check the amount and try again.'
    default: return fallback
  }
}

const fmtUsd = (n: number | undefined) => (typeof n === 'number' ? `$${n.toFixed(2)}` : '—')

type SnapliiStep = 'idle' | 'quoted' | 'done'

function SnapliiCard() {
  const [conn, setConn] = useState<SnapliiConnectResult | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connErr, setConnErr] = useState('')

  // Test-purchase flow state.
  const [amount, setAmount] = useState('15')
  const [intent, setIntent] = useState('DoorDash dinner order')
  const [step, setStep] = useState<SnapliiStep>('idle')
  const [busy, setBusy] = useState(false)
  const [quote, setQuote] = useState<SnapliiQuoteResult | null>(null)
  const [result, setResult] = useState<SnapliiPurchaseResult | null>(null)
  const [flowErr, setFlowErr] = useState('')

  async function connect() {
    setConnecting(true); setConnErr('')
    try {
      const r = await snapliiConnect()
      if (!r.ok || !r.connected) { setConnErr(snapliiCodeNote(undefined, r.error || 'Could not connect to Snaplii. Try again.')); return }
      setConn(r)
    } catch (e) { setConnErr(e instanceof Error ? e.message : 'Snaplii broker unreachable.') }
    finally { setConnecting(false) }
  }

  function resetFlow() { setStep('idle'); setQuote(null); setResult(null); setFlowErr('') }

  async function runQuote() {
    const usd = parseFloat(amount)
    if (!Number.isFinite(usd) || usd <= 0) { setFlowErr('Enter a positive USD amount.'); return }
    const useIntent = intent.trim() || 'passport-wallet-test'
    setBusy(true); setFlowErr(''); setResult(null)
    try {
      // Server-mint the Passport run claim first (binds owner+amount+intent); quote requires it.
      const rc = await snapliiRunClaim(usd, useIntent)
      if (!rc.ok) { setFlowErr(rc.error || 'Could not start the purchase (run claim refused).'); setStep('idle'); return }
      // rc.run_claim may be undefined when minting degraded (function not deployed); the broker
      // quotes without it. A real owner-denial already returned ok:false above.
      const q = await snapliiQuote(usd, useIntent, rc.run_claim)
      if (!q.ok) { setFlowErr(snapliiCodeNote(q.code, q.error || 'Could not get a quote.')); setStep('idle'); return }
      setQuote(q); setStep('quoted')
    } catch (e) { setFlowErr(e instanceof Error ? e.message : 'Quote failed.'); setStep('idle') }
    finally { setBusy(false) }
  }

  // The human-approval step. authorize() IS the moment the human authorizes spend; we
  // chain straight into purchase() so the one-shot approval token never lingers.
  async function approveAndBuy() {
    if (!quote?.quote_claim) { setFlowErr('Missing quote — request a quote first.'); return }
    setBusy(true); setFlowErr('')
    try {
      const auth = await snapliiAuthorize(quote.quote_claim)
      if (!auth.ok || !auth.approval_token) { setFlowErr(snapliiCodeNote(auth.code, auth.error || 'Authorization was refused.')); return }
      const p = await snapliiPurchase(auth.approval_token)
      if (!p.ok) { setFlowErr(snapliiCodeNote(p.code, p.error || 'Purchase failed.')); return }
      setResult(p); setStep('done')
    } catch (e) { setFlowErr(e instanceof Error ? e.message : 'Approval failed.') }
    finally { setBusy(false) }
  }

  const live = conn?.live === true

  return (
    <div className="cset-snaplii">
      <div className="cset-snaplii-head">
        <div className="cset-snaplii-brandmark" aria-hidden="true">S</div>
        <div className="cset-snaplii-title">
          <strong>Snaplii</strong>
          <span className="cset-meta">Server-brokered payment wallet · capped &amp; one-shot</span>
        </div>
        {conn && (
          <span className={`cset-mode-pill ${live ? 'live' : 'sim'}`} title={live ? 'LIVE — approved buys spend real money' : 'SIMULATION — approved buys are simulated, no real money'}>
            {live ? 'LIVE' : 'SIMULATION'}
          </span>
        )}
      </div>

      {!conn ? (
        <div className="cset-snaplii-connect">
          <p className="cset-meta">
            Connect Snaplii to let an agent pay at a brand on your behalf — without ever holding the key.
            Every purchase is brokered server-side, capped, one-shot, and requires your explicit approval.
          </p>
          {connErr && <div className="cset-rowmsg deny">{connErr}</div>}
          <button className="cset-btn" onClick={connect} disabled={connecting}>{connecting ? 'Connecting…' : 'Connect Snaplii'}</button>
        </div>
      ) : (
        <>
          <div className="cset-snaplii-facts">
            <div className="cset-fact">
              <span className="cset-fact-l">Brand</span>
              <span className="cset-fact-v">{conn.brand?.name ?? '—'}</span>
            </div>
            <div className="cset-fact">
              <span className="cset-fact-l">Scope</span>
              <span className="cset-fact-v mono">{conn.scope ?? 'PAY_WRITE'}</span>
            </div>
            <div className="cset-fact">
              <span className="cset-fact-l">Per buy</span>
              <span className="cset-fact-v mono">$25.00</span>
            </div>
            <div className="cset-fact">
              <span className="cset-fact-l">Per day</span>
              <span className="cset-fact-v mono">$50.00</span>
            </div>
          </div>
          {conn.note && <p className="cset-meta cset-snaplii-note">{conn.note}</p>}

          <div className="cset-snaplii-flow">
            <h4 className="cset-snaplii-flow-h">Run a test purchase</h4>
            <p className="cset-meta">Exercise the real broker end to end. The key stays on the server; you authorize the spend by hand.</p>

            <div className="cset-snaplii-inputs">
              <label className="cset-field"><span>Amount (USD)</span>
                <input value={amount} inputMode="decimal" onChange={(e) => { setAmount(e.target.value); resetFlow() }} aria-label="Amount in USD" />
              </label>
              <label className="cset-field"><span>Intent</span>
                <input value={intent} onChange={(e) => { setIntent(e.target.value); resetFlow() }} placeholder="what is this buy for?" aria-label="Purchase intent" />
              </label>
              <button className="cset-btn ghost cset-snaplii-quote-btn" onClick={runQuote} disabled={busy}>{busy && step === 'idle' ? 'Quoting…' : 'Quote'}</button>
            </div>

            {step !== 'idle' && quote && (
              <div className="cset-quote-card">
                <div className="cset-quote-line"><span>Price</span><strong className="mono">{fmtUsd(quote.amount)} {quote.currency ?? 'USD'}</strong></div>
                <div className="cset-quote-line"><span>Cashback</span><strong className="mono cset-cashback">+{fmtUsd(quote.cashback)}</strong></div>
                <div className="cset-quote-line"><span>Brand</span><strong>{quote.brand ?? conn.brand?.name ?? '—'}</strong></div>
              </div>
            )}

            {step === 'quoted' && (
              <div className="cset-approve">
                <div className="cset-approve-copy">
                  <strong>You are authorizing this spend</strong>
                  <span className="cset-meta">
                    {live
                      ? <>This will charge <strong>{fmtUsd(quote?.amount)}</strong> for real. This single click is the human approval — the agent cannot reach it.</>
                      : <>Simulation mode — no real money moves. In LIVE mode this same click would charge <strong>{fmtUsd(quote?.amount)}</strong>. This is the human-approval step the agent can never reach.</>}
                  </span>
                </div>
                <div className="cset-approve-actions">
                  <button className="cset-link" onClick={resetFlow} disabled={busy}>Cancel</button>
                  <button className="cset-approve-btn" onClick={approveAndBuy} disabled={busy}>{busy ? 'Authorizing…' : `Approve & buy ${fmtUsd(quote?.amount)}`}</button>
                </div>
              </div>
            )}

            {flowErr && <div className="cset-snaplii-fail"><span className="cset-snaplii-fail-tag">Refused · fail-closed</span><span>{flowErr}</span></div>}

            {step === 'done' && result && (
              <div className="cset-receipt">
                <div className="cset-receipt-top">
                  <span className={`cset-mode-pill ${result.simulated ? 'sim' : 'live'} sm`}>{result.simulated ? 'SIMULATED' : 'REAL SPEND'}</span>
                  <strong className="mono">{fmtUsd(result.amount)} {result.currency ?? 'USD'}</strong>
                  <span className="cset-meta">{result.brand ?? conn.brand?.name}</span>
                </div>
                <div className="cset-receipt-code">
                  <span className="cset-fact-l">Redemption code</span>
                  <code className="mono">{result.masked_code ?? '••••'}</code>
                </div>
                {result.message && <p className="cset-meta cset-receipt-msg">{result.message}</p>}
                <button className="cset-link cset-receipt-again" onClick={resetFlow}>Run another</button>
              </div>
            )}
          </div>

          <p className="cset-snaplii-thesis">
            The agent never holds the Snaplii key. Every purchase is server-brokered, one-shot, and capped — and pauses here for your approval.
            {live ? ' LIVE mode is on: approvals spend real money.' : ' Real money only moves once the owner enables LIVE mode.'}
          </p>
        </>
      )}
    </div>
  )
}

// ---- Wallets ------------------------------------------------------------------

function WalletsTab() {
  const [rows, setRows] = useState<WalletConnection[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [showWatch, setShowWatch] = useState(false)
  const [address, setAddress] = useState('')
  const [network, setNetwork] = useState('ethereum')
  const reload = async () => { const r = await listWallets(); setRows(r) }
  useEffect(() => { let alive = true; (async () => { const r = await listWallets(); if (alive) setRows(r) })(); return () => { alive = false } }, [])

  async function verifyLink() {
    setBusy(true); setNote('')
    const res = await linkWalletWithSiwe()
    setBusy(false)
    setNote(res.ok ? `Verified ownership of ${res.address?.slice(0, 6)}…${res.address?.slice(-4)}.` : res.error || 'Linking failed.')
    if (res.ok) await reload()
  }
  async function addWatch() {
    if (!address.trim()) return
    setBusy(true); setNote('')
    const w = await connectWallet(address.trim(), network)
    setBusy(false)
    if (!w) { setNote('Could not add that address — check it and try again.'); return }
    setAddress(''); setShowWatch(false); await reload()
  }

  return (
    <div className="cset-panel">
      <header className="cset-h">
        <h2>Wallets</h2>
        <p>Origin never stores a seed phrase or private key, and an agent can never sign — it can only prepare a draft you approve. Link a wallet by proving you control it.</p>
      </header>

      <SnapliiCard />

      <h3 className="cset-subh">On-chain wallet</h3>
      <div className="cset-siwe">
        <div>
          <strong>Link with your wallet</strong>
          <span className="cset-meta">Proves ownership by signing a one-time message in your own wallet (SIWE / EIP-4361). No transaction, no key shared.</span>
        </div>
        <button className="cset-btn" onClick={verifyLink} disabled={busy || !hasInjectedWallet()} title={hasInjectedWallet() ? '' : 'No browser wallet detected'}>
          {busy ? 'Awaiting signature…' : hasInjectedWallet() ? 'Verify & link' : 'No wallet detected'}
        </button>
      </div>
      {note && <div className={`cset-rowmsg ${note.startsWith('Verified') ? 'ok' : 'deny'}`}>{note}</div>}

      <div className="cset-brand-future">
        <span className="cset-meta">Future: connect Coinbase, Robinhood, and more</span>
        <div className="cset-brand-chips">
          <span className="cset-brand-chip"><svg viewBox="0 0 40 40" width="16" height="16" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#0052FF"/><circle cx="20" cy="20" r="7" fill="#fff"/><rect x="16.5" y="16.5" width="7" height="7" rx="1.5" fill="#0052FF"/></svg>Coinbase</span>
          <span className="cset-brand-chip"><svg viewBox="0 0 40 40" width="16" height="16" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#00C805"/><path d="M13 27V14h4.2c2.8 0 4.4 1.3 4.4 3.6 0 1.6-.8 2.7-2.2 3.2L26 27h-3.3l-3.1-2.4h-.4V27z" fill="#fff"/></svg>Robinhood</span>
        </div>
      </div>

      <button className="cset-disclose" onClick={() => setShowWatch((v) => !v)}>{showWatch ? '−' : '+'} Add a watch-only address (unverified)</button>
      {showWatch && (
        <div className="cset-row-add">
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x… public address" aria-label="Wallet address" />
          <select value={network} onChange={(e) => setNetwork(e.target.value)} aria-label="Network">
            <option value="ethereum">Ethereum</option>
            <option value="base">Base</option>
            <option value="polygon">Polygon</option>
            <option value="solana">Solana</option>
          </select>
          <button className="cset-btn ghost" onClick={addWatch} disabled={busy || !address.trim()}>Add watch-only</button>
        </div>
      )}

      <ListOrEmpty rows={rows} empty="No wallets linked yet.">
        {(rows ?? []).map((w) => (
          <div key={w.id} className="cset-item">
            <div className="cset-item-main">
              <strong className="cset-addr">{w.address}{w.verifiedAt ? <span className="cset-badge verified">✓ verified owner</span> : <span className="cset-badge watch">watch-only</span>}</strong>
              <span className="cset-meta">{w.network} · <Status s={w.status === 'revoked' ? 'revoked' : 'active'} /> · {w.verifiedAt ? `verified ${fmtDate(w.verifiedAt)}` : `added ${fmtDate(w.createdAt)}`}</span>
            </div>
            {w.status !== 'revoked' && (
              <div className="cset-item-actions">
                <button className="cset-link-danger" onClick={async () => { await disconnectWallet(w.id); await reload() }}>Remove</button>
              </div>
            )}
          </div>
        ))}
      </ListOrEmpty>

      {(rows ?? []).some((w) => w.verifiedAt && w.status !== 'revoked') && <SessionKeysSection wallets={(rows ?? []).filter((w) => w.verifiedAt && w.status !== 'revoked')} />}
    </div>
  )
}

// A session key = scoped, bounded autonomy for one agent on one wallet: a spend cap, a
// rolling-window cap, an address allowlist, and an expiry. In production these bounds are
// enforced on-chain by an ERC-4337 session key; here we persist + pre-flight them.
function SessionKeysSection({ wallets }: { wallets: WalletConnection[] }) {
  const [keys, setKeys] = useState<SessionKey[] | null>(null)
  const [form, setForm] = useState(false)
  const [note, setNote] = useState('')
  const reload = async () => setKeys(await listSessionKeys())
  useEffect(() => { let alive = true; (async () => { const k = await listSessionKeys(); if (alive) setKeys(k) })(); return () => { alive = false } }, [])

  // Demo: an agent attempts a transfer; the policy allows or refuses BEFORE a human sees it.
  async function attempt(k: SessionKey, amount: string) {
    const wallet = wallets.find((w) => w.id === k.walletConnectionId)
    const to = k.allowlist.find((a) => a !== '*') || '0xA11ce0000000000000000000000000000000C0de'
    const res = await prepareWalletActionGoverned({ agentId: k.agentId, walletConnectionId: k.walletConnectionId ?? '', destination: to, amount, asset: k.asset, network: wallet?.network ?? 'base' })
    setNote(res.ok ? `Allowed — ${amount} ${k.asset} queued for your approval (agent still can't sign).` : `Refused by policy — ${(res.violations ?? [res.error]).join('; ')}.`)
  }

  return (
    <div className="cset-sessionkeys">
      <h3 className="cset-subh">Agent session keys — bounded autonomy</h3>
      <p className="cset-meta cset-sk-intro">A session key lets an agent transact within hard limits — a per-transaction cap, a rolling-window cap, an address allowlist, and an expiry. In production these are enforced on-chain by an ERC-4337 session key, so the agent <em>cannot</em> exceed them even if compromised.</p>
      {!form && <button className="cset-btn ghost" onClick={() => setForm(true)}>+ New session key</button>}
      {form && <SessionKeyForm wallets={wallets} onDone={async () => { setForm(false); await reload() }} onCancel={() => setForm(false)} />}
      {note && <div className={`cset-rowmsg ${note.startsWith('Allowed') ? 'ok' : 'deny'}`}>{note}</div>}
      <ListOrEmpty rows={keys} empty="No session keys yet. Create one to give an agent bounded spend authority.">
        {(keys ?? []).map((k) => {
          const expired = nowMs() >= k.expiresAt
          const st = k.status === 'revoked' ? 'revoked' : expired ? 'expired' : 'active'
          return (
            <div key={k.id} className="cset-item col">
              <div className="cset-item-row">
                <div className="cset-item-main">
                  <strong>agent <code>{k.agentId}</code> <span className="cset-scope">{describePolicy(k)}</span></strong>
                  <span className="cset-meta">chain {k.chainId} · <Status s={st} />{st === 'active' && <> · expires {relExpiry(k.expiresAt)}</>}</span>
                </div>
                {st === 'active' && (
                  <div className="cset-item-actions">
                    <button className="cset-link" title="Agent attempts a within-limit transfer" onClick={() => attempt(k, k.maxPerTx && k.maxPerTx !== '0' ? k.maxPerTx : '0.01')}>Test ✓</button>
                    <button className="cset-link" title="Agent attempts an over-limit transfer" onClick={() => attempt(k, k.maxPerTx && k.maxPerTx !== '0' ? (parseFloat(k.maxPerTx) * 10).toString() : '999')}>Test ✗</button>
                    <button className="cset-link-danger" onClick={async () => { setNote(''); const ok = await revokeSessionKey(k.id); if (!ok) { setNote(`Could not revoke the session key for ${k.agentId} — try again.`); return } await reload() }}>Revoke</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </ListOrEmpty>
    </div>
  )
}

function SessionKeyForm({ wallets, onDone, onCancel }: { wallets: WalletConnection[]; onDone: () => void; onCancel: () => void }) {
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? '')
  const [agentId, setAgentId] = useState('travel-concierge')
  const [asset, setAsset] = useState('ETH')
  const [maxPerTx, setMaxPerTx] = useState('0.1')
  const [maxPerWindow, setMaxPerWindow] = useState('0.25')
  const [windowHours, setWindowHours] = useState('24')
  const [allowlist, setAllowlist] = useState('0xA11ce0000000000000000000000000000000C0de')
  const [days, setDays] = useState('7')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setBusy(true); setErr('')
    const wallet = wallets.find((w) => w.id === walletId)
    const created = await createSessionKey({
      walletConnectionId: walletId, agentId, chainId: wallet?.chainId ?? 8453, asset,
      decimals: asset === 'USDC' ? 6 : 18, maxPerTx, maxPerWindow,
      windowSeconds: Math.max(1, Math.round(parseFloat(windowHours) * 3600)),
      allowlist: allowlist.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
      expiresAt: Date.now() + Math.max(1, parseFloat(days)) * 86_400_000,
    })
    setBusy(false)
    if (!created) { setErr('Could not create the session key. Check the values and try again.'); return }
    onDone()
  }

  return (
    <div className="cset-form">
      <div className="cset-form-grid">
        <label className="cset-field"><span>Wallet</span>
          <select value={walletId} onChange={(e) => setWalletId(e.target.value)}>{wallets.map((w) => <option key={w.id} value={w.id}>{w.address.slice(0, 10)}…{w.address.slice(-6)}</option>)}</select>
        </label>
        <label className="cset-field"><span>Agent id</span><input value={agentId} onChange={(e) => setAgentId(e.target.value)} /></label>
        <label className="cset-field"><span>Asset</span>
          <select value={asset} onChange={(e) => setAsset(e.target.value)}><option>ETH</option><option>USDC</option></select>
        </label>
        <label className="cset-field"><span>Max per transaction</span><input value={maxPerTx} onChange={(e) => setMaxPerTx(e.target.value)} inputMode="decimal" /></label>
        <label className="cset-field"><span>Max per window</span><input value={maxPerWindow} onChange={(e) => setMaxPerWindow(e.target.value)} inputMode="decimal" /></label>
        <label className="cset-field"><span>Window (hours)</span><input value={windowHours} onChange={(e) => setWindowHours(e.target.value)} inputMode="numeric" /></label>
        <label className="cset-field"><span>Expires in (days)</span><input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" /></label>
      </div>
      <label className="cset-field"><span>Allowlisted destinations (comma/space separated, or <code>*</code> for any)</span>
        <input value={allowlist} onChange={(e) => setAllowlist(e.target.value)} placeholder="0x… , 0x…" />
      </label>
      {err && <div className="cset-rowmsg deny">{err}</div>}
      <div className="cset-form-actions">
        <button className="cset-btn ghost" onClick={onCancel}>Cancel</button>
        <button className="cset-btn" onClick={save} disabled={busy || !walletId}>{busy ? 'Creating…' : 'Create session key'}</button>
      </div>
    </div>
  )
}

// ---- Audit --------------------------------------------------------------------

function AuditTab() {
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  useEffect(() => { void (async () => setRows(await listAudit()))() }, [])
  return (
    <div className="cset-panel">
      <header className="cset-h">
        <h2>Audit log</h2>
        <p>Append-only record of every credential action. Entries can be read but never edited or deleted. Metadata is redacted — no secret ever appears here.</p>
      </header>
      <ListOrEmpty rows={rows} empty="No activity yet.">
        <div className="cset-audit">
          {(rows ?? []).map((e) => (
            <div key={e.id} className="cset-audit-row">
              <span className={`cset-tag tag-${e.eventType.includes('denied') ? 'deny' : e.eventType.includes('approval') ? 'wait' : e.eventType.includes('revoked') || e.eventType.includes('disconnected') ? 'off' : 'ok'}`}>{e.eventType.replace(/_/g, ' ')}</span>
              <span className="cset-audit-meta">{e.actorType}{e.actorId ? ` · ${e.actorId}` : ''}</span>
              <span className="cset-audit-time">{fmtDate(e.createdAt)}</span>
            </div>
          ))}
        </div>
      </ListOrEmpty>
    </div>
  )
}

// ---- Danger zone --------------------------------------------------------------

function KillSwitchCard() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  async function revokeAll() {
    setBusy(true); setMsg(null)
    const res = await revokeAllAuthority()
    setBusy(false)
    setMsg(res.ok
      ? { ok: true, text: 'All agent authority revoked.' }
      : { ok: false, text: 'Some authority may not have been revoked. Retry, or use per-grant revoke to be sure.' })
  }
  return (
    <div className="cset-danger-card">
      <div>
        <strong>Revoke all agent authority</strong>
        <span className="cset-meta">Instantly revokes every active grant, agent token, and wallet session key. Agents lose all access immediately. Your data and wallets stay; you can issue new grants afterward.</span>
        {msg && <span className={`cset-rowmsg ${msg.ok ? 'ok' : 'deny'}`} style={{ marginTop: 8 }}>{msg.text}</span>}
      </div>
      <button className="cset-btn ghost" disabled={busy} onClick={revokeAll}>{busy ? 'Revoking…' : 'Revoke all'}</button>
    </div>
  )
}

function DangerTab() {
  const auth = useAuth()
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  async function del() {
    setBusy(true); setDone('')
    const res = await purgeAccountData()
    setBusy(false)
    if (!res?.ok) { setDone('Could not complete deletion. Please try again or contact support.'); return }
    setDone(res.note || 'Your credential data was deleted.')
    // Give the user a moment to read, then sign out.
    setTimeout(() => auth.signOut(), 2500)
  }

  return (
    <div className="cset-panel">
      <header className="cset-h">
        <h2>Danger zone</h2>
        <p>Sign out, or delete your account data.</p>
      </header>
      <div className="cset-danger-card">
        <div>
          <strong>Sign out</strong>
          <span className="cset-meta">End this session on this device.</span>
        </div>
        <button className="cset-btn ghost" onClick={() => auth.signOut()}>Sign out</button>
      </div>
      <KillSwitchCard />
      <div className="cset-danger-card danger">
        <div>
          <strong>Delete account data</strong>
          <span className="cset-meta">Permanently removes your grants, integrations, wallets, and pending requests. The append-only audit log is retained as the deletion record; removal of the login itself is then completed by an administrator. This cannot be undone. Type <code>DELETE</code> to enable.</span>
          {done && <span className="cset-rowmsg ok" style={{ marginTop: 8 }}>{done}</span>}
        </div>
        <div className="cset-danger-action">
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" />
          <button className="cset-btn danger" disabled={confirm !== 'DELETE' || busy} onClick={del}>{busy ? 'Deleting…' : 'Delete data'}</button>
        </div>
      </div>
    </div>
  )
}

// ---- Shared bits --------------------------------------------------------------

function Status({ s }: { s: 'active' | 'revoked' | 'expired' | 'pending' }) {
  return <span className={`cset-status st-${s}`}>{s}</span>
}

// ---- Support (all users) — same SupportForm as the proving-ground "Report it" popup ----
function SupportTab() {
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null)
  const reload = async () => setTickets(await listMyTickets())
  useEffect(() => { let alive = true; void listMyTickets().then((t) => { if (alive) setTickets(t) }); return () => { alive = false } }, [])

  return (
    <div className="cset-panel">
      <header className="cset-h">
        <h2>Support</h2>
        <p>File a ticket and we’ll help. You can also reach us by phone or email. Your tickets are private to your account.</p>
      </header>
      <SupportForm onFiled={reload} />
      <p className="cset-meta cset-support-contact">📞 Phone support <strong>+1 (555) 010-2026</strong> · ✉️ <a href="mailto:support@origin.ai">support@origin.ai</a></p>
      <h3 className="cset-subh">Your tickets</h3>
      <ListOrEmpty rows={tickets} empty="No tickets yet. File one above if you need a hand.">
        {(tickets ?? []).map((t) => (
          <div key={t.id} className="cset-item">
            <div className="cset-item-main">
              <strong>{t.subject}</strong>
              <span className="cset-meta">{t.category} · {t.status} · {fmtDate(Date.parse(t.created_at))}</span>
            </div>
          </div>
        ))}
      </ListOrEmpty>
    </div>
  )
}

// ---- Admin (staff only; every action is server-verified + audited) ------------
type AdminView = 'accounts' | 'tickets' | 'audit'

function AdminTab({ role }: { role: Role }) {
  const [view, setView] = useState<AdminView>('accounts')
  return (
    <div className="cset-panel">
      <header className="cset-h">
        <h2>Admin</h2>
        <p>You see only what you need to help — never raw secrets — and <strong>every account or template you open is recorded</strong> in the audit log.{role === 'super_admin' ? ' As super admin you can also assign roles.' : ''}</p>
      </header>
      <div className="cset-subnav" role="group" aria-label="Admin sections">
        <button className={view === 'accounts' ? 'on' : ''} onClick={() => setView('accounts')}>Accounts</button>
        <button className={view === 'tickets' ? 'on' : ''} onClick={() => setView('tickets')}>Support queue</button>
        <button className={view === 'audit' ? 'on' : ''} onClick={() => setView('audit')}>Audit log</button>
      </div>
      {view === 'accounts' && <AdminAccounts role={role} />}
      {view === 'tickets' && <AdminTickets />}
      {view === 'audit' && <AdminAudit />}
    </div>
  )
}

function AdminAccounts({ role }: { role: Role }) {
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [templates, setTemplates] = useState<UserTemplate[]>([])
  const [detail, setDetail] = useState<TemplateDetail | null>(null)
  const reload = async () => { const r = await adminListAccounts(); if (!r.ok) { setError(r.error || 'Could not load accounts.'); setAccounts([]) } else { setError(''); setAccounts(r.accounts) } }
  useEffect(() => { let alive = true; void (async () => { const r = await adminListAccounts(); if (!alive) return; if (!r.ok) { setError(r.error || 'Could not load accounts.'); setAccounts([]) } else setAccounts(r.accounts) })(); return () => { alive = false } }, [])

  async function changeRole(email: string, newRole: Role) {
    setNote(''); const res = await adminAssignRole(email, newRole)
    if (!res.ok) { setNote(`Could not change role — ${res.error}`); return }
    setNote(`${email} is now ${roleLabel(newRole)}.`); await reload()
  }
  async function toggleTemplates(uid: string) {
    setDetail(null)
    if (open === uid) { setOpen(null); return }
    setOpen(uid); setTemplates(await adminListUserTemplates(uid))
  }

  return (
    <>
      {note && <div className={`cset-rowmsg ${note.includes(' now ') ? 'ok' : 'deny'}`}>{note}</div>}
      <ListOrEmpty rows={accounts} empty="No accounts found." error={error || undefined} onRetry={reload}>
        {(accounts ?? []).map((a) => (
          <div key={a.user_id} className="cset-item col">
            <div className="cset-item-row">
              <div className="cset-item-main">
                <strong>{a.email} <span className={`cset-role-badge role-${a.role}`}>{roleLabel(a.role)}</span></strong>
                <span className="cset-meta">{a.template_count} template{a.template_count === 1 ? '' : 's'} · joined {fmtDate(Date.parse(a.created_at))}</span>
              </div>
              <div className="cset-item-actions">
                {a.template_count > 0 && <button className="cset-link" onClick={() => toggleTemplates(a.user_id)}>{open === a.user_id ? 'Hide' : 'View templates'}</button>}
                {role === 'super_admin' && (
                  <select className="cset-role-select" value={a.role} onChange={(e) => changeRole(a.email, e.target.value as Role)} aria-label={`Role for ${a.email}`}>
                    <option value="user">User</option><option value="admin">Admin</option><option value="super_admin">Super Admin</option>
                  </select>
                )}
              </div>
            </div>
            {open === a.user_id && (
              <div className="cset-admin-templates">
                {templates.length === 0 ? <span className="cset-meta">No templates.</span>
                  : templates.map((t) => <button key={t.id} className="cset-link" onClick={async () => setDetail(await adminViewTemplate(t.id))}>{t.name}</button>)}
                {detail && <pre className="cset-admin-detail">{JSON.stringify(detail.snapshot, null, 2).slice(0, 1400)}</pre>}
              </div>
            )}
          </div>
        ))}
      </ListOrEmpty>
    </>
  )
}

function AdminTickets() {
  const [tickets, setTickets] = useState<AdminTicket[] | null>(null)
  const [error, setError] = useState('')
  const reload = async () => { const r = await adminListTickets(); if (!r.ok) { setError(r.error || 'Could not load tickets.'); setTickets([]) } else { setError(''); setTickets(r.tickets) } }
  useEffect(() => { let alive = true; void (async () => { const r = await adminListTickets(); if (!alive) return; if (!r.ok) { setError(r.error || 'Could not load tickets.'); setTickets([]) } else setTickets(r.tickets) })(); return () => { alive = false } }, [])
  async function setStatus(id: string, status: string) { await adminUpdateTicket(id, status); await reload() }
  return (
    <ListOrEmpty rows={tickets} empty="No tickets in the queue." error={error || undefined} onRetry={reload}>
      {(tickets ?? []).map((t) => (
        <div key={t.id} className="cset-item col">
          <div className="cset-item-row">
            <div className="cset-item-main">
              <strong>{t.subject}</strong>
              <span className="cset-meta">{t.email} · {t.category} · {fmtDate(Date.parse(t.created_at))}</span>
            </div>
            <div className="cset-item-actions">
              <select className="cset-role-select" value={t.status} onChange={(e) => setStatus(t.id, e.target.value)} aria-label="Ticket status">
                <option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
              </select>
            </div>
          </div>
          <p className="cset-meta cset-ticket-body">{t.body}</p>
        </div>
      ))}
    </ListOrEmpty>
  )
}

function AdminAudit() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [error, setError] = useState('')
  const reload = async () => { const r = await adminListAudit(); if (!r.ok) { setError(r.error || 'Could not load the audit log.'); setEntries([]) } else { setError(''); setEntries(r.entries) } }
  useEffect(() => { let alive = true; void (async () => { const r = await adminListAudit(); if (!alive) return; if (!r.ok) { setError(r.error || 'Could not load the audit log.'); setEntries([]) } else setEntries(r.entries) })(); return () => { alive = false } }, [])
  return (
    <ListOrEmpty rows={entries} empty="No admin activity yet." error={error || undefined} onRetry={reload}>
      {(entries ?? []).map((e) => (
        <div key={e.id} className="cset-feed-row" data-tone="flat">
          <span className="cset-feed-dot" aria-hidden="true" />
          <span className="cset-feed-label">{e.action.replace(/_/g, ' ')}</span>
          <span className="cset-feed-meta">{e.admin_email || 'admin'}{e.target_type ? ` · ${e.target_type}` : ''}</span>
          <time className="cset-feed-time">{fmtDate(Date.parse(e.created_at))}</time>
        </div>
      ))}
    </ListOrEmpty>
  )
}

function ListOrEmpty({ rows, empty, error, onRetry, children }: { rows: unknown[] | null; empty: string; error?: string | null; onRetry?: () => void; children: React.ReactNode }) {
  // Error is checked first so a failed load never masquerades as a calm empty state —
  // critical for a security console (e.g. an audit log that didn't load must NOT read
  // as "no activity").
  if (error) return (
    <div className="cset-loaderr">
      <span>{error}</span>
      {onRetry && <button className="cset-link" onClick={onRetry}>Retry</button>}
    </div>
  )
  if (rows === null) return <div className="cset-loading">Loading…</div>
  if (rows.length === 0) return <div className="cset-empty">{empty}</div>
  return <div className="cset-list">{children}</div>
}
