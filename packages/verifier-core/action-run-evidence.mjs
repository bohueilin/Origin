import {
  actionRunEvidenceDigest,
  buildActionRunEvidence,
  validateActionRunEvidence,
} from '@origin/evidence/action-run-evidence'
import { canonical } from '@origin/evidence/env-evidence'
import { signSigil, verifySigil } from './sigil.mjs'

const ARTIFACT_TYPE = 'origin.action-run-evidence'

function signingStatement(evidence, keyId, keyEpoch) {
  return {
    artifact_type: ARTIFACT_TYPE,
    schema_version: evidence.schema_version,
    evidence_digest: evidence.evidence_digest,
    key_id: keyId,
    key_epoch: keyEpoch,
  }
}

function validKeyMetadata(keyId, keyEpoch) {
  return typeof keyId === 'string' && keyId.trim().length > 0 && Number.isSafeInteger(keyEpoch) && keyEpoch > 0
}

export async function signActionRunEvidence(evidence, keyPair, options = {}) {
  if (!validKeyMetadata(options.keyId, options.keyEpoch)) throw new TypeError('keyId and positive integer keyEpoch are required')
  const unsigned = buildActionRunEvidence(evidence)
  const statement = signingStatement(unsigned, options.keyId, options.keyEpoch)
  const sigil = await signSigil(statement, keyPair, {
    issuer: options.issuer ?? 'origin',
    kind: ARTIFACT_TYPE,
    signed_at: options.signedAt ?? null,
  })
  return {
    ...unsigned,
    signature: {
      key_id: options.keyId,
      key_epoch: options.keyEpoch,
      sigil,
    },
  }
}

function typedVerdict() {
  return {
    ok: false,
    failures: [],
    dimensions: {
      structure: false,
      semantics: false,
      integrity: false,
      statement_bound: false,
      signature_valid: false,
      issuer_trusted: false,
      outcome_verified: false,
      complete: false,
      fresh: false,
    },
  }
}

function outcomeIsVerified(evidence) {
  const status = evidence.outcome_attestation?.status
  return status === 'simulated' || status === 'not_attempted' || status === 'provider_confirmed' || status === 'independently_verified'
}

export async function verifyActionRunEvidence(evidence, options = {}) {
  const verdict = typedVerdict()
  try {
    const pure = validateActionRunEvidence(evidence, { now: options.now })
    verdict.failures.push(...pure.failures)
    verdict.dimensions.structure = pure.dimensions.structure
    verdict.dimensions.semantics = pure.dimensions.semantics
    verdict.dimensions.integrity = pure.dimensions.integrity
    verdict.dimensions.complete = evidence?.completeness?.coverage === 'complete' && pure.dimensions.completeness
    verdict.dimensions.fresh = evidence?.completeness?.freshness?.status === 'fresh' && pure.dimensions.freshness
    if (!pure.ok) return verdict

    const signature = evidence.signature
    if (!signature || typeof signature !== 'object' || !validKeyMetadata(signature.key_id, signature.key_epoch) || !signature.sigil) {
      verdict.failures.push('signature: key_id, key_epoch, and sigil are required')
      return verdict
    }
    const expectedStatement = signingStatement(evidence, signature.key_id, signature.key_epoch)
    if (canonical(signature.sigil.payload) !== canonical(expectedStatement)) {
      verdict.failures.push('signature: signed payload is not the exact Action/Run Evidence statement')
      return verdict
    }
    verdict.dimensions.statement_bound = true

    let sigilVerdict
    try {
      sigilVerdict = await verifySigil(signature.sigil, options.expectedThumbprint ? { expectedThumbprint: options.expectedThumbprint } : {})
    } catch {
      verdict.failures.push('signature: malformed Sigil')
      return verdict
    }
    if (!sigilVerdict.ok) {
      verdict.failures.push(`signature: ${sigilVerdict.reason}`)
      return verdict
    }
    verdict.dimensions.signature_valid = true
    verdict.dimensions.issuer_trusted = typeof options.expectedThumbprint === 'string' && options.expectedThumbprint.length > 0
    if (!verdict.dimensions.issuer_trusted) verdict.failures.push('issuer: embedded key is untrusted without an expected pinned thumbprint')

    verdict.dimensions.outcome_verified = outcomeIsVerified(evidence)
    if (!verdict.dimensions.outcome_verified) verdict.failures.push('outcome: claimed evidence is not verified execution evidence')
    verdict.ok = verdict.failures.length === 0 && verdict.dimensions.complete && verdict.dimensions.fresh
    if (!verdict.dimensions.complete) verdict.failures.push('completeness: evidence is not complete')
    if (!verdict.dimensions.fresh) verdict.failures.push('freshness: evidence is not fresh')
    return verdict
  } catch {
    verdict.failures.push('evidence: malformed attacker-controlled verification input')
    return verdict
  }
}

export { actionRunEvidenceDigest }
