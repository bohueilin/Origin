import { useEffect, useMemo, useRef, useState } from 'react'
import type { AccessLease, LeaseStatus } from '../../engine/accessLedger'
import './accessLedger.css'

export interface AccessLedgerProps {
  /** Every standing lease — the task grant (grant_…) plus any brokered credentials (pph_…). */
  leases: AccessLease[]
  /** Kill switch. Called when the operator revokes all standing authority. */
  onRevoke?: () => void
}

/**
 * AccessLedger — a live broker lease table (P2).
 * Each row shows the opaque handle, bound agent, scope, capability, a ticking
 * TTL countdown, and a status pill. A prominent kill switch revokes everything
 * at once; on revoke every active lease desaturates and snaps to REVOKED.
 */
export function AccessLedger({ leases, onRevoke }: AccessLedgerProps) {
  // Live clock — drives every TTL countdown. One interval for the whole table.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // Track which lease ids were just revoked, to fire the snap-shut animation once.
  const prevStatuses = useRef<Map<string, LeaseStatus>>(new Map())
  const [flashing, setFlashing] = useState<Set<string>>(new Set())
  useEffect(() => {
    const justRevoked: string[] = []
    for (const l of leases) {
      const prev = prevStatuses.current.get(l.id)
      if (prev && prev !== 'revoked' && l.status === 'revoked') justRevoked.push(l.id)
      prevStatuses.current.set(l.id, l.status)
    }
    if (justRevoked.length) {
      let clearFlashId: number | undefined
      const addFlashId = window.setTimeout(() => {
        setFlashing((s) => new Set([...s, ...justRevoked]))
        clearFlashId = window.setTimeout(() => {
          setFlashing((s) => {
            const next = new Set(s)
            for (const lid of justRevoked) next.delete(lid)
            return next
          })
        }, 700)
      }, 0)
      return () => {
        window.clearTimeout(addFlashId)
        if (clearFlashId) window.clearTimeout(clearFlashId)
      }
    }
  }, [leases])

  const activeCount = useMemo(
    () => leases.filter((l) => l.status === 'active' && l.expiresAt > now).length,
    [leases, now],
  )
  const hasAnyActive = activeCount > 0

  return (
    <section className="pp-led" aria-label="Access ledger">
      <header className="pp-led-head">
        <div>
          <span className="pp-led-kicker">Access ledger</span>
          <h3 className="pp-led-title">Standing authority</h3>
        </div>
        <div className="pp-led-aside">
          <span className="pp-led-count mono">
            {activeCount} active · {leases.length} total
          </span>
          <button
            type="button"
            className="pp-led-kill"
            onClick={onRevoke}
            disabled={!hasAnyActive || !onRevoke}
            aria-label="Revoke all authority"
          >
            <KillIcon />
            Revoke all authority
          </button>
        </div>
      </header>

      {leases.length === 0 ? (
        <div className="pp-led-empty">
          <Keyhole />
          <p>No standing access — zero credentials held by default.</p>
        </div>
      ) : (
        <ol className="pp-led-rows" role="list">
          <li className="pp-led-colhead" aria-hidden="true">
            <span>Handle</span>
            <span>Bound to / scope</span>
            <span>Capability</span>
            <span>TTL</span>
            <span>Status</span>
          </li>
          {leases.map((l) => (
            <LeaseRow key={l.id} lease={l} now={now} flashing={flashing.has(l.id)} />
          ))}
        </ol>
      )}

      <p className="pp-led-foot mono">
        Leases are opaque, attenuated, and self-expiring. Revocation is instant and total.
      </p>
    </section>
  )
}

function LeaseRow({
  lease,
  now,
  flashing,
}: {
  lease: AccessLease
  now: number
  flashing: boolean
}) {
  // Reconcile expiry on the client too — a lease can lapse between snapshots.
  const expired = lease.status === 'active' && lease.expiresAt <= now
  const status: LeaseStatus = expired ? 'expired' : lease.status
  const live = status === 'active'
  const brokered = lease.handle.startsWith('pph_')

  return (
    <li
      className={[
        'pp-led-row',
        `is-${status}`,
        flashing ? 'is-flashing' : '',
      ].join(' ')}
    >
      <span className="pp-led-handle">
        <span className={`pp-led-tag ${brokered ? 'is-broker' : 'is-grant'}`}>
          {brokered ? 'CRED' : 'GRANT'}
        </span>
        <code className="mono" title={lease.handle}>
          {lease.handle}
        </code>
      </span>

      <span className="pp-led-bind">
        <code className="mono pp-led-agent" title={lease.agentId}>
          {lease.agentId}
        </code>
        <span className="pp-led-scope" title={lease.scope}>
          {lease.scope}
        </span>
      </span>

      <span className="pp-led-cap">
        <code className="mono">{lease.capability}</code>
      </span>

      <span className="pp-led-ttl">
        <code className="mono">{ttlCountdown(lease, now, status)}</code>
        <span className="pp-led-ttl-label">{lease.ttlLabel} lease</span>
      </span>

      <span className={`pp-led-pill is-${status}`}>
        {status === 'revoked' ? (
          <LockIcon />
        ) : (
          <span className="pp-led-dot" data-live={live ? 'true' : 'false'} />
        )}
        {status}
      </span>
    </li>
  )
}

/** mm:ss remaining for an active lease; a dash for terminal states. */
function ttlCountdown(lease: AccessLease, now: number, status: LeaseStatus): string {
  if (status === 'revoked') return '—:—'
  const remMs = lease.expiresAt - now
  if (remMs <= 0) return '00:00'
  const total = Math.floor(remMs / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function KillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3v8M6.5 6.5a7 7 0 1 0 11 0"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2.4" fill="currentColor" />
      <path
        d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Keyhole() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" opacity="0.5" />
      <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 12.2 10.3 16h3.4L13 12.2" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export default AccessLedger
