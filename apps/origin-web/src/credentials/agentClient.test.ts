import { describe, expect, it, vi } from 'vitest'
import { AutonomyAgentClient, type CapabilityAsk } from './agentClient'

const ask: CapabilityAsk = { grantId: 'g1', agentId: 'travel-concierge', scope: 'api_read', targetDomain: 'api.acme.com', action: 'GET /things' }

function clientWith(responseBody: unknown, capture?: (url: string, init: RequestInit) => void) {
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    capture?.(url, init)
    return { json: async () => responseBody } as Response
  }) as unknown as typeof fetch
  return new AutonomyAgentClient({ brokerUrl: 'https://broker.example/functions/credential-broker', agentToken: 'cak_test', fetchImpl })
}

describe('AutonomyAgentClient', () => {
  it('requires brokerUrl and agentToken', () => {
    expect(() => new AutonomyAgentClient({ brokerUrl: '', agentToken: 't' })).toThrow()
    expect(() => new AutonomyAgentClient({ brokerUrl: 'u', agentToken: '' })).toThrow()
  })

  it('sends the opaque token via x-agent-token (never Authorization)', async () => {
    let seen: RequestInit | undefined
    const c = clientWith({ decision: 'allowed', reason: 'ok' }, (_u, init) => { seen = init })
    await c.requestCapability(ask)
    const headers = seen!.headers as Record<string, string>
    expect(headers['x-agent-token']).toBe('cak_test')
    expect(headers.Authorization).toBeUndefined()
    expect(JSON.parse(seen!.body as string).grantId).toBe('g1')
  })

  it('returns the broker decision verbatim and never exposes a secret field', async () => {
    const c = clientWith({ decision: 'allowed', reason: 'capability granted', capability: { grantId: 'g1', scope: 'api_read', targetService: 'Acme', targetDomain: 'api.acme.com', sessionHandle: 'sess_x', expiresAt: 1 } })
    const d = await c.requestCapability(ask)
    expect(d.decision).toBe('allowed')
    expect(d.capability?.sessionHandle).toBe('sess_x')
    // The capability is a handle — there is no secret/password/token field on it.
    expect(JSON.stringify(d)).not.toMatch(/password|secret|private_?key|seed/i)
  })

  it('treats denied as a normal result, not an error', async () => {
    const c = clientWith({ decision: 'denied', reason: 'domain mismatch (fail closed)' })
    const d = await c.requestCapability(ask)
    expect(d.decision).toBe('denied')
    expect(await clientWith({ decision: 'denied', reason: 'x' }).isAllowed(ask)).toBe(false)
  })

  it('reports approval_required so the agent can wait for a human', async () => {
    const c = clientWith({ decision: 'approval_required', reason: 'step-up approval required' })
    expect((await c.requestCapability(ask)).decision).toBe('approval_required')
  })

  it('throws (fail closed) on an unexpected broker response', async () => {
    const c = clientWith({ oops: true })
    await expect(c.requestCapability(ask)).rejects.toThrow(/unexpected/)
  })
})
