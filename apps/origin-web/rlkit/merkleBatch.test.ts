import { describe, it, expect } from 'vitest'
import { batchReceipts, verifyReceiptInBatch, buildMerkleTree, receiptLeaf } from './merkleBatch.mjs'
import { generateSigningKey, signSigil, verifySigil } from './sigil.mjs'

const entries = [
  { beneficiary: 'alice', receipt: { task: 'wh-01', reward: 1 } },
  { beneficiary: 'bob', receipt: { task: 'wh-02', reward: 0 } },
  { beneficiary: 'carol', receipt: { task: 'wh-03', reward: 1 } },
  { beneficiary: 'dave', receipt: { task: 'wh-04', reward: 1 } },
  { beneficiary: 'erin', receipt: { task: 'wh-05', reward: 0 } }, // odd count → exercises promotion
]

describe('Merkle-batched receipts — one root, O(log N) inclusion proofs', () => {
  it('every receipt verifies against the single batch root', () => {
    const batch = batchReceipts(entries)
    expect(batch.count).toBe(5)
    entries.forEach((entry, i) => {
      const v = verifyReceiptInBatch(entry, batch.proofs[i], batch.root)
      expect(v.ok).toBe(true)
    })
  })

  it('tampering a receipt breaks its inclusion proof', () => {
    const batch = batchReceipts(entries)
    const forged = { beneficiary: 'alice', receipt: { task: 'wh-01', reward: 999 } }
    const v = verifyReceiptInBatch(forged, batch.proofs[0], batch.root)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/altered|match/)
  })

  it('re-pointing a receipt to a different beneficiary breaks the proof', () => {
    const batch = batchReceipts(entries)
    const stolen = { beneficiary: 'mallory', receipt: entries[0].receipt }
    expect(verifyReceiptInBatch(stolen, batch.proofs[0], batch.root).ok).toBe(false)
  })

  it("a valid proof for the wrong root fails (can't graft onto another batch)", () => {
    const batch = batchReceipts(entries)
    const other = batchReceipts([{ beneficiary: 'zoe', receipt: { task: 'x', reward: 1 } }])
    expect(verifyReceiptInBatch(entries[2], batch.proofs[2], other.root).ok).toBe(false)
  })

  it('the tree is deterministic', () => {
    const a = buildMerkleTree(entries.map(receiptLeaf))
    const b = buildMerkleTree(entries.map(receiptLeaf))
    expect(a.root).toBe(b.root)
  })

  it('sign the batch root ONCE with a Sigil → the whole batch is sealed + shareable', async () => {
    const batch = batchReceipts(entries)
    const key = await generateSigningKey()
    const sigil = await signSigil({ merkle_root: batch.root, count: batch.count }, key, { kind: 'receipt_batch' })
    // one signature covers all N receipts; anyone verifies the root, then any receipt's inclusion.
    expect((await verifySigil(sigil)).ok).toBe(true)
    expect(verifyReceiptInBatch(entries[3], batch.proofs[3], sigil.payload.merkle_root).ok).toBe(true)
  })
})
