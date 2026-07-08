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
//
// Second-preimage / duplicate-last-leaf hardening (SEC-1 fix, CVE-2012-2459 shape):
// the original construction promoted an odd node by hashing it WITH ITSELF, so
// root([A,B,C]) === root([A,B,C,C]) — two different leaf sets, one signed root. Bitcoin
// shipped this exact bug (CVE-2012-2459). Two independent mitigations, both applied:
//   1. CARRY-UP: a lone (odd) node is promoted UNCHANGED to the next level — nothing is
//      ever duplicated, so the duplicated-leaf ambiguity cannot arise structurally.
//      (Same odd-node discipline as RFC 6962 / Certificate Transparency trees.)
//   2. COUNT BINDING: the published/signed root is not the bare tree root but
//      sha256('merkle-root:v2:' + leafCount + ':' + treeRoot), so trees over different
//      leaf counts can never share a published root even if a future construction bug
//      re-introduced a tree-level collision. The count travels inside every proof.
// =============================================================================

import { canonical, sha256 } from './env-evidence.mjs'

const leafHash = (payload) => sha256('leaf:' + canonical(payload))
const nodeHash = (l, r) => sha256('node:' + l + '|' + r)

/** A receipt leaf binds the receipt content to a beneficiary. */
export function receiptLeaf({ beneficiary, receipt }) {
  return leafHash({ beneficiary, receipt })
}

/**
 * The published (signed) batch root, v2: binds the LEAF COUNT into the commitment so a
 * root is unique to its leaf set — root([A,B,C]) can never equal root([A,B,C,C]).
 */
export function batchRoot(count, treeRoot) {
  return sha256('merkle-root:v2:' + count + ':' + treeRoot)
}

/**
 * Build a Merkle tree over ordered leaf hashes. A lone odd node is CARRIED UP unchanged
 * (never hashed with itself — see the CVE-2012-2459 note above) so the shape is
 * deterministic and duplication-free. Returns { root, layers } where layers[0] === the
 * leaves and `root` is the RAW tree root (inclusion proofs fold to this; the published,
 * signable commitment is batchRoot(count, root)).
 */
export function buildMerkleTree(leafHashes) {
  if (leafHashes.length === 0) return { root: sha256('leaf:empty'), layers: [[]] }
  const layers = [leafHashes.slice()]
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1]
    const next = []
    for (let i = 0; i < prev.length; i += 2) {
      if (i + 1 < prev.length) next.push(nodeHash(prev[i], prev[i + 1]))
      else next.push(prev[i]) // carry the lone node up UNCHANGED (no self-hash)
    }
    layers.push(next)
  }
  return { root: layers[layers.length - 1][0], layers }
}

/**
 * An inclusion (audit) proof for leaf `index`: the sibling at each level + its side.
 * At a level where the node is carried up (no sibling), the proof has NO step — the
 * verifier's fold simply skips that level, mirroring the carry-up construction.
 */
export function inclusionProof(tree, index) {
  const proof = []
  let idx = index
  for (let level = 0; level < tree.layers.length - 1; level++) {
    const layer = tree.layers[level]
    const isRight = idx % 2 === 1
    const siblingIdx = isRight ? idx - 1 : idx + 1
    if (siblingIdx < layer.length) {
      proof.push({ hash: layer[siblingIdx], side: isRight ? 'left' : 'right' })
    } // else: carried up unchanged — no hashing happened at this level, no step
    idx = Math.floor(idx / 2)
  }
  return proof
}

/**
 * Recompute the published root from a leaf hash + its proof + the batch leaf count;
 * true iff it matches the signed root. `count` is REQUIRED: the signed root is the
 * count-bound batchRoot(count, treeRoot), so verification without the count fails
 * closed rather than accepting an unbound commitment.
 */
export function verifyInclusion(leafHashValue, proof, root, count) {
  let acc = leafHashValue
  for (const step of proof) {
    acc = step.side === 'left' ? nodeHash(step.hash, acc) : nodeHash(acc, step.hash)
  }
  return batchRoot(count, acc) === root
}

/**
 * Batch receipts → one root + a per-receipt inclusion proof. `entries` is a list of
 * { beneficiary, receipt }. Sign `root` once with a Sigil (signSigil) to seal the whole
 * batch. `root` is the count-bound v2 commitment; each proof carries `count` so a single
 * receipt holder can verify against the signed root with no other context. Lying about
 * `count` moves the recomputed root, so it is tamper-evident like every other field.
 */
export function batchReceipts(entries) {
  const leaves = entries.map(receiptLeaf)
  const tree = buildMerkleTree(leaves)
  const proofs = entries.map((entry, i) => ({
    beneficiary: entry.beneficiary,
    leaf: leaves[i],
    index: i,
    count: entries.length,
    proof: inclusionProof(tree, i),
  }))
  return { root: batchRoot(entries.length, tree.root), count: entries.length, proofs }
}

/** Verify a single beneficiary's receipt against the (signed) batch root — no other receipt needed. */
export function verifyReceiptInBatch({ beneficiary, receipt }, proof, root) {
  const leaf = receiptLeaf({ beneficiary, receipt })
  if (leaf !== proof.leaf) return { ok: false, reason: 'leaf does not match the receipt+beneficiary (content or beneficiary altered)' }
  if (!verifyInclusion(leaf, proof.proof, root, proof.count)) return { ok: false, reason: 'inclusion proof does not reconstruct the batch root' }
  return { ok: true, reason: 'receipt is provably included in the signed batch' }
}
