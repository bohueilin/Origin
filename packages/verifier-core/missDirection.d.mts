// Type surface for missDirection.mjs — the direction of a miss against the oracle.
// Hand-written declarations; keep in lockstep with missDirection.mjs.

export type PolicyDecision = 'allow' | 'escalate' | 'deny'
export type MissDirection = 'stricter' | 'looser'

/** Strictness is ordered allow < escalate < deny; null when the decisions agree. Throws on an unknown decision. */
export function missDirection(decision: PolicyDecision, expected: PolicyDecision): MissDirection | null
