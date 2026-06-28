import { describe, expect, it } from 'vitest'
import { brokerCapability } from './broker'
import { mockProvider, MOCK_SECRET } from './mockProvider'
import { onepasswordProvider } from './onepasswordProvider'
import { assertNoSecret, redact } from './redact'
import type { AuditEvent, CapabilityRequest, CredentialGrant, RuntimeContext } from './types'

const NOW = 1_900_000_000_000 // fixed clock for deterministic expiry tests

function makeGrant(over: Partial<CredentialGrant> = {}): CredentialGrant {
  return {
    id: 'grant-abc123',
    userId: 'user-1',
    orgId: null,
    agentId: 'agent-1',
    runId: 'run-1',
    provider: 'mock',
    targetService: 'Acme API',
    targetDomain: 'api.acme.com',
    vaultRef: 'vault-1',
    itemRef: 'item-1',
    scope: 'api_read',
    approvalPolicy: 'auto_low_risk',
    expiresAt: NOW + 60_000,
    usageLimit: 0,
    usageCount: 1, // not first-use by default, so low-risk auto-allows
    status: 'active',
    createdAt: NOW - 1000,
    revokedAt: null,
    ...over,
  }
}

function makeRequest(over: Partial<CapabilityRequest> = {}): CapabilityRequest {
  return {
    grantId: 'grant-abc123',
    agentId: 'agent-1',
    runId: 'run-1',
    scope: 'api_read',
    targetDomain: 'api.acme.com',
    action: 'GET /things',
    reason: 'fetch inventory',
    ...over,
  }
}

function makeContext(over: Partial<RuntimeContext> = {}): RuntimeContext {
  return { agentId: 'agent-1', runId: 'run-1', ip: '10.0.0.1', now: NOW, ...over }
}

/** Capture audit events and run the broker with the mock provider. */
async function run(over: {
  grant?: CredentialGrant | null
  request?: CapabilityRequest
  context?: RuntimeContext
  provider?: typeof mockProvider
} = {}) {
  const events: AuditEvent[] = []
  const result = await brokerCapability({
    grant: over.grant === undefined ? makeGrant() : over.grant,
    request: over.request ?? makeRequest(),
    context: over.context ?? makeContext(),
    provider: over.provider ?? mockProvider,
    audit: (e) => { events.push(e) },
    knownSecrets: [MOCK_SECRET],
  })
  return { result, events }
}

describe('credential broker — happy path', () => {
  it('allows a valid low-risk request and returns a non-secret capability', async () => {
    const { result, events } = await run()
    expect(result.decision).toBe('allowed')
    expect(result.capability).toBeDefined()
    expect(result.capability!.sessionHandle).toMatch(/^sess_/)
    // The capability carries no secret field, only a handle.
    expect(JSON.stringify(result)).not.toContain(MOCK_SECRET)
    expect(events.at(-1)!.eventType).toBe('credential_request_allowed')
  })

  it('never leaks the provider secret into the result or the audit trail', async () => {
    const { result, events } = await run()
    // Hard assertion across everything that could cross the boundary.
    assertNoSecret(result, [MOCK_SECRET])
    assertNoSecret(events, [MOCK_SECRET])
  })

  it('emits exactly one audit event on every call', async () => {
    const { events } = await run()
    expect(events).toHaveLength(1)
  })
})

describe('credential broker — denials (fail closed)', () => {
  it('denies when the grant does not exist', async () => {
    const { result } = await run({ grant: null })
    expect(result.decision).toBe('denied')
    expect(result.reason).toMatch(/not found/)
  })

  it('denies when the requesting agent does not match the grant', async () => {
    const { result } = await run({ request: makeRequest({ agentId: 'agent-evil' }) })
    expect(result.decision).toBe('denied')
    expect(result.reason).toMatch(/agent not authorized/)
  })

  it('denies when the run does not match the grant', async () => {
    const { result } = await run({ request: makeRequest({ runId: 'run-other' }) })
    expect(result.decision).toBe('denied')
    expect(result.reason).toMatch(/run not authorized/)
  })

  it('denies a revoked grant', async () => {
    const { result } = await run({ grant: makeGrant({ status: 'revoked', revokedAt: NOW - 10 }) })
    expect(result.decision).toBe('denied')
    expect(result.reason).toMatch(/revoked/)
  })

  it('denies an expired grant', async () => {
    const { result } = await run({ grant: makeGrant({ expiresAt: NOW - 1 }) })
    expect(result.decision).toBe('denied')
    expect(result.reason).toMatch(/expired/)
  })

  it('denies a scope mismatch', async () => {
    const { result } = await run({ request: makeRequest({ scope: 'cli_auth' }) })
    expect(result.decision).toBe('denied')
    expect(result.reason).toMatch(/scope mismatch/)
  })

  it('denies when the usage limit is reached', async () => {
    const { result } = await run({ grant: makeGrant({ usageLimit: 3, usageCount: 3 }) })
    expect(result.decision).toBe('denied')
    expect(result.reason).toMatch(/usage limit/)
  })

  it('denies a domain mismatch (fail closed)', async () => {
    const { result } = await run({ request: makeRequest({ targetDomain: 'evil.example.com' }) })
    expect(result.decision).toBe('denied')
    expect(result.reason).toMatch(/domain mismatch/)
  })

  it('normalizes domains so www/scheme differences still match', async () => {
    const { result } = await run({ request: makeRequest({ targetDomain: 'https://www.api.acme.com/path' }) })
    expect(result.decision).toBe('allowed')
  })

  it('always emits an audit event even on denial', async () => {
    const { events } = await run({ grant: null })
    expect(events).toHaveLength(1)
    expect(events[0].eventType).toBe('credential_request_denied')
  })
})

describe('credential broker — step-up approval', () => {
  it('requires approval when the grant policy is approval_required', async () => {
    const { result, events } = await run({ grant: makeGrant({ approvalPolicy: 'approval_required' }) })
    expect(result.decision).toBe('approval_required')
    expect(events.at(-1)!.eventType).toBe('credential_request_approval_required')
  })

  it('allows once the user has approved (context.approved=true)', async () => {
    const { result } = await run({
      grant: makeGrant({ approvalPolicy: 'approval_required' }),
      context: makeContext({ approved: true }),
    })
    expect(result.decision).toBe('allowed')
  })

  it('requires approval for a high-risk scope on first use', async () => {
    const { result } = await run({
      grant: makeGrant({ scope: 'website_login', usageCount: 0 }),
      request: makeRequest({ scope: 'website_login' }),
    })
    expect(result.decision).toBe('approval_required')
  })

  it('auto-allows a high-risk scope after first use', async () => {
    const { result } = await run({
      grant: makeGrant({ scope: 'website_login', usageCount: 2 }),
      request: makeRequest({ scope: 'website_login' }),
    })
    expect(result.decision).toBe('allowed')
  })
})

describe('credential broker — wallet safety', () => {
  it('never auto-resolves wallet_sign; it always requires human approval', async () => {
    const { result } = await run({
      grant: makeGrant({ scope: 'wallet_sign', targetService: 'Wallet', usageCount: 5 }),
      request: makeRequest({ scope: 'wallet_sign' }),
      // Even an already-approved context must not let the agent sign autonomously.
      context: makeContext({ approved: true }),
    })
    expect(result.decision).toBe('approval_required')
    expect(result.reason).toMatch(/human approval/)
  })
})

describe('credential broker — Rule of Two (lethal trifecta)', () => {
  it('allows a grant carrying at most two trifecta exposures', async () => {
    const { result } = await run({ grant: makeGrant({ trifectaPrivateData: true, trifectaExternalComms: true }) })
    expect(result.decision).toBe('allowed')
  })

  it('forces a human when a grant carries all three exposures', async () => {
    const { result } = await run({ grant: makeGrant({ trifectaPrivateData: true, trifectaUntrustedContent: true, trifectaExternalComms: true }) })
    expect(result.decision).toBe('approval_required')
    expect(result.reason).toMatch(/lethal trifecta/)
  })

  it('permits all three once the human has approved', async () => {
    const { result } = await run({
      grant: makeGrant({ trifectaPrivateData: true, trifectaUntrustedContent: true, trifectaExternalComms: true }),
      context: makeContext({ approved: true }),
    })
    expect(result.decision).toBe('allowed')
  })
})

describe('credential broker — provider fail-closed', () => {
  it('denies (does not throw) when the 1Password scaffold provider is unconfigured', async () => {
    const { result, events } = await run({
      grant: makeGrant({ provider: 'onepassword' }),
      provider: onepasswordProvider as unknown as typeof mockProvider,
    })
    expect(result.decision).toBe('denied')
    expect(result.reason).toMatch(/provider error \(fail closed\)/)
    expect(events.at(-1)!.eventType).toBe('credential_request_denied')
  })
})

describe('redact helpers', () => {
  it('redacts secret-shaped keys but keeps benign fields', () => {
    const out = redact({ password: 'hunter2', token: 'abc', service: 'Acme', nested: { apiKey: 'x', ok: 1 } }) as Record<string, unknown>
    expect(out.password).toBe('[redacted]')
    expect(out.token).toBe('[redacted]')
    expect(out.service).toBe('Acme')
    expect((out.nested as Record<string, unknown>).apiKey).toBe('[redacted]')
    expect((out.nested as Record<string, unknown>).ok).toBe(1)
  })

  it('assertNoSecret throws when a known secret appears anywhere', () => {
    expect(() => assertNoSecret({ a: { b: `leaked ${MOCK_SECRET}` } }, [MOCK_SECRET])).toThrow(/secret leak blocked/)
    expect(() => assertNoSecret({ a: 'clean' }, [MOCK_SECRET])).not.toThrow()
  })
})
