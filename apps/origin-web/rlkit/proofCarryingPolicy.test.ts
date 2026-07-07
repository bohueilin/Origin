import { describe, it, expect } from 'vitest'
import {
  createPolicy,
  amendPolicy,
  verifyPolicyChain,
  bindDecision,
  verifyDecisionUnderPolicy,
} from './proofCarryingPolicy.mjs'
import { generateSigningKey, signSigil, verifySigil } from './sigil.mjs'

function chainOfThree() {
  const v1 = createPolicy({ allow: ['calendar.read'] }, { author: 'alice', reason: 'initial scope' })
  const v2 = amendPolicy(v1, { allow: ['calendar.read', 'messages.draft'] }, { author: 'alice', reason: 'add drafting' })
  const v3 = amendPolicy(v2, { allow: ['calendar.read', 'messages.draft'], deny: ['payments.refund'] }, { author: 'bob', reason: 'explicitly deny refunds' })
  return [v1, v2, v3]
}

describe('Proof-carrying versioned policy — tamper-evident history', () => {
  it('a create→amend→amend chain verifies, and each amendment carries its proof', () => {
    const chain = chainOfThree()
    const v = verifyPolicyChain(chain)
    expect(v.ok).toBe(true)
    expect(chain[2].author).toBe('bob')
    expect(chain[2].reason).toMatch(/deny refunds/)
    expect(chain[1].parent_digest).toBe(chain[0].digest)
  })

  it('altering a rule in a past version breaks the chain (history cannot be rewritten silently)', () => {
    const chain = chainOfThree()
    chain[1] = { ...chain[1], rules: { allow: ['calendar.read', 'messages.draft', 'payments.refund'] } } // sneak in a capability
    const v = verifyPolicyChain(chain)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/digest does not recompute|broken parent/)
  })

  it('reordering or dropping a version breaks the parent links', () => {
    const chain = chainOfThree()
    expect(verifyPolicyChain([chain[0], chain[2]]).ok).toBe(false) // dropped v2
    expect(verifyPolicyChain([chain[1], chain[0], chain[2]]).ok).toBe(false) // reordered
  })
})

describe('Proof-carrying policy — decisions bound to the policy AT THE TIME', () => {
  it('a decision made under v2 verifies under v2, but NOT under an amended v3', () => {
    const [v1, v2, v3] = chainOfThree()
    void v1
    const bound = bindDecision(v2, { action: 'messages.draft', outcome: 'allow' })
    expect(verifyDecisionUnderPolicy(bound, v2).ok).toBe(true)
    // the policy was amended afterwards → judging the past decision against v3 is caught as drift
    const under3 = verifyDecisionUnderPolicy(bound, v3)
    expect(under3.ok).toBe(false)
    expect(under3.reason).toMatch(/changed after the decision/)
  })

  it('the in-force version can be signed with a Sigil and independently verified', async () => {
    const chain = chainOfThree()
    const head = chain[chain.length - 1]
    const key = await generateSigningKey()
    const sigil = await signSigil({ policy_digest: head.digest, version: head.version }, key, { kind: 'policy_version' })
    expect((await verifySigil(sigil)).ok).toBe(true)
    expect(sigil.payload.policy_digest).toBe(head.digest)
  })
})
