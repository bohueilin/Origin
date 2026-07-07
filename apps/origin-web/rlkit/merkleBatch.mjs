// Merkle-batched receipts + beneficiary-by-signature.
// =============================================================================
// Clean-room. Inspired by the APS × 1Password "beneficiary-by-signature + Merkle batch" audit
// pattern (no code copied — see docs/PRIOR_ART.md).
//
// At scale you don't want to sign every receipt individually. Instead: Merkle-tree N receipts
// into ONE root, sign the root once (via a Sigil), and hand each receipt holder a compact
// inclusion proof. Anyone can verify "receipt R is in the signed batch" against the root WITHOUT
// seeing the other receipts — O(log N) proof, one signature amortized over the whole batch.
//
// Each leaf binds a BENEFICIARY (who the receipt is for) into the hash, so a receipt can't be
// re-pointed to a different beneficiary without breaking its inclusion proof.
//
// Domain separation: leaves and internal nodes are hashed with distinct prefixes, closing the
// classic Merkle second-preimage hole (a proof can't be reinterpreted at the wrong tree level).
// =============================================================================

import { canonical, sha256 } from './env-evidence.mjs'

const leafHash = (payload) => sha256('leaf:' + canonical(payload))
const nodeHash = (l, r) => sha256('node:' + l + '|' + r)

/** A receipt leaf binds the receipt content to a beneficiary. */
export function receiptLeaf({ beneficiary, receipt }) {
  return leafHash({ beneficiary, receipt })
}

/**
 * Build a Merkle tree over ordered leaf hashes. Odd nodes are promoted (hashed with themselves)
 * so the shape is deterministic. Returns { root, layers } where layers[0] === the leaves.
 */
export function buildMerkleTree(leafHashes) {
  if (leafHashes.length === 0) return { root: sha256('leaf:empty'), layers: [[]] }
  const layers = [leafHashes.slice()]
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1]
    const next = []
    for (let i = 0; i < prev.length; i += 2) {
      const l = prev[i]
      const r = i + 1 < prev.length ? prev[i + 1] : prev[i] // promote the odd one
      next.push(nodeHash(l, r))
    }
    layers.push(next)
  }
  return { root: layers[layers.length - 1][0], layers }
}

/** An inclusion (audit) proof for leaf `index`: the sibling at each level + its side. */
export function inclusionProof(tree, index) {
  const proof = []
  let idx = index
  for (let level = 0; level < tree.layers.length - 1; level++) {
    const layer = tree.layers[level]
    const isRight = idx % 2 === 1
    const siblingIdx = isRight ? idx - 1 : idx + 1
    const sibling = siblingIdx < layer.length ? layer[siblingIdx] : layer[idx] // promoted odd → self
    proof.push({ hash: sibling, side: isRight ? 'left' : 'right' })
    idx = Math.floor(idx / 2)
  }
  return proof
}

/** Recompute the root from a leaf hash + its proof; true iff it matches the signed root. */
export function verifyInclusion(leafHashValue, proof, root) {
  let acc = leafHashValue
  for (const step of proof) {
    acc = step.side === 'left' ? nodeHash(step.hash, acc) : nodeHash(acc, step.hash)
  }
  return acc === root
}

/**
 * Batch receipts → one root + a per-receipt inclusion proof. `entries` is a list of
 * { beneficiary, receipt }. Sign `root` once with a Sigil (signSigil) to seal the whole batch.
 */
export function batchReceipts(entries) {
  const leaves = entries.map(receiptLeaf)
  const tree = buildMerkleTree(leaves)
  const proofs = entries.map((entry, i) => ({
    beneficiary: entry.beneficiary,
    leaf: leaves[i],
    index: i,
    proof: inclusionProof(tree, i),
  }))
  return { root: tree.root, count: entries.length, proofs }
}

/** Verify a single beneficiary's receipt against the (signed) batch root — no other receipt needed. */
export function verifyReceiptInBatch({ beneficiary, receipt }, proof, root) {
  const leaf = receiptLeaf({ beneficiary, receipt })
  if (leaf !== proof.leaf) return { ok: false, reason: 'leaf does not match the receipt+beneficiary (content or beneficiary altered)' }
  if (!verifyInclusion(leaf, proof.proof, root)) return { ok: false, reason: 'inclusion proof does not reconstruct the batch root' }
  return { ok: true, reason: 'receipt is provably included in the signed batch' }
}
