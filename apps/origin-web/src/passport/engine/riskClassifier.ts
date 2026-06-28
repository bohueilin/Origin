// RiskClassifier — derives an intent's risk level + human-readable notes from the
// capabilities it touches. Deterministic: risk = max capability risk, with explicit notes
// for the dangerous dimensions (payment, third parties, irreversibility, live location).

import type { Capability, RiskLevel } from '../types'
import { capabilityRisk, getCapability, isSideEffecting, maxRisk } from '../capabilities'

export interface RiskAssessment {
  risk_level: RiskLevel
  notes: string[]
}

export const RiskClassifier = {
  classify(requested: Capability[], commits: Capability[]): RiskAssessment {
    const all = [...requested, ...commits]
    const base = maxRisk(all.map(capabilityRisk))

    const notes: string[] = []
    const has = (id: Capability) => all.includes(id)

    if (commits.some(isSideEffecting)) {
      notes.push('Touches side-effecting actions — each is gated behind an explicit approval.')
    }
    if (has('ride.booking.submit') || has('delivery.order.submit') || has('payment.spend')) {
      notes.push('Could authorize spending — no charge happens without your approval (and is simulated here).')
    }
    if (has('contacts.read.limited') || has('messages.send') || has('safety_share.prepare')) {
      notes.push('Involves another person — messages are drafted, never silently sent.')
    }
    if (has('location.read.current_event') || has('location.estimate')) {
      notes.push('Uses location to plan — live location is never shared continuously.')
    }
    if (notes.length === 0) {
      notes.push('Read-only discovery and drafts; nothing leaves Passport without approval.')
    }

    // The headline risk is the true max across every capability touched — a critical commit
    // (e.g. authorizing payment for a ride) surfaces as 'critical', not a softened 'high'.
    const level: RiskLevel = commits.some((c) => getCapability(c).risk === 'critical') ? 'critical' : base
    return { risk_level: level, notes }
  },
}
