import { describe, it, expect } from 'vitest'
import { generateAgentKey, buildPopChallenge, signPayload } from '@origin/verifier-core/countersign-identity'
import { mintWarrant } from '@origin/verifier-core/warrant'
import { countersignGate, type CountersignPresentation, type GateContext } from './countersignGate.ts'
import { manifestDigest } from './scopePolicy.ts'

const ROUTE = '/api/janus/countersign/act'
const issuer = generateAgentKey()

function diverseBacking() {
  return Array.from({ length: 6 }, (_, i) => ({
    agent_seq: i,
    trace_id: `t-${i}`,
    audit_row_digest: 'a'.repeat(63) + i,
    scenario_id: `scn-${i}`,
    split: i === 0 ? ('heldout' as const) : ('train' as const),
    passed: true,
    reward: 1,
    catastrophic: false,
  }))
}

function mintFor(agentThumbprint: string, backing = diverseBacking(), epoch = 1) {
  return mintWarrant({
    agentThumbprint,
    backing,
    capabilityManifestDigest: manifestDigest(),
    issuerPrivateJwk: issuer.privateJwk,
    issuerThumbprint: issuer.thumbprint,
    issuedAt: 1000,
    epoch,
    freshnessWindowMs: 15 * 60 * 1000,
  })
}

function present(agent: ReturnType<typeof generateAgentKey>, warrant: ReturnType<typeof mintFor>, capability: string, nonce = 'n1'): { p: CountersignPresentation; body: Record<string, unknown> } {
  const body = { capability, item_ref: 'op://Personal/luma-account', warrant_digest: warrant.warrant_digest }
  const challenge = buildPopChallenge({ agentThumbprint: agent.thumbprint, route: ROUTE, body, nonce, iat: 1000 })
  const signature = signPayload(challenge, agent.privateJwk)
  return {
    p: { agentPublicJwk: agent.publicJwk, popChallenge: challenge, popSignature: signature, warrant, capability, itemRef: 'op://Personal/luma-account' },
    body,
  }
}

function ctx(over: Partial<GateContext> = {}): GateContext {
  return {
    route: ROUTE,
    body: over.body ?? {},
    now: 1000,
    nonceOk: true,
    issuerPublicJwk: issuer.publicJwk,
    issuerThumbprint: issuer.thumbprint,
    capabilityManifestDigest: manifestDigest(),
    ...over,
  }
}

describe('countersignGate — the ordered, fail-closed enforcement gate', () => {
  it('ALLOW: L4 agent, valid PoP, in-scope read capability', () => {
    const agent = generateAgentKey()
    const w = mintFor(agent.thumbprint)
    expect(w.license_level).toBe('L4')
    const { p, body } = present(agent, w, 'calendar.read')
    const d = countersignGate(p, ctx({ body }))
    expect(d.decision).toBe('allow')
    expect(d.level).toBe('L4')
  })

  it('WRONG_HOLDER: a stolen Warrant presented from a different keypair dies before scope', () => {
    const owner = generateAgentKey()
    const thief = generateAgentKey()
    const w = mintFor(owner.thumbprint) // warrant belongs to owner
    // thief signs a valid PoP with ITS OWN key but presents the owner's warrant
    const body = { capability: 'calendar.read', item_ref: 'op://Personal/luma-account', warrant_digest: w.warrant_digest }
    const challenge = buildPopChallenge({ agentThumbprint: thief.thumbprint, route: ROUTE, body, nonce: 'n2', iat: 1000 })
    const signature = signPayload(challenge, thief.privateJwk)
    const d = countersignGate(
      { agentPublicJwk: thief.publicJwk, popChallenge: challenge, popSignature: signature, warrant: w, capability: 'calendar.read' },
      ctx({ body }),
    )
    expect(d.decision).toBe('deny')
    expect(d.code).toBe('WRONG_HOLDER')
    expect(d.gate).toBe('holder')
  })

  it('POP_INVALID: a forged possession signature is rejected', () => {
    const agent = generateAgentKey()
    const attacker = generateAgentKey()
    const w = mintFor(agent.thumbprint)
    const body = { capability: 'calendar.read', item_ref: 'op://Personal/luma-account', warrant_digest: w.warrant_digest }
    const challenge = buildPopChallenge({ agentThumbprint: agent.thumbprint, route: ROUTE, body, nonce: 'n3', iat: 1000 })
    const signature = signPayload(challenge, attacker.privateJwk) // wrong key
    const d = countersignGate(
      { agentPublicJwk: agent.publicJwk, popChallenge: challenge, popSignature: signature, warrant: w, capability: 'calendar.read' },
      ctx({ body }),
    )
    expect(d.decision).toBe('deny')
    expect(d.code).toBe('POP_INVALID')
  })

  it('NONCE_REPLAY: a reused nonce is rejected', () => {
    const agent = generateAgentKey()
    const w = mintFor(agent.thumbprint)
    const { p, body } = present(agent, w, 'calendar.read')
    const d = countersignGate(p, ctx({ body, nonceOk: false }))
    expect(d.decision).toBe('deny')
    expect(d.code).toBe('NONCE_REPLAY')
  })

  it('QUARANTINED: a tainted agent is refused before any secret is fetched', () => {
    const agent = generateAgentKey()
    const w = mintFor(agent.thumbprint)
    const { p, body } = present(agent, w, 'calendar.read')
    const d = countersignGate(p, ctx({ body, isTainted: (t) => t === agent.thumbprint }))
    expect(d.decision).toBe('deny')
    expect(d.code).toBe('QUARANTINED')
    expect(d.gate).toBe('quarantine')
  })

  it('WARRANT_INVALID: a stale epoch Warrant is rejected', () => {
    const agent = generateAgentKey()
    const w = mintFor(agent.thumbprint, diverseBacking(), 1)
    const { p, body } = present(agent, w, 'calendar.read')
    const d = countersignGate(p, ctx({ body, minEpoch: 5 }))
    expect(d.decision).toBe('deny')
    expect(d.code).toBe('WARRANT_INVALID')
  })

  it('OUT_OF_SCOPE: an L2 agent cannot exercise a capability above its ceiling', () => {
    const agent = generateAgentKey()
    // farm one scenario → diversity gate caps at L2
    const farmed = Array.from({ length: 6 }, (_, i) => ({
      agent_seq: i,
      trace_id: `f-${i}`,
      audit_row_digest: 'b'.repeat(63) + i,
      scenario_id: 'same',
      split: 'train' as const,
      passed: true,
      reward: 1,
      catastrophic: false,
    }))
    const w = mintFor(agent.thumbprint, farmed)
    expect(w.license_level).toBe('L2')
    // credential.scoped_request is an L3 capability → out of scope at L2
    const { p, body } = present(agent, w, 'credential.scoped_request')
    const d = countersignGate(p, ctx({ body }))
    expect(d.decision).toBe('deny')
    expect(d.code).toBe('OUT_OF_SCOPE')
  })

  it('REQUIRES_APPROVAL: a high-risk commit never auto-allows, even at L4', () => {
    const agent = generateAgentKey()
    const w = mintFor(agent.thumbprint) // L4
    const { p, body } = present(agent, w, 'messages.send') // always human-approval
    const d = countersignGate(p, ctx({ body }))
    expect(d.decision).toBe('deny')
    expect(d.code).toBe('REQUIRES_APPROVAL')
  })

  it('the PoP is bound to the request body (swapped capability voids it)', () => {
    const agent = generateAgentKey()
    const w = mintFor(agent.thumbprint)
    const { p, body } = present(agent, w, 'calendar.read')
    // gate is told the body is for a DIFFERENT capability than the PoP signed
    const d = countersignGate(p, ctx({ body: { ...body, capability: 'messages.send' } }))
    expect(d.decision).toBe('deny')
    expect(d.code).toBe('POP_INVALID')
  })
})
