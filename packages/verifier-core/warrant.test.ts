import { describe, it, expect } from 'vitest'
import { generateAgentKey } from './countersign-identity.mjs'
import { mintWarrant, verifyWarrant, foldAgentChain } from './warrant.mjs'

// Build a complete, contiguous, diverse, L4-worthy backing for an agent.
function goodBacking() {
  return Array.from({ length: 6 }, (_, i) => ({
    agent_seq: i,
    trace_id: `trace-${i}`,
    audit_row_digest: 'd'.repeat(63) + i, // stand-in for the gym's existing tamper-evident row digest
    scenario_id: `scn-${i}`,
    split: i === 0 ? ('heldout' as const) : ('train' as const),
    passed: true,
    reward: 1,
    catastrophic: false,
  }))
}

const issuer = generateAgentKey()
const agent = generateAgentKey()

function mintGood(overrides: Record<string, unknown> = {}) {
  return mintWarrant({
    agentThumbprint: agent.thumbprint,
    backing: goodBacking(),
    versions: { verifier_version: 'v1', reward_model_version: 'r1', environment_name: 'janus-gym' },
    capabilityManifestDigest: 'manifest-digest-abc',
    issuerPrivateJwk: issuer.privateJwk,
    issuerThumbprint: issuer.thumbprint,
    issuedAt: 1000,
    epoch: 1,
    ...overrides,
  })
}

describe('Warrant — mint and honest verify', () => {
  it('a diverse all-pass record mints and verifies as L4, re-derived', () => {
    const w = mintGood()
    expect(w.license_level).toBe('L4')
    const r = verifyWarrant(w, { issuerPublicJwk: issuer.publicJwk, expectedIssuerThumbprint: issuer.thumbprint })
    expect(r.ok).toBe(true)
    expect(r.code).toBe(0)
    expect(r.level).toBe('L4')
  })

  it('the chain head binds the complete ordered verdict set', () => {
    const chain = foldAgentChain(goodBacking())
    expect(chain.ok).toBe(true)
    expect(chain.head).toHaveLength(64)
  })
})

describe('Warrant — the forgery surfaces are closed', () => {
  it('code 1: tampering a signed (non-backing) field breaks the self-digest', () => {
    const w = mintGood()
    // license_level and capability_manifest_digest are inside warrant_digest → editing them breaks it.
    const tampered = { ...w, capability_manifest_digest: 'attacker-swapped-policy' }
    const r = verifyWarrant(tampered, { issuerPublicJwk: issuer.publicJwk })
    expect(r.ok).toBe(false)
    expect(r.code).toBe(1)
  })

  it('code 4: mutating a backing row (reward flip) breaks the committed chain head', () => {
    const w = mintGood()
    // backing is committed via chain_head, not inlined in the self-digest → a reward flip
    // re-folds to a different head than the signed one: INCOMPLETE/forged chain, not a silent pass.
    const mutated = { ...w, backing: w.backing.map((b, i) => (i === 2 ? { ...b, reward: -1 } : b)) }
    const r = verifyWarrant(mutated, { issuerPublicJwk: issuer.publicJwk })
    expect(r.ok).toBe(false)
    expect(r.code).toBe(4)
  })

  it('code 2: a warrant signed by the wrong key fails issuer verification', () => {
    const rogue = generateAgentKey()
    const w = mintGood({ issuerPrivateJwk: rogue.privateJwk, issuerThumbprint: rogue.thumbprint })
    const r = verifyWarrant(w, { issuerPublicJwk: issuer.publicJwk }) // pin the REAL gym key
    expect(r.ok).toBe(false)
    expect(r.code).toBe(2)
  })

  it('code 3: LEVEL INFLATION — a rogue issuer claims L4 on an L2 record → re-derivation disagrees', async () => {
    // A rogue signer WITH a key mints a warrant claiming L4, but the backing only supports L2
    // (all the same scenario). Pin to the rogue key so the signature passes and we isolate the
    // re-derivation catch: the level does not re-derive from the evidence.
    const rogue = generateAgentKey()
    const thinBacking = Array.from({ length: 6 }, (_, i) => ({
      agent_seq: i,
      trace_id: `t-${i}`,
      audit_row_digest: 'e'.repeat(63) + i,
      scenario_id: 'same-easy-scenario', // no diversity → caps at L2
      split: 'train' as const,
      passed: true,
      reward: 1,
      catastrophic: false,
    }))
    // Mint honestly (will be L2), then forge the claimed level and re-sign as the rogue issuer.
    const honest = mintWarrant({
      agentThumbprint: agent.thumbprint,
      backing: thinBacking,
      issuerPrivateJwk: rogue.privateJwk,
      issuerThumbprint: rogue.thumbprint,
      issuedAt: 1000,
      epoch: 1,
    })
    expect(honest.license_level).toBe('L2')
    // Forge: bump the claimed level, recompute the self-digest, re-sign with the rogue key.
    const { signPayload } = await import('./countersign-identity.mjs')
    const { sha256, canonical } = await import('@origin/evidence/env-evidence')
    const forged: Record<string, unknown> = { ...honest, license_level: 'L4' }
    // Recompute the self-digest exactly as warrant.mjs does: exclude digest, signature, and
    // the raw backing array (backing is committed via chain_head, which is unchanged here).
    const { warrant_digest: _wd, issuer_signature: _sig, backing: _bk, ...rest } = forged
    void _wd
    void _sig
    void _bk
    const digest = sha256(canonical(rest))
    forged.warrant_digest = digest
    forged.issuer_signature = signPayload({ warrant_digest: digest }, rogue.privateJwk)
    const r = verifyWarrant(forged as never, { issuerPublicJwk: rogue.publicJwk })
    expect(r.ok).toBe(false)
    expect(r.code).toBe(3) // level inflation caught by re-derivation, not by signature
  })

  it('code 4: CHERRY-PICKING — dropping the worst evidence row breaks the signed chain head', () => {
    // Make a record with one bad (non-catastrophic) row that pulls the level down.
    const backing = [
      ...Array.from({ length: 5 }, (_, i) => ({
        agent_seq: i,
        trace_id: `t-${i}`,
        audit_row_digest: 'f'.repeat(63) + i,
        scenario_id: `scn-${i}`,
        split: i === 0 ? ('heldout' as const) : ('train' as const),
        passed: true,
        reward: 1,
        catastrophic: false,
      })),
      { agent_seq: 5, trace_id: 't-5', audit_row_digest: 'f'.repeat(63) + 5, scenario_id: 'scn-5', split: 'train' as const, passed: false, reward: -1, catastrophic: false },
    ]
    const w = mintWarrant({
      agentThumbprint: agent.thumbprint,
      backing,
      issuerPrivateJwk: issuer.privateJwk,
      issuerThumbprint: issuer.thumbprint,
      issuedAt: 1000,
      epoch: 1,
    })
    // Attacker drops the failing row (seq 5) to inflate the record, WITHOUT re-signing (no key).
    const cherryPicked = { ...w, backing: w.backing.filter((b) => b.agent_seq !== 5) }
    const r = verifyWarrant(cherryPicked, { issuerPublicJwk: issuer.publicJwk })
    expect(r.ok).toBe(false)
    expect(r.code).toBe(4) // incomplete chain — the head no longer matches the signed head
  })

  it('code 4: a gap in agent_seq (omitted middle row) is rejected', () => {
    const w = mintGood()
    const gapped = { ...w, backing: w.backing.filter((b) => b.agent_seq !== 3) }
    const r = verifyWarrant(gapped, { issuerPublicJwk: issuer.publicJwk })
    expect(r.ok).toBe(false)
    expect(r.code).toBe(4)
  })

  it('code 5: a valid signature from an UNEXPECTED issuer is rejected under a pin', () => {
    const rogue = generateAgentKey()
    const w = mintGood({ issuerPrivateJwk: rogue.privateJwk, issuerThumbprint: rogue.thumbprint })
    const r = verifyWarrant(w, { issuerPublicJwk: rogue.publicJwk, expectedIssuerThumbprint: issuer.thumbprint })
    expect(r.ok).toBe(false)
    expect(r.code).toBe(5)
  })

  it('code 6: a stale epoch (below the revocation floor) is rejected', () => {
    const w = mintGood({ epoch: 1 })
    const r = verifyWarrant(w, { issuerPublicJwk: issuer.publicJwk, minEpoch: 2 })
    expect(r.ok).toBe(false)
    expect(r.code).toBe(6)
  })

  it('code 6: a warrant past its freshness window is rejected', () => {
    const w = mintGood({ issuedAt: 1000, freshnessWindowMs: 5000 })
    const r = verifyWarrant(w, { issuerPublicJwk: issuer.publicJwk, now: 1000 + 6000 })
    expect(r.ok).toBe(false)
    expect(r.code).toBe(6)
  })

  it('code 7: a malformed warrant is rejected', () => {
    const r = verifyWarrant({ nope: true } as never, { issuerPublicJwk: issuer.publicJwk })
    expect(r.ok).toBe(false)
    expect(r.code).toBe(7)
  })
})
