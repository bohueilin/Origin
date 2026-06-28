// GrantManager — issues a scoped CapabilityGrant from a policy decision and answers the
// fail-closed liveness question used on every tool call.

import type { Capability, CapabilityGrant, UserIntent } from '../types'
import type { PolicyDecision } from './policyEngine'
import type { IdFactory } from './ids'

export interface GrantOptions {
  agent_id: string
  ttl_seconds: number
  budget_limit?: { amount: number; currency: string }
  scope: string
}

export type LivenessReason = 'ok' | 'revoked' | 'expired' | 'inactive'

export const GrantManager = {
  issue(intent: UserIntent, decision: PolicyDecision, opts: GrantOptions, idf: IdFactory, now: number): CapabilityGrant {
    return {
      grant_id: idf.next('grant'),
      intent_id: intent.intent_id,
      agent_id: opts.agent_id,
      allowed_capabilities: decision.allowed_capabilities,
      denied_capabilities: decision.denied_capabilities,
      scope: opts.scope,
      ttl: opts.ttl_seconds,
      budget_limit: opts.budget_limit ?? null,
      requires_approval_for: decision.requires_approval_for,
      status: 'active',
      created_at: now,
      expires_at: now + opts.ttl_seconds * 1000,
      revoked_at: null,
    }
  },

  /** Fail-closed liveness: active, not revoked, not past expiry. */
  liveness(grant: CapabilityGrant, now: number): LivenessReason {
    if (grant.status === 'revoked' || grant.revoked_at !== null) return 'revoked'
    if (now >= grant.expires_at) return 'expired'
    if (grant.status !== 'active') return 'inactive'
    return 'ok'
  },

  isLive(grant: CapabilityGrant, now: number): boolean {
    return GrantManager.liveness(grant, now) === 'ok'
  },

  /** A read/prepare capability is usable only if live AND explicitly allowed AND not denied. */
  capabilityUsable(grant: CapabilityGrant, cap: Capability, now: number): boolean {
    if (!GrantManager.isLive(grant, now)) return false
    if (grant.denied_capabilities.includes(cap)) return false
    return grant.allowed_capabilities.includes(cap)
  },

  /**
   * Spend-ceiling check: a prospective cost is within budget if there is no ceiling, or if the
   * already-approved spend plus this cost stays at/under the ceiling. Same-currency only;
   * a mismatched currency fails closed.
   */
  withinBudget(grant: CapabilityGrant, spentSoFar: number, cost: { amount: number; currency: string } | null): boolean {
    if (!cost || cost.amount <= 0) return true
    if (!grant.budget_limit) return true
    if (cost.currency !== grant.budget_limit.currency) return false
    return spentSoFar + cost.amount <= grant.budget_limit.amount
  },
}
