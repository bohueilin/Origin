import type { RiskLevel } from '../types'

export function money(c: { amount: number; currency: string } | null): string {
  if (!c) return '—'
  return c.currency === 'USD' ? `$${c.amount.toFixed(2)}` : `${c.amount.toFixed(2)} ${c.currency}`
}

export function clockTime(ts: number): string {
  // Local wall-clock time (deterministic enough for the trace; no date shown).
  const d = new Date(ts)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function ttlLabel(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`
  if (seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
  critical: 'Critical',
}

export function shortDigest(d: string): string {
  return `${d.slice(0, 8)}…${d.slice(-8)}`
}
