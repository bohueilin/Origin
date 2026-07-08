import type { ReactNode } from 'react'
import type { Capability, GrantStatus, RiskLevel } from '../types'
import { capabilityLabel } from '../capabilities'
import { RISK_LABEL } from './format'

export type ChipKind = 'allowed' | 'denied' | 'approval'

export function CapabilityChip({ cap, kind }: { cap: Capability; kind: ChipKind }) {
  const glyph = kind === 'allowed' ? '✓' : kind === 'denied' ? '✕' : '⏯'
  return (
    <span className={`pp-chip pp-chip-${kind}`} title={cap}>
      <span className="pp-chip-dot" aria-hidden="true">{glyph}</span>
      <span className="pp-chip-label">{capabilityLabel(cap)}</span>
    </span>
  )
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <span className={`pp-risk pp-risk-${level}`}>{RISK_LABEL[level]}</span>
}

export function StatusPill({ status }: { status: GrantStatus }) {
  const label = status === 'active' ? 'Active' : status === 'expired' ? 'Expired' : 'Revoked'
  return (
    <span className={`pp-status pp-status-${status}`}>
      <span className="pp-status-dot" aria-hidden="true" />
      {label}
    </span>
  )
}

export function Section({
  kicker,
  title,
  aside,
  children,
}: {
  kicker?: string
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="pp-section">
      <header className="pp-section-head">
        <div>
          {kicker && <div className="pp-kicker">{kicker}</div>}
          <h2 className="pp-section-title">{title}</h2>
        </div>
        {aside && <div className="pp-section-aside">{aside}</div>}
      </header>
      {children}
    </section>
  )
}
