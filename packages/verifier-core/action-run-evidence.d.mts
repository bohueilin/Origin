import type { ActionRunEvidence } from '@origin/evidence/action-run-evidence'
import type { Sigil } from './sigil.mjs'

export interface ActionRunEvidenceSignature {
  key_id: string
  key_epoch: number
  sigil: Sigil
}

export interface SignedActionRunEvidence extends ActionRunEvidence {
  signature: ActionRunEvidenceSignature
}

export interface ActionRunEvidenceVerification {
  ok: boolean
  failures: string[]
  dimensions: {
    structure: boolean
    semantics: boolean
    integrity: boolean
    statement_bound: boolean
    signature_valid: boolean
    issuer_trusted: boolean
    outcome_verified: boolean
    complete: boolean
    fresh: boolean
  }
}

export function signActionRunEvidence(
  evidence: ActionRunEvidence,
  keyPair: CryptoKeyPair,
  options: { keyId: string; keyEpoch: number; issuer?: string; signedAt?: string | null },
): Promise<SignedActionRunEvidence>
export function verifyActionRunEvidence(
  evidence: unknown,
  options?: { expectedThumbprint?: string; now?: string | number | Date },
): Promise<ActionRunEvidenceVerification>
export { actionRunEvidenceDigest } from '@origin/evidence/action-run-evidence'
