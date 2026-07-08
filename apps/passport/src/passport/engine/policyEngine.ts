// CapabilityPolicyEngine — decides which capabilities Janus will grant, deny, and gate.
//
// The rule, fail-closed by construction:
//   allowed   = requested capabilities that are NOT side-effecting and NOT globally forbidden
//   denied    = every side-effecting / forbidden capability the plan could touch
//   approvals = the commit capabilities the plan will attempt (denied to the agent, but each
//               can be unlocked once by an explicit human approval — and even then is simulated)
//
// So the agent is granted only discovery + drafting power; anything that affects the outside
// world is denied to it and reachable solely through a per-action approval.

import type { Capability } from '../types'
import { GLOBAL_FORBIDDEN, isSideEffecting } from '../capabilities'

export interface PolicyDecision {
  allowed_capabilities: Capability[]
  denied_capabilities: Capability[]
  requires_approval_for: Capability[]
}

export const CapabilityPolicyEngine = {
  decide(requested: Capability[], commits: Capability[]): PolicyDecision {
    const forbidden = new Set<Capability>(GLOBAL_FORBIDDEN)

    const allowed = uniq(requested.filter((c) => !isSideEffecting(c) && !forbidden.has(c)))

    // Anything requested that is side-effecting is refused outright (shouldn't happen, but
    // fail closed). Plus the declared commits + the global forbidden set + payment.
    const denied = uniq([
      ...requested.filter((c) => isSideEffecting(c) || forbidden.has(c)),
      ...commits,
      ...GLOBAL_FORBIDDEN,
    ])

    // Approval can unlock a denied commit once; never a globally-forbidden capability.
    const requires_approval_for = uniq(commits.filter((c) => !forbidden.has(c)))

    return { allowed_capabilities: allowed, denied_capabilities: denied, requires_approval_for }
  },
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}
