import { describe, it, expect } from 'vitest'
import { batchReceipts, verifyReceiptInBatch, buildMerkleTree, receiptLeaf, batchRoot, verifyInclusion } from './merkleBatch.mjs'
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

// SEC-1 fix — the CVE-2012-2459 shape: the old construction hashed a lone odd node with
// ITSELF, so a batch and the same batch with its last leaf duplicated shared one root.
// Mitigated twice: carry-up (odd node promoted unchanged — nothing is ever duplicated)
// and count binding (published root = sha256('merkle-root:v2:' + count + ':' + treeRoot)).
describe('Merkle root is a unique commitment to the leaf set (second-preimage resistance)', () => {
  const leaves = entries.map(receiptLeaf)

  it('duplicating the last leaf changes the RAW tree root (carry-up kills CVE-2012-2459)', () => {
    // odd count vs odd count + duplicated last — the exact ambiguity shape
    expect(buildMerkleTree(leaves.slice(0, 3)).root).not.toBe(
      buildMerkleTree([...leaves.slice(0, 3), leaves[2]]).root,
    )
    expect(buildMerkleTree(leaves).root).not.toBe(buildMerkleTree([...leaves, leaves[4]]).root)
  })

  it('duplicating the last entry changes the PUBLISHED batch root at every size', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const base = entries.slice(0, n)
      expect(batchReceipts(base).root).not.toBe(batchReceipts([...base, base[n - 1]]).root)
    }
  })

  it('the published root binds the leaf count: batchRoot(count, treeRoot)', () => {
    const batch = batchReceipts(entries)
    const treeRoot = buildMerkleTree(leaves).root
    expect(batch.root).toBe(batchRoot(entries.length, treeRoot))
    expect(batch.root).not.toBe(treeRoot) // the bare tree root is never the signed commitment
  })

  it('lying about the count inside a proof breaks verification', () => {
    const batch = batchReceipts(entries)
    const lied = { ...batch.proofs[0], count: entries.length + 1 }
    expect(verifyReceiptInBatch(entries[0], lied, batch.root).ok).toBe(false)
  })

  it('verifyInclusion fails closed when the count is omitted', () => {
    const batch = batchReceipts(entries)
    const p = batch.proofs[2]
    expect(verifyInclusion(p.leaf, p.proof, batch.root, batch.count)).toBe(true)
    // @ts-expect-error — count is required; an unbound check must not pass
    expect(verifyInclusion(p.leaf, p.proof, batch.root)).toBe(false)
  })

  it('a proof from a carried-up (odd) leaf still verifies and is shorter, not self-hashed', () => {
    const batch = batchReceipts(entries) // 5 entries — erin (index 4) is carried up twice
    const erin = batch.proofs[4]
    expect(erin.proof.length).toBeLessThan(batch.proofs[0].proof.length)
    expect(erin.proof.every((step) => step.hash !== erin.leaf)).toBe(true) // no self-sibling
    expect(verifyReceiptInBatch(entries[4], erin, batch.root).ok).toBe(true)
  })
})
