// Type surface for merkleBatch.mjs — Merkle-batched receipts, beneficiary-bound.

export interface MerkleProofStep {
  hash: string
  side: 'left' | 'right'
}
export interface BatchEntry {
  beneficiary: string
  receipt: unknown
}
export interface BatchProof {
  beneficiary: string
  leaf: string
  index: number
  /** Leaf count of the batch — bound into the published root (second-preimage fix). */
  count: number
  proof: MerkleProofStep[]
}
export interface ReceiptBatch {
  /** Count-bound v2 root: sha256('merkle-root:v2:' + count + ':' + treeRoot). */
  root: string
  count: number
  proofs: BatchProof[]
}

export function receiptLeaf(entry: BatchEntry): string
/** Published (signed) batch root — binds the leaf count into the commitment. */
export function batchRoot(count: number, treeRoot: string): string
export function buildMerkleTree(leafHashes: string[]): { root: string; layers: string[][] }
export function inclusionProof(tree: { layers: string[][] }, index: number): MerkleProofStep[]
export function verifyInclusion(leafHashValue: string, proof: MerkleProofStep[], root: string, count: number): boolean
export function batchReceipts(entries: BatchEntry[]): ReceiptBatch
export function verifyReceiptInBatch(
  entry: BatchEntry,
  proof: BatchProof,
  root: string,
): { ok: boolean; reason: string }
