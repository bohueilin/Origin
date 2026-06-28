// RevocationManager — immediate, verifiable kill switch. Revoking a grant flips its status
// and stamps revoked_at; every subsequent tool call then fails closed via GrantManager.

import type { CapabilityGrant } from '../types'

export const RevocationManager = {
  revoke(grant: CapabilityGrant, now: number): CapabilityGrant {
    if (grant.status === 'revoked') return grant
    grant.status = 'revoked'
    grant.revoked_at = now
    return grant
  },

  /** Flip an active-but-past-expiry grant to 'expired' (display + fail-closed consistency). */
  reconcileExpiry(grant: CapabilityGrant, now: number): CapabilityGrant {
    if (grant.status === 'active' && grant.revoked_at === null && now >= grant.expires_at) {
      grant.status = 'expired'
    }
    return grant
  },
}
