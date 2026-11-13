import type { ActionRunClock, ActionRunEvidence } from '@origin/evidence/action-run-evidence'
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
    authorization_valid: boolean
    statement_bound: boolean
    signature_valid: boolean
    issuer_trusted: boolean
    outcome_consistent: boolean
    execution_verified: boolean
    provider_bound: boolean
    complete: boolean
    fresh: boolean
  }
  /** The clock check that failed, if any. A record whose only failure is the clock still has its signature checked. */
  clock: ActionRunClock
}

export function signActionRunEvidence(
  evidence: ActionRunEvidence,
  keyPair: CryptoKeyPair,
  options: { keyId: string; keyEpoch: number; issuer?: string; signedAt?: string | null },
): Promise<SignedActionRunEvidence>
/**
 * `ok` and `failures` cover structure, integrity, the signature, the issuer pin, the outcome status,
 * completeness and freshness. They do not cover the stated result: a 1.1.0 record's `evaluation` block is not
 * replayed here, so a record whose stated decisions do not reproduce can still be `ok`. Callers
 * that rely on the stated result must also run `replayPolicyEvaluation` from
 * `@origin/verifier-core/policyEvaluation`, as /verify does (`apps/origin-web/src/verify/detect.mjs`).
 */
export function verifyActionRunEvidence(
  evidence: unknown,
  options?: {
    expectedThumbprints?: Record<string, Record<number, string>>
    now?: string | number | Date
    /** Caps the window a simulated record may declare (for example 30 days); omitted, no cap applies. */
    simulatedMaxAgeCapMs?: number
  },
): Promise<ActionRunEvidenceVerification>
export { actionRunEvidenceDigest } from '@origin/evidence/action-run-evidence'
