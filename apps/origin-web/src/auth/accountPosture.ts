// The security overview, computed from what was actually read.
//
// This lives apart from the component because it is the part that was wrong: the panel
// derived a headline and five counters from five reads that each returned [] on failure,
// so "we could not read your account" and "your account is empty" produced the identical,
// reassuring screen. Here the two are different values — an unread number is `null`, not
// zero — and the rule is enforced in one place instead of five render expressions.

import { effectiveStatus, type ApprovalRequest, type AuditRow, type SessionKey, type WalletConnection } from '../credentials/store'
import type { CredentialGrant } from '../credentials/types'
import type { ReadResult } from '../readResult'

// The finish / escalate / refuse triad is the spine of the whole surface: allowed = go,
// approval_required = pause for a human, denied/revoked = stop. Map any audit event to it.
export type Tone = 'go' | 'wait' | 'stop' | 'flat'

export function auditTone(eventType: string): Tone {
  if (/denied|refused|revoked|disconnected|purged|expired/.test(eventType)) return 'stop'
  if (/approval_required/.test(eventType)) return 'wait'
  if (/allowed|granted|approved|verified|created|minted|connected|prepared/.test(eventType)) return 'go'
  return 'flat'
}

/** The five reads behind the panel. `null` means still outstanding. */
export interface PostureReads {
  grants: ReadResult<CredentialGrant> | null
  approvals: ReadResult<ApprovalRequest> | null
  wallets: ReadResult<WalletConnection> | null
  keys: ReadResult<SessionKey> | null
  audit: ReadResult<AuditRow> | null
}

export interface Posture {
  loading: boolean
  /** Non-null when at least one read failed — render it with a Retry, never an empty state. */
  error: string | null
  tone: Tone
  headline: string
  // `null` = not known (outstanding or failed). Show "—", never 0.
  activeGrants: number | null
  pending: number | null
  verifiedWallets: number | null
  activeKeys: number | null
  refused24: number | null
}

/** Count over a read's rows, or `null` if that read has no answer to count. */
function countIf<T>(read: ReadResult<T> | null, pred: (row: T) => boolean): number | null {
  return read?.ok ? read.rows.filter(pred).length : null
}

export function summarizePosture(reads: PostureReads, now: number): Posture {
  const all = [reads.grants, reads.approvals, reads.wallets, reads.keys, reads.audit]
  const loading = all.some((r) => r === null)
  // First failure wins the banner: when the session is the problem every read fails with
  // the same message, and repeating it five times tells the reader nothing new.
  const error = all.find((r) => r && !r.ok)?.error ?? null

  const activeGrants = countIf(reads.grants, (g) => effectiveStatus(g, now) === 'active')
  const pending = countIf(reads.approvals, (a) => a.status === 'pending' && a.expiresAt > now)
  const verifiedWallets = countIf(reads.wallets, (w) => Boolean(w.verifiedAt) && w.status !== 'revoked')
  const activeKeys = countIf(reads.keys, (k) => k.status === 'active' && k.expiresAt > now)
  const refused24 = countIf(reads.audit, (e) => auditTone(e.eventType) === 'stop' && e.createdAt > now - 86_400_000)

  // Order matters, and the reassuring readings come last on purpose: an unread section is
  // enough to disqualify both "nothing can act on your behalf" and "everything is within
  // limits", because a failure is exactly what manufactures those two sentences.
  const [tone, headline]: [Tone, string] =
    loading ? ['flat', 'Reading your security posture…']
    : error ? ['stop', 'Couldn’t read your security posture — some of this account is unread']
    : pending ? ['wait', `${pending} action${pending > 1 ? 's' : ''} need${pending > 1 ? '' : 's'} your approval`]
    : activeGrants === 0 ? ['flat', 'No agent can act on your behalf yet']
    : ['go', 'Your agents are operating within the limits you set']

  return { loading, error, tone, headline, activeGrants, pending, verifiedWallets, activeKeys, refused24 }
}

/** A count that was never read is a dash, not a zero. */
export function statValue(n: number | null): string {
  return n === null ? '—' : String(n)
}
