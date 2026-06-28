// Mock credential provider for tests + local development. It holds a real-looking
// secret internally and performs the action server-side, but returns ONLY an opaque,
// task-scoped session handle + redacted metadata. The secret must NEVER cross the
// agent boundary — broker tests assert this against MOCK_SECRET.
import type { CredentialGrant, CapabilityRequest, CredentialProvider, ProviderResolution } from './types'
import { redact } from './redact'

// A stand-in for a vaulted secret. Only the provider sees it; the broker strips it.
export const MOCK_SECRET = 'MOCK-SECRET-pw-do-not-leak-7f3a91'

function handle(grant: CredentialGrant, request: CapabilityRequest): string {
  // Opaque, deterministic-ish handle. Carries no secret and cannot be exchanged
  // for one — it only identifies a brokered session for this grant + run.
  const runPart = (request.runId ?? grant.runId ?? 'norun').slice(0, 12)
  return `sess_${grant.id.slice(0, 8)}_${grant.scope}_${runPart}`
}

export const mockProvider: CredentialProvider = {
  id: 'mock',

  async resolveCapability(grant: CredentialGrant, request: CapabilityRequest): Promise<ProviderResolution> {
    // In a real provider this is where the secret is used (open a session, sign in,
    // mint a scoped token) entirely server-side. Here we just prove we HAVE it...
    void MOCK_SECRET
    return {
      sessionHandle: handle(grant, request),
      // redact() guarantees nothing secret-shaped leaks even if a field is added later.
      serviceMetadataRedacted: redact({
        provider: 'mock',
        service: grant.targetService,
        domain: grant.targetDomain,
        scope: grant.scope,
      }) as Record<string, unknown>,
    }
  },

  async revokeGrant(): Promise<void> {
    // No external session to tear down for the mock.
  },
}
