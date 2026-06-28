// AccessLedger — the live access ledger (Passport feature P2).
//
// Every standing authority in a run is surfaced as a lease:
//   - the top-level CapabilityGrant itself (one lease, handle 'grant_…'), and
//   - one lease per scoped credential the SecretBroker brokers (handle 'pph_…'), minted when a
//     scenario calls credential.scoped_request.
//
// A lease's status tracks the underlying authority: it flips to 'revoked' when the grant is
// revoked (reusing the existing revoke path) and to 'expired' once its TTL elapses. The ledger
// is the auditable answer to "what does this agent currently hold, and for how long?".

import type { CapabilityGrant, GrantStatus } from '../types'

export type LeaseStatus = 'active' | 'revoked' | 'expired'

export interface AccessLease {
  id: string
  /** Opaque handle: 'grant_…' for the task grant, 'pph_…' for a brokered credential. */
  handle: string
  agentId: string
  scope: string
  capability: string
  /** Human-readable TTL, e.g. "60 min". */
  ttlLabel: string
  status: LeaseStatus
  issuedAt: number
  /** Absolute expiry (ms epoch) used to reconcile 'expired' lazily. */
  expiresAt: number
}

export interface AccessLedgerView {
  leases: AccessLease[]
}

function ttlLabel(seconds: number): string {
  if (seconds >= 3600) {
    const h = seconds / 3600
    return `${Number.isInteger(h) ? h : h.toFixed(1)} h`
  }
  return `${Math.round(seconds / 60)} min`
}

export class AccessLedger {
  private leases: AccessLease[] = []
  private seq = 0

  /** Seed the ledger with the task grant as the first lease. */
  seedGrant(grant: CapabilityGrant): void {
    this.seq += 1
    const id = `lease_${this.seq.toString().padStart(3, '0')}`
    this.leases.push({
      id,
      handle: grant.grant_id, // 'grant_…'
      agentId: grant.agent_id,
      scope: grant.scope,
      capability: 'task grant',
      ttlLabel: ttlLabel(grant.ttl),
      status: 'active',
      issuedAt: grant.created_at,
      expiresAt: grant.expires_at,
    })
  }

  /**
   * Record a brokered credential lease (opaque 'pph_…' handle). ttlMs is the lease lifetime.
   */
  addBrokeredLease(args: {
    handle: string
    agentId: string
    scope: string
    capability: string
    issuedAt: number
    expiresAt: number
  }): void {
    this.seq += 1
    const ttlSec = Math.max(0, Math.round((args.expiresAt - args.issuedAt) / 1000))
    this.leases.push({
      id: `lease_${this.seq.toString().padStart(3, '0')}`,
      handle: args.handle,
      agentId: args.agentId,
      scope: args.scope,
      capability: args.capability,
      ttlLabel: ttlLabel(ttlSec),
      status: 'active',
      issuedAt: args.issuedAt,
      expiresAt: args.expiresAt,
    })
  }

  /** Flip every still-active lease to 'revoked' (used by the grant revoke path). */
  revokeAll(): void {
    for (const l of this.leases) if (l.status === 'active') l.status = 'revoked'
  }

  /**
   * Produce the ledger view, reconciling expiry against `now` and the grant's live status.
   * - If the grant is revoked, every active lease reads 'revoked'.
   * - Otherwise any lease past its expiry reads 'expired'.
   * Revoked is terminal and never downgraded back to expired/active.
   */
  view(now: number, grantStatus: GrantStatus): AccessLedgerView {
    const leases = this.leases.map((l) => {
      if (l.status === 'revoked') return { ...l }
      if (grantStatus === 'revoked') return { ...l, status: 'revoked' as LeaseStatus }
      if (now >= l.expiresAt) return { ...l, status: 'expired' as LeaseStatus }
      return { ...l }
    })
    return { leases }
  }
}
