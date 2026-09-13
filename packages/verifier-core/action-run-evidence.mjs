import { actionRunEvidenceDigest, validateActionRunEvidence } from '@origin/evidence/action-run-evidence'
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

function expectedThumbprint(registry, keyId, keyEpoch) {
  const candidate = registry?.[keyId]?.[keyEpoch]
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
}

export async function signActionRunEvidence(evidence, keyPair, options = {}) {
  if (!validKeyMetadata(options.keyId, options.keyEpoch)) throw new TypeError('keyId and positive integer keyEpoch are required')
  if (!evidence || typeof evidence !== 'object' || evidence.signature !== null) throw new TypeError('only unsigned evidence with signature: null may be signed')
  const verdict = validateActionRunEvidence(evidence)
  if (!verdict.ok) throw new TypeError(`invalid Action/Run Evidence: ${verdict.failures.join('; ')}`)
  if (actionRunEvidenceDigest(evidence) !== evidence.evidence_digest) throw new TypeError('evidence_digest: supplied unsigned evidence does not match its digest')
  const statement = signingStatement(evidence, options.keyId, options.keyEpoch)
  const sigil = await signSigil(statement, keyPair, {
    issuer: options.issuer ?? 'origin', kind: ARTIFACT_TYPE, signed_at: options.signedAt ?? null,
  })
  return {
    ...evidence,
    signature: { key_id: options.keyId, key_epoch: options.keyEpoch, sigil },
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
      authorization_valid: false,
      statement_bound: false,
      signature_valid: false,
      issuer_trusted: false,
      outcome_consistent: false,
      execution_verified: false,
      provider_bound: false,
      complete: false,
      fresh: false,
    },
  }
}

function outcomeConsistent(evidence) {
  return ['simulated', 'not_attempted', 'provider_confirmed', 'independently_verified', 'failed', 'unknown'].includes(evidence.outcome_attestation?.status)
}

function executionVerified(evidence) {
  return ['provider_confirmed', 'independently_verified'].includes(evidence.outcome_attestation?.status)
}

export async function verifyActionRunEvidence(evidence, options = {}) {
  const verdict = typedVerdict()
  try {
    const pure = validateActionRunEvidence(evidence, { now: options.now })
    verdict.failures.push(...pure.failures)
    verdict.dimensions.structure = pure.dimensions.structure
    verdict.dimensions.semantics = pure.dimensions.semantics
    verdict.dimensions.integrity = pure.dimensions.integrity
    verdict.dimensions.authorization_valid = pure.dimensions.authorization_valid
    verdict.dimensions.provider_bound = pure.dimensions.provider_bound
    verdict.dimensions.complete = pure.dimensions.completeness
    verdict.dimensions.fresh = pure.dimensions.freshness
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

    const pin = expectedThumbprint(options.expectedThumbprints, signature.key_id, signature.key_epoch)
    let sigilVerdict
    try {
      sigilVerdict = await verifySigil(signature.sigil, pin ? { expectedThumbprint: pin } : {})
    } catch {
      verdict.failures.push('signature: malformed Sigil')
      return verdict
    }
    if (!sigilVerdict.ok) {
      verdict.failures.push(`signature: ${sigilVerdict.reason}`)
      return verdict
    }
    verdict.dimensions.signature_valid = true
    verdict.dimensions.issuer_trusted = pin !== null
    if (!verdict.dimensions.issuer_trusted) verdict.failures.push('issuer: no trusted thumbprint is registered for declared key_id/key_epoch')

    verdict.dimensions.outcome_consistent = outcomeConsistent(evidence)
    verdict.dimensions.execution_verified = executionVerified(evidence)
    if (!verdict.dimensions.outcome_consistent) verdict.failures.push('outcome: claimed evidence is not verified outcome evidence')
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
