import { describe, it, expect } from 'vitest'
import {
  generateAgentKey,
  agentThumbprint,
  signPayload,
  verifyPayload,
  buildPopChallenge,
  verifyPop,
} from './countersign-identity.mjs'

describe('countersign-identity — Ed25519 agent identity', () => {
  it('derives a stable thumbprint from the public key (same key → same id)', () => {
    const k = generateAgentKey()
    expect(k.thumbprint).toBe(agentThumbprint(k.publicJwk))
    expect(k.thumbprint).toHaveLength(64) // sha256 hex
    // re-derivation is machine-independent and deterministic
    expect(agentThumbprint(k.publicJwk)).toBe(k.thumbprint)
  })

  it('two different keys → two different thumbprints', () => {
    const a = generateAgentKey()
    const b = generateAgentKey()
    expect(a.thumbprint).not.toBe(b.thumbprint)
  })

  it('signs and verifies a payload bound to exact content', () => {
    const k = generateAgentKey()
    const payload = { hello: 'world', n: 42 }
    const sig = signPayload(payload, k.privateJwk)
    expect(verifyPayload(payload, sig, k.publicJwk)).toBe(true)
    // flip a byte in the payload → verification fails (content-address binding)
    expect(verifyPayload({ hello: 'world', n: 43 }, sig, k.publicJwk)).toBe(false)
  })

  it("a different key's signature does not verify", () => {
    const k = generateAgentKey()
    const attacker = generateAgentKey()
    const payload = { transfer: 100 }
    const sig = signPayload(payload, attacker.privateJwk)
    expect(verifyPayload(payload, sig, k.publicJwk)).toBe(false)
  })

  it('canonicalization means key order does not affect the signature', () => {
    const k = generateAgentKey()
    const sig = signPayload({ a: 1, b: 2 }, k.privateJwk)
    expect(verifyPayload({ b: 2, a: 1 }, sig, k.publicJwk)).toBe(true)
  })

  describe('proof-of-possession', () => {
    const route = '/api/janus/countersign/act'
    const body = { item_ref: 'op://vault/item/field', capability: 'credential.scoped_request' }

    it('valid PoP: the key that owns the id proves possession', () => {
      const k = generateAgentKey()
      const challenge = buildPopChallenge({ agentThumbprint: k.thumbprint, route, body, nonce: 'n1', iat: 1000 })
      const sig = signPayload(challenge, k.privateJwk)
      const r = verifyPop({ challenge, signatureB64Url: sig, publicJwk: k.publicJwk, expectRoute: route, body })
      expect(r.ok).toBe(true)
      expect(r.code).toBe(0)
    })

    it('code 1: a key that does NOT own the claimed id is rejected (name-squatting)', () => {
      const victim = generateAgentKey()
      const attacker = generateAgentKey()
      // attacker claims the victim's id but signs with its own key
      const challenge = buildPopChallenge({ agentThumbprint: victim.thumbprint, route, body, nonce: 'n2', iat: 1000 })
      const sig = signPayload(challenge, attacker.privateJwk)
      const r = verifyPop({ challenge, signatureB64Url: sig, publicJwk: attacker.publicJwk, expectRoute: route, body })
      expect(r.ok).toBe(false)
      expect(r.code).toBe(1)
    })

    it('code 3: route mismatch is rejected', () => {
      const k = generateAgentKey()
      const challenge = buildPopChallenge({ agentThumbprint: k.thumbprint, route, body, nonce: 'n3', iat: 1000 })
      const sig = signPayload(challenge, k.privateJwk)
      const r = verifyPop({ challenge, signatureB64Url: sig, publicJwk: k.publicJwk, expectRoute: '/api/other', body })
      expect(r.ok).toBe(false)
      expect(r.code).toBe(3)
    })

    it('code 3: body mismatch is rejected (signature is bound to the request body)', () => {
      const k = generateAgentKey()
      const challenge = buildPopChallenge({ agentThumbprint: k.thumbprint, route, body, nonce: 'n4', iat: 1000 })
      const sig = signPayload(challenge, k.privateJwk)
      const r = verifyPop({ challenge, signatureB64Url: sig, publicJwk: k.publicJwk, expectRoute: route, body: { item_ref: 'op://vault/OTHER/field' } })
      expect(r.ok).toBe(false)
      expect(r.code).toBe(3)
    })

    it('code 2: a tampered challenge (right owner, forged signature) is rejected', () => {
      const k = generateAgentKey()
      const challenge = buildPopChallenge({ agentThumbprint: k.thumbprint, route, body, nonce: 'n5', iat: 1000 })
      const sig = signPayload({ ...challenge, nonce: 'n5-forged' }, k.privateJwk)
      const r = verifyPop({ challenge, signatureB64Url: sig, publicJwk: k.publicJwk, expectRoute: route, body })
      expect(r.ok).toBe(false)
      expect(r.code).toBe(2)
    })

    it('code 4: malformed input is rejected', () => {
      const k = generateAgentKey()
      // @ts-expect-error intentional malformed
      const r = verifyPop({ challenge: null, signatureB64Url: 'x', publicJwk: k.publicJwk })
      expect(r.ok).toBe(false)
      expect(r.code).toBe(4)
    })
  })
})
