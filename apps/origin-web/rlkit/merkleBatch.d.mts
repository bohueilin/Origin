// Type surface for rlkit/merkleBatch.mjs — Merkle-batched receipts, beneficiary-bound.

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
  proof: MerkleProofStep[]
}
export interface ReceiptBatch {
  root: string
  count: number
  proofs: BatchProof[]
}

export function receiptLeaf(entry: BatchEntry): string
export function buildMerkleTree(leafHashes: string[]): { root: string; layers: string[][] }
export function inclusionProof(tree: { layers: string[][] }, index: number): MerkleProofStep[]
export function verifyInclusion(leafHashValue: string, proof: MerkleProofStep[], root: string): boolean
export function batchReceipts(entries: BatchEntry[]): ReceiptBatch
export function verifyReceiptInBatch(
  entry: BatchEntry,
  proof: BatchProof,
  root: string,
): { ok: boolean; reason: string }
