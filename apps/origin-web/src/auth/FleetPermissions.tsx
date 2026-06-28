// Fleet permissions — the Fleet → Robot → Credential matrix. This is the demoable surface
// for "1Password as the baseline for per-agent/per-fleet permissions": pick a fleet, pick a
// robot, assign credentials from the vault catalog (with range selection so "Robot 1 → creds
// 1–15, Robot 2 → 16–30" is two clicks), set scope + duration, and each selected item becomes
// one real, brokered, revocable `credential_grant`. Test exercises the live broker as the
// robot would; Revoke kills one assignment. The whole pipeline runs WITHOUT a 1Password token
// against a clearly-labeled representative vault — only secret resolution flips when the token
// is set. Styled with the same `.cset-*` system as the rest of Account Settings, plus `.fp-*`.
import { useEffect, useMemo, useState } from 'react'
import {
  assignCredential, listFleets, listRobots, listRobotGrants, revokeRobotCredential,
  type Fleet, type Robot,
} from '../credentials/fleetStore'
import { listVaultItems } from '../credentials/store'
import { type VaultItem } from '../credentials/mockVault'
import { brokerRequest, effectiveStatus } from '../credentials/store'
import type { CredentialGrant, CredentialScope } from '../credentials/types'

const SCOPES: { id: CredentialScope; label: string }[] = [
  { id: 'api_read', label: 'API read' },
  { id: 'login_session', label: 'Login session' },
  { id: 'cli_auth', label: 'CLI auth' },
  { id: 'website_login', label: 'Website login (step-up)' },
]

const DURATIONS = [
  { label: '1 hour', ms: 3_600_000 },
  { label: '24 hours', ms: 86_400_000 },
  { label: '7 days', ms: 7 * 86_400_000 },
  { label: '30 days', ms: 30 * 86_400_000 },
]

function relExpiry(ms: number): string {
  const d = ms - Date.now()
  if (d <= 0) return 'expired'
  const days = Math.floor(d / 86_400_000)
  if (days >= 1) return `in ${days}d`
  const hrs = Math.floor(d / 3_600_000)
  if (hrs >= 1) return `in ${hrs}h`
  return `in ${Math.max(1, Math.floor(d / 60_000))}m`
}

export function FleetPermissions() {
  const fleets = useMemo(() => listFleets(), [])
  const [fleetId, setFleetId] = useState<string>(fleets[0]?.id ?? '')
  const [robotId, setRobotId] = useState<string>('')

  // Vault catalog + live/representative status (drives the top banner).
  const [items, setItems] = useState<VaultItem[]>([])
  const [representative, setRepresentative] = useState(true)
  const [vaultName, setVaultName] = useState<string | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const cat = await listVaultItems()
      if (!alive) return
      setItems(cat.items); setRepresentative(cat.representative); setVaultName(cat.vault); setCatalogLoading(false)
    })()
    return () => { alive = false }
  }, [])

  const robots = useMemo(() => listRobots(fleetId), [fleetId])
  const activeFleet = fleets.find((f) => f.id === fleetId) ?? null
  const selectedRobot = robots.find((r) => r.id === robotId) ?? null

  return (
    <div className="cset-panel">
      <header className="cset-h">
        <h2>Fleet permissions</h2>
        <p>Assign credentials to robots the way you'd assign them to people — by fleet, by robot, from your 1Password vault. Each assignment is one scoped, time-limited, brokered grant: the robot gets an opaque handle, never the secret.</p>
      </header>

      <VaultBanner representative={representative} loading={catalogLoading} vaultName={vaultName} itemCount={items.length} />

      <div className="fp-grid">
        {/* Left rail — colored fleets */}
        <aside className="fp-fleets" aria-label="Fleets">
          {fleets.map((f) => (
            <FleetButton key={f.id} fleet={f} active={f.id === fleetId} count={listRobots(f.id).length}
              onClick={() => { setFleetId(f.id); setRobotId('') }} />
          ))}
        </aside>

        {/* Right — robots of the active fleet, then the selected robot's detail */}
        <section className="fp-main">
          {activeFleet && (
            <FleetHeader fleet={activeFleet} robots={robots} items={items} representative={representative}
              onAssignedAll={() => { /* detail reloads itself on selection */ }} />
          )}
          <div className="fp-robots">
            {robots.map((r) => (
              <RobotChip key={r.id} robot={r} active={r.id === robotId} colorIndex={activeFleet?.colorIndex ?? 0}
                onClick={() => setRobotId((cur) => (cur === r.id ? '' : r.id))} />
            ))}
          </div>

          {selectedRobot
            ? <RobotDetail key={selectedRobot.id} robot={selectedRobot} items={items} colorIndex={activeFleet?.colorIndex ?? 0} />
            : <div className="fp-hint">Select a robot above to see its credentials and assign new ones.</div>}
        </section>
      </div>
    </div>
  )
}

// ---- Banner: representative vs live -------------------------------------------

function VaultBanner({ representative, loading, vaultName, itemCount }: { representative: boolean; loading: boolean; vaultName: string | null; itemCount: number }) {
  if (loading) return <div className="fp-banner loading">Reading the credential vault…</div>
  if (representative) {
    return (
      <div className="fp-banner rep">
        <span className="fp-banner-pill rep">Representative vault — demo mode</span>
        <span className="fp-banner-text">
          Showing a clearly-labeled stand-in vault ({vaultName ?? 'Origin-Demo-Vault'}, {itemCount} items). Every assignment below creates a real, brokered, revocable grant — only the final secret resolution is simulated. Set <code>OP_SERVICE_ACCOUNT_TOKEN</code> on the broker to go live.
        </span>
      </div>
    )
  }
  return (
    <div className="fp-banner live">
      <span className="fp-banner-pill live">1Password vault linked — broker live</span>
      <span className="fp-banner-text">Credentials below come from your live 1Password vault ({vaultName}). The broker leases each secret just-in-time and hands robots an opaque handle.</span>
    </div>
  )
}

// ---- Left rail ----------------------------------------------------------------

function FleetButton({ fleet, active, count, onClick }: { fleet: Fleet; active: boolean; count: number; onClick: () => void }) {
  return (
    <button className={`fp-fleet${active ? ' is-active' : ''}`} data-color={fleet.colorIndex} onClick={onClick} aria-current={active ? 'true' : undefined}>
      <span className="fp-fleet-dot" aria-hidden="true" />
      <span className="fp-fleet-name">{fleet.name}</span>
      <span className="fp-fleet-count">{count}</span>
    </button>
  )
}

// ---- Fleet header (assign-to-all convenience) --------------------------------

function FleetHeader({ fleet, robots, items, representative, onAssignedAll }: { fleet: Fleet; robots: Robot[]; items: VaultItem[]; representative: boolean; onAssignedAll: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="fp-fleet-head" data-color={fleet.colorIndex}>
      <div className="fp-fleet-head-main">
        <strong>{fleet.name}</strong>
        <span className="cset-meta">{robots.length} robots · {representative ? 'representative vault' : 'live vault'}</span>
      </div>
      <button className="cset-btn ghost" onClick={() => setOpen((v) => !v)}>{open ? 'Close' : 'Assign to all robots'}</button>
      {open && (
        <AssignPanel
          target={{ kind: 'fleet', fleet, robots }}
          items={items}
          onDone={() => { setOpen(false); onAssignedAll() }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  )
}

// ---- Robot chip ---------------------------------------------------------------

function RobotChip({ robot, active, colorIndex, onClick }: { robot: Robot; active: boolean; colorIndex: number; onClick: () => void }) {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    void listRobotGrants(robot.id).then((gs) => { if (alive) setCount(gs.filter((g) => effectiveStatus(g) === 'active').length) })
    return () => { alive = false }
  }, [robot.id])
  return (
    <button className={`fp-robot${active ? ' is-active' : ''}`} data-color={colorIndex} onClick={onClick} aria-pressed={active}>
      <span className="fp-robot-name">{robot.name.split(' · ')[1] ?? robot.name}</span>
      <span className="fp-robot-type">{robot.type}</span>
      <span className={`fp-robot-creds${count ? '' : ' zero'}`}>{count === null ? '·' : count} cred{count === 1 ? '' : 's'}</span>
    </button>
  )
}

// ---- Robot detail: assigned creds + assign action -----------------------------

function RobotDetail({ robot, items, colorIndex }: { robot: Robot; items: VaultItem[]; colorIndex: number }) {
  const [grants, setGrants] = useState<CredentialGrant[] | null>(null)
  const [assigning, setAssigning] = useState(false)
  const reload = async () => setGrants(await listRobotGrants(robot.id))
  useEffect(() => { let alive = true; void listRobotGrants(robot.id).then((g) => { if (alive) setGrants(g) }); return () => { alive = false } }, [robot.id])

  const active = (grants ?? []).filter((g) => effectiveStatus(g) === 'active')

  return (
    <div className="fp-detail" data-color={colorIndex}>
      <div className="fp-detail-head">
        <div>
          <strong>{robot.name}</strong>
          <span className="cset-meta"> · {robot.type} · agent <code>{robot.agentId}</code></span>
        </div>
        {!assigning && <button className="cset-btn" onClick={() => setAssigning(true)}>Assign credentials</button>}
      </div>

      {assigning && (
        <AssignPanel
          target={{ kind: 'robot', robot }}
          items={items}
          onDone={async () => { setAssigning(false); await reload() }}
          onCancel={() => setAssigning(false)}
        />
      )}

      <h3 className="cset-subh">Assigned credentials</h3>
      {grants === null ? <div className="cset-loading">Loading…</div>
        : active.length === 0 ? <div className="cset-empty">No credentials assigned. Use “Assign credentials” to give this robot scoped, brokered access.</div>
        : <div className="cset-list">{active.map((g) => <AssignedRow key={g.id} g={g} robotAgentId={robot.agentId} onChange={reload} />)}</div>}
    </div>
  )
}

function AssignedRow({ g, robotAgentId, onChange }: { g: CredentialGrant; robotAgentId: string; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function test() {
    setBusy(true); setNote('')
    const res = await brokerRequest({ grantId: g.id, agentId: robotAgentId, runId: g.runId ?? undefined, scope: g.scope, targetDomain: g.targetDomain, action: 'fleet robot credential request', reason: 'owner test from fleet permissions' })
    setBusy(false)
    if (!res) { setNote('Broker unreachable.'); return }
    setNote(res.decision === 'allowed' ? 'Allowed — capability issued (no secret).' : res.decision === 'approval_required' ? 'Step-up required — see Approvals.' : `Denied — ${res.reason}.`)
    await onChange()
  }

  async function revoke() {
    setBusy(true); setNote('')
    const ok = await revokeRobotCredential(g.id)
    setBusy(false)
    if (!ok) { setNote('Could not revoke — try again.'); return }
    await onChange()
  }

  return (
    <div className="cset-item col">
      <div className="cset-item-row">
        <div className="cset-item-main">
          <strong>{g.targetService} <span className="cset-scope">{g.scope}</span></strong>
          <span className="cset-meta">
            <code>{g.vaultRef}/{g.itemRef}</code> · expires {relExpiry(g.expiresAt)} · {g.usageLimit > 0 ? `${g.usageCount}/${g.usageLimit} uses` : 'unlimited'}
            {g.approvalPolicy === 'approval_required' && ' · step-up'}
          </span>
        </div>
        <div className="cset-item-actions">
          <button className="cset-link" onClick={test} disabled={busy}>{busy ? 'Testing…' : 'Test'}</button>
          <button className="cset-link-danger" onClick={revoke} disabled={busy}>Revoke</button>
        </div>
      </div>
      {note && <div className={`cset-rowmsg ${note.startsWith('Allowed') ? 'ok' : note.startsWith('Step-up') ? 'wait' : 'deny'}`}>{note}</div>}
    </div>
  )
}

// ---- Assign panel (range-selectable catalog → bulk assign) --------------------

type AssignTarget = { kind: 'robot'; robot: Robot } | { kind: 'fleet'; fleet: Fleet; robots: Robot[] }

function AssignPanel({ target, items, onDone, onCancel }: { target: AssignTarget; items: VaultItem[]; onDone: () => void; onCancel: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null) // for shift-range selection
  const [rangeFrom, setRangeFrom] = useState('1')
  const [rangeTo, setRangeTo] = useState('15')
  const [scope, setScope] = useState<CredentialScope>('api_read')
  const [durIdx, setDurIdx] = useState(2) // 7 days
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const robots = target.kind === 'robot' ? [target.robot] : target.robots
  const targetLabel = target.kind === 'robot' ? target.robot.name : `all ${target.robots.length} robots in ${target.fleet.name}`

  function toggle(itemRef: string, idx: number, shift: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (shift && anchor !== null) {
        const [a, b] = anchor <= idx ? [anchor, idx] : [idx, anchor]
        for (let i = a; i <= b; i++) next.add(items[i].itemRef)
      } else {
        if (next.has(itemRef)) next.delete(itemRef); else next.add(itemRef)
      }
      return next
    })
    if (!shift) setAnchor(idx)
  }

  // Range box: "1–15" → select items at those 1-based positions. This is the two-click path
  // to "Robot 1 → creds 1–15, Robot 2 → 16–30".
  function applyRange() {
    const from = Math.max(1, parseInt(rangeFrom, 10) || 1)
    const to = Math.min(items.length, parseInt(rangeTo, 10) || items.length)
    setSelected((prev) => {
      const next = new Set(prev)
      for (let i = from; i <= to; i++) { const it = items[i - 1]; if (it) next.add(it.itemRef) }
      return next
    })
  }
  function clearSel() { setSelected(new Set()); setAnchor(null) }

  async function assign() {
    if (selected.size === 0) { setMsg('Select at least one credential.'); return }
    setBusy(true); setMsg('')
    const chosen = items.filter((it) => selected.has(it.itemRef))
    const expiresAt = Date.now() + DURATIONS[durIdx].ms
    let ok = 0, fail = 0
    // One grant per (robot × selected item). For a single robot that's just |selected| grants;
    // for "assign to all" it's |robots| × |selected| — each an ordinary brokered grant.
    for (const robot of robots) {
      for (const item of chosen) {
        const g = await assignCredential({ robot, item, scope, expiresAt })
        if (g) ok++; else fail++
      }
    }
    setBusy(false)
    if (fail > 0 && ok === 0) { setMsg(`Could not assign — ${fail} failed. Check your connection and try again.`); return }
    onDone()
  }

  return (
    <div className="fp-assign">
      <div className="fp-assign-head">
        <strong>Assign to {targetLabel}</strong>
        <span className="cset-meta">{selected.size} of {items.length} selected · {robots.length > 1 ? `${selected.size * robots.length} grants` : `${selected.size} grants`}</span>
      </div>

      <div className="fp-assign-controls">
        <div className="fp-range">
          <span className="cset-meta">Range</span>
          <input value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} inputMode="numeric" aria-label="Range from" />
          <span aria-hidden="true">–</span>
          <input value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} inputMode="numeric" aria-label="Range to" />
          <button className="cset-link" onClick={applyRange}>Add range</button>
          {selected.size > 0 && <button className="cset-link-danger" onClick={clearSel}>Clear</button>}
        </div>
        <label className="cset-field fp-inline"><span>Scope</span>
          <select value={scope} onChange={(e) => setScope(e.target.value as CredentialScope)}>
            {SCOPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="cset-field fp-inline"><span>Expires</span>
          <select value={durIdx} onChange={(e) => setDurIdx(Number(e.target.value))}>
            {DURATIONS.map((d, i) => <option key={d.label} value={i}>{d.label}</option>)}
          </select>
        </label>
      </div>

      <div className="fp-catalog" role="listbox" aria-label="Vault credentials">
        {items.map((it, idx) => {
          const on = selected.has(it.itemRef)
          return (
            <button key={it.itemRef} type="button" role="option" aria-selected={on} className={`fp-cat-item${on ? ' is-on' : ''}`}
              onClick={(e) => toggle(it.itemRef, idx, e.shiftKey)}>
              <span className="fp-cat-idx">{idx + 1}</span>
              <span className="fp-cat-title">{it.title}</span>
              <span className="fp-cat-ref">{it.itemRef}</span>
              <span className="fp-cat-check" aria-hidden="true">{on ? '✓' : ''}</span>
            </button>
          )
        })}
      </div>
      <p className="cset-meta fp-tip">Tip: type a range like <strong>1–15</strong> and “Add range”, or click an item then Shift-click another to select the span. Then assign — that's two clicks for “Robot 1 → creds 1–15”.</p>

      {msg && <div className="cset-rowmsg deny">{msg}</div>}
      <div className="cset-form-actions">
        <button className="cset-btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="cset-btn" onClick={assign} disabled={busy || selected.size === 0}>{busy ? 'Assigning…' : `Assign ${selected.size || ''} credential${selected.size === 1 ? '' : 's'}`}</button>
      </div>
    </div>
  )
}
