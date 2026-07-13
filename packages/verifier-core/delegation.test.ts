import { describe, it, expect } from 'vitest'
import { canonical, sha256 } from '@origin/evidence/env-evidence'
import { generateAgentKey, signPayload } from './countersign-identity.mjs'
import { mintDelegation, verifyDelegationChain, intersectCaveats, effectiveCeiling, validateCaveats, DELEGATION_DENY } from './delegation.mjs'

// ── fixtures ───────────────────────────────────────────────────────────────
// Four agents in a delegation lineage plus an unrelated attacker key. Keys are the ONLY
// randomness; everything else (issued_at, digests) is deterministic from the inputs.
const root = generateAgentKey() // holds the earned Warrant
const a = generateAgentKey() // first grantee
const b = generateAgentKey() // second grantee
const c = generateAgentKey() // leaf grantee
const attacker = generateAgentKey() // never in the chain

/** A minimal root Warrant anchor — verifyDelegationChain reads only agent_thumbprint + digest. */
function rootWarrant(thumbprint: string, level = 'L3') {
  const w: Record<string, unknown> = { warrant_schema_version: '1.0.0', subject: 'agent', agent_thumbprint: thumbprint, license_level: level }
  w.warrant_digest = sha256(canonical(w))
  return w
}
const WARRANT = rootWarrant(root.thumbprint)

/** Build the canonical 3-hop narrowing chain: root→A→B→C, each strictly narrower. */
function narrowingChain() {
  const cert0 = mintDelegation({
    parentThumbprint: root.thumbprint,
    parentPrivateJwk: root.privateJwk,
    childThumbprint: a.thumbprint,
    caveats: { tools: ['read', 'write', 'deploy'], capabilities: ['api', 'db'], path_prefix: '/proj/', budget: 1000, ttl_ms: 100_000, max_depth: 5, audience: 'payments' },
    parentDelegationDigest: WARRANT.warrant_digest as string,
    depth: 1,
    issuedAt: 1000,
  })
  const cert1 = mintDelegation({
    parentThumbprint: a.thumbprint,
    parentPrivateJwk: a.privateJwk,
    childThumbprint: b.thumbprint,
    caveats: { tools: ['read', 'write'], budget: 500, path_prefix: '/proj/sub/' },
    parentDelegationDigest: cert0.cert_digest,
    depth: 2,
    issuedAt: 2000,
  })
  const cert2 = mintDelegation({
    parentThumbprint: b.thumbprint,
    parentPrivateJwk: b.privateJwk,
    childThumbprint: c.thumbprint,
    caveats: { tools: ['read'], budget: 100 },
    parentDelegationDigest: cert1.cert_digest,
    depth: 3,
    issuedAt: 3000,
  })
  return { cert0, cert1, cert2 }
}

describe('Countersign delegation — a valid narrowing chain verifies + intersects', () => {
  it('a 3-hop root→A→B→C chain verifies and the leaf caveats are the intersection', () => {
    const { cert0, cert1, cert2 } = narrowingChain()
    const v = verifyDelegationChain([WARRANT, cert0, cert1, cert2])
    expect(v).toMatchObject({ ok: true, code: DELEGATION_DENY.VALID, depth: 3 })
    // leaf effective = narrower of each dimension down the whole chain
    expect(v.effectiveCaveats).toMatchObject({
      tools: ['read'], // ['read','write','deploy'] → ['read','write'] → ['read']
      capabilities: ['api', 'db'], // inherited from cert0 (children never re-specified)
      path_prefix: '/proj/sub/', // extended once
      budget: 100, // 1000 → 500 → 100
      ttl_ms: 100_000, // inherited from cert0
      audience: 'payments',
      max_depth: 3, // 5 (cert0) → 4 (cert1) → 3 (cert2): further delegations still allowed below C
    })
  })

  it('accepts the bare-certs form with an external root anchor (no head Warrant)', () => {
    const { cert0, cert1 } = narrowingChain()
    const v = verifyDelegationChain([cert0, cert1], {
      rootThumbprint: root.thumbprint,
      rootDelegationDigest: WARRANT.warrant_digest as string,
    })
    expect(v).toMatchObject({ ok: true, code: 0 })
  })

  it('verifies with parent keys supplied out-of-band (opts.publicJwks), not embedded', () => {
    const { cert0, cert1, cert2 } = narrowingChain()
    const publicJwks = { [root.thumbprint]: root.publicJwk, [a.thumbprint]: a.publicJwk, [b.thumbprint]: b.publicJwk }
    expect(verifyDelegationChain([WARRANT, cert0, cert1, cert2], { publicJwks }).ok).toBe(true)
  })

  it('is deterministic — the same inputs mint a byte-identical cert', () => {
    const one = narrowingChain().cert0
    const two = narrowingChain().cert0
    expect(one.cert_digest).toBe(two.cert_digest)
    expect(one.parent_signature).toBe(two.parent_signature)
  })
})

describe('Countersign delegation — every deny code (fail-closed enforcement)', () => {
  it('code 1 TAMPERED — mutating a caveat without re-sealing breaks the self-digest', () => {
    const { cert0, cert1, cert2 } = narrowingChain()
    const tampered = { ...cert2, caveats: { ...cert2.caveats, budget: 9999 } } // widen budget, keep old digest
    const v = verifyDelegationChain([WARRANT, cert0, cert1, tampered])
    expect(v).toMatchObject({ ok: false, code: DELEGATION_DENY.TAMPERED })
  })

  it('code 2 BAD_PARENT_SIG — a signature from a different key is rejected', () => {
    const { cert0, cert1, cert2 } = narrowingChain()
    // Keep the (valid) embedded parent key + digest, but swap in the attacker's signature.
    const forged = { ...cert2, parent_signature: signPayload({ cert_digest: cert2.cert_digest }, attacker.privateJwk) }
    const v = verifyDelegationChain([WARRANT, cert0, cert1, forged])
    expect(v).toMatchObject({ ok: false, code: DELEGATION_DENY.BAD_PARENT_SIG })
  })

  it('code 2 BAD_PARENT_SIG — an embedded key that does not own the claimed parent id is rejected', () => {
    const { cert0, cert1, cert2 } = narrowingChain()
    // Attacker re-signs with their own key AND embeds their own pub key, but keeps b's thumbprint.
    const digest = sha256(
      canonical({
        delegation_schema_version: cert2.delegation_schema_version,
        v: cert2.v,
        parent_thumbprint: cert2.parent_thumbprint, // still claims b
        child_thumbprint: cert2.child_thumbprint,
        caveats: cert2.caveats,
        parent_delegation_digest: cert2.parent_delegation_digest,
        depth: cert2.depth,
        issued_at: cert2.issued_at,
        parent_public_jwk: attacker.publicJwk, // ...but the key is the attacker's
      }),
    )
    const forged = { ...cert2, parent_public_jwk: attacker.publicJwk, cert_digest: digest, parent_signature: signPayload({ cert_digest: digest }, attacker.privateJwk) }
    const v = verifyDelegationChain([WARRANT, cert0, cert1, forged])
    expect(v).toMatchObject({ ok: false, code: DELEGATION_DENY.BAD_PARENT_SIG })
  })

  it('code 3 SCOPE_ESCALATION — a child adding a tool the parent never held', () => {
    const cert0 = mintDelegation({ parentPrivateJwk: root.privateJwk, childThumbprint: a.thumbprint, caveats: { tools: ['read', 'write'] }, parentDelegationDigest: WARRANT.warrant_digest as string, depth: 1 })
    const cert1 = mintDelegation({ parentPrivateJwk: a.privateJwk, childThumbprint: b.thumbprint, caveats: { tools: ['read', 'admin'] }, parentDelegationDigest: cert0.cert_digest, depth: 2 })
    const v = verifyDelegationChain([WARRANT, cert0, cert1])
    expect(v).toMatchObject({ ok: false, code: DELEGATION_DENY.SCOPE_ESCALATION })
    expect(v.reason).toMatch(/admin/)
  })

  it('code 3 SCOPE_ESCALATION — a child asking a BIGGER budget than the parent', () => {
    const cert0 = mintDelegation({ parentPrivateJwk: root.privateJwk, childThumbprint: a.thumbprint, caveats: { budget: 500 }, parentDelegationDigest: WARRANT.warrant_digest as string, depth: 1 })
    const cert1 = mintDelegation({ parentPrivateJwk: a.privateJwk, childThumbprint: b.thumbprint, caveats: { budget: 2000 }, parentDelegationDigest: cert0.cert_digest, depth: 2 })
    expect(verifyDelegationChain([WARRANT, cert0, cert1])).toMatchObject({ ok: false, code: DELEGATION_DENY.SCOPE_ESCALATION })
  })

  it('code 3 SCOPE_ESCALATION — a child asking a LONGER ttl than the parent', () => {
    const cert0 = mintDelegation({ parentPrivateJwk: root.privateJwk, childThumbprint: a.thumbprint, caveats: { ttl_ms: 10_000 }, parentDelegationDigest: WARRANT.warrant_digest as string, depth: 1 })
    const cert1 = mintDelegation({ parentPrivateJwk: a.privateJwk, childThumbprint: b.thumbprint, caveats: { ttl_ms: 60_000 }, parentDelegationDigest: cert0.cert_digest, depth: 2 })
    expect(verifyDelegationChain([WARRANT, cert0, cert1])).toMatchObject({ ok: false, code: DELEGATION_DENY.SCOPE_ESCALATION })
  })

  it('code 3 SCOPE_ESCALATION — a child path that escapes the parent subtree', () => {
    const cert0 = mintDelegation({ parentPrivateJwk: root.privateJwk, childThumbprint: a.thumbprint, caveats: { path_prefix: '/proj/' }, parentDelegationDigest: WARRANT.warrant_digest as string, depth: 1 })
    const cert1 = mintDelegation({ parentPrivateJwk: a.privateJwk, childThumbprint: b.thumbprint, caveats: { path_prefix: '/other/' }, parentDelegationDigest: cert0.cert_digest, depth: 2 })
    expect(verifyDelegationChain([WARRANT, cert0, cert1])).toMatchObject({ ok: false, code: DELEGATION_DENY.SCOPE_ESCALATION })
  })

  it('code 4 DEPTH_EXCEEDED — the max_depth budget decrements to zero and a further hop is denied', () => {
    // cert0 grants max_depth 1 → cert1 valid (budget 0 below B) → cert2 cannot exist.
    const cert0 = mintDelegation({ parentPrivateJwk: root.privateJwk, childThumbprint: a.thumbprint, caveats: { max_depth: 1 }, parentDelegationDigest: WARRANT.warrant_digest as string, depth: 1 })
    const cert1 = mintDelegation({ parentPrivateJwk: a.privateJwk, childThumbprint: b.thumbprint, caveats: {}, parentDelegationDigest: cert0.cert_digest, depth: 2 })
    const cert2 = mintDelegation({ parentPrivateJwk: b.privateJwk, childThumbprint: c.thumbprint, caveats: {}, parentDelegationDigest: cert1.cert_digest, depth: 3 })
    expect(verifyDelegationChain([WARRANT, cert0, cert1])).toMatchObject({ ok: true, code: 0 })
    expect(verifyDelegationChain([WARRANT, cert0, cert1, cert2])).toMatchObject({ ok: false, code: DELEGATION_DENY.DEPTH_EXCEEDED })
  })

  it('code 4 DEPTH_EXCEEDED — an absolute opts.maxDepth cap also denies', () => {
    const { cert0, cert1, cert2 } = narrowingChain()
    expect(verifyDelegationChain([WARRANT, cert0, cert1, cert2], { maxDepth: 2 })).toMatchObject({ ok: false, code: DELEGATION_DENY.DEPTH_EXCEEDED })
  })

  it('code 5 BROKEN_LINK — a cert whose parent_delegation_digest points nowhere real', () => {
    const cert0 = mintDelegation({ parentPrivateJwk: root.privateJwk, childThumbprint: a.thumbprint, caveats: { tools: ['read'] }, parentDelegationDigest: WARRANT.warrant_digest as string, depth: 1 })
    // cert1 is internally valid (digest + signature recompute) but links to a bogus parent digest.
    const cert1 = mintDelegation({ parentPrivateJwk: a.privateJwk, childThumbprint: b.thumbprint, caveats: { tools: ['read'] }, parentDelegationDigest: 'd'.repeat(64), depth: 2 })
    const v = verifyDelegationChain([WARRANT, cert0, cert1])
    expect(v).toMatchObject({ ok: false, code: DELEGATION_DENY.BROKEN_LINK })
  })

  it('code 5 BROKEN_LINK — someone who was never the grantee re-delegates', () => {
    const cert0 = mintDelegation({ parentPrivateJwk: root.privateJwk, childThumbprint: a.thumbprint, caveats: { tools: ['read'] }, parentDelegationDigest: WARRANT.warrant_digest as string, depth: 1 })
    // The attacker (not A) signs a "next hop" and correctly links the digest, but is not the grantee.
    const cert1 = mintDelegation({ parentPrivateJwk: attacker.privateJwk, childThumbprint: b.thumbprint, caveats: { tools: ['read'] }, parentDelegationDigest: cert0.cert_digest, depth: 2 })
    expect(verifyDelegationChain([WARRANT, cert0, cert1])).toMatchObject({ ok: false, code: DELEGATION_DENY.BROKEN_LINK })
  })

  it('code 6 WRONG_AUDIENCE — the chain audience does not match the resource server pin', () => {
    const { cert0, cert1, cert2 } = narrowingChain() // audience 'payments'
    const v = verifyDelegationChain([WARRANT, cert0, cert1, cert2], { expectedAudience: 'billing' })
    expect(v).toMatchObject({ ok: false, code: DELEGATION_DENY.WRONG_AUDIENCE })
  })

  it('code 6 WRONG_AUDIENCE — a child retargets the audience to a different service', () => {
    const cert0 = mintDelegation({ parentPrivateJwk: root.privateJwk, childThumbprint: a.thumbprint, caveats: { audience: 'payments' }, parentDelegationDigest: WARRANT.warrant_digest as string, depth: 1 })
    const cert1 = mintDelegation({ parentPrivateJwk: a.privateJwk, childThumbprint: b.thumbprint, caveats: { audience: 'billing' }, parentDelegationDigest: cert0.cert_digest, depth: 2 })
    expect(verifyDelegationChain([WARRANT, cert0, cert1])).toMatchObject({ ok: false, code: DELEGATION_DENY.WRONG_AUDIENCE })
  })

  it('code 6 WRONG_AUDIENCE happy inverse — the correct audience pin passes', () => {
    const { cert0, cert1, cert2 } = narrowingChain()
    expect(verifyDelegationChain([WARRANT, cert0, cert1, cert2], { expectedAudience: 'payments' }).ok).toBe(true)
  })

  it('code 7 MALFORMED — a non-object cert / bad caveat type / depth-position mismatch', () => {
    const { cert0, cert1 } = narrowingChain()
    expect(verifyDelegationChain([WARRANT, null as never])).toMatchObject({ ok: false, code: DELEGATION_DENY.MALFORMED })
    // a cert re-minted at the wrong depth position (depth 5 in slot 1) fails the position check
    const misdepth = mintDelegation({ parentPrivateJwk: root.privateJwk, childThumbprint: a.thumbprint, caveats: {}, parentDelegationDigest: WARRANT.warrant_digest as string, depth: 5 })
    expect(verifyDelegationChain([WARRANT, misdepth])).toMatchObject({ ok: false, code: DELEGATION_DENY.MALFORMED })
    void cert0
    void cert1
  })

  it('code 5 BROKEN_LINK — a chain pinned to the wrong root thumbprint', () => {
    const { cert0, cert1 } = narrowingChain()
    expect(verifyDelegationChain([WARRANT, cert0, cert1], { rootThumbprint: attacker.thumbprint })).toMatchObject({ ok: false, code: DELEGATION_DENY.BROKEN_LINK })
  })
})

describe('intersectCaveats — the monotonic-narrowing kernel in isolation', () => {
  it('returns the narrower of each dimension for a valid narrowing', () => {
    const r = intersectCaveats({ tools: ['a', 'b', 'c'], budget: 100, path_prefix: '/x/' }, { tools: ['a'], budget: 40, path_prefix: '/x/y/' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.effective).toMatchObject({ tools: ['a'], budget: 40, path_prefix: '/x/y/' })
  })

  it('flags an escalation marker with the offending dimension (no throw)', () => {
    const r = intersectCaveats({ budget: 100 }, { budget: 250 })
    expect(r).toMatchObject({ ok: false, escalation: true, dimension: 'budget' })
  })

  it('a child that specifies nothing inherits the parent unchanged (except decremented max_depth)', () => {
    const r = intersectCaveats({ tools: ['a'], budget: 10, max_depth: 3 }, {})
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.effective).toMatchObject({ tools: ['a'], budget: 10, max_depth: 2 })
  })
})

describe('effectiveCeiling — leaf authority = min(earned level, narrowed caveats)', () => {
  it('reports the governing level from the head Warrant and the intersected caveats', () => {
    const { cert0, cert1, cert2 } = narrowingChain()
    const ceil = effectiveCeiling({ chain: [WARRANT, cert0, cert1, cert2] })
    expect(ceil).toMatchObject({ ok: true, governingLevel: 'L3' })
    expect(ceil.levelRank).toBe(3)
    expect(ceil.effectiveCaveats).toMatchObject({ tools: ['read'], budget: 100 })
  })

  it('an explicit warrantLevel overrides, and a broken chain propagates the deny code', () => {
    const { cert0, cert1, cert2 } = narrowingChain()
    expect(effectiveCeiling({ warrantLevel: 'L4', chain: [WARRANT, cert0, cert1, cert2] }).governingLevel).toBe('L4')
    const tampered = { ...cert2, caveats: { ...cert2.caveats, budget: 9999 } }
    expect(effectiveCeiling({ chain: [WARRANT, cert0, cert1, tampered] })).toMatchObject({ ok: false, code: DELEGATION_DENY.TAMPERED })
  })
})

describe('validateCaveats — structural gate', () => {
  it('accepts well-formed caveats and rejects wrong types', () => {
    expect(validateCaveats({ tools: ['x'], budget: 1, max_depth: 2 }).ok).toBe(true)
    expect(validateCaveats({ budget: 'lots' } as never).ok).toBe(false)
    expect(validateCaveats({ max_depth: -1 }).ok).toBe(false)
    expect(validateCaveats({ tools: [1, 2] } as never).ok).toBe(false)
  })
})
