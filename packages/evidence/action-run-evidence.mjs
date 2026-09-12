import { canonical, sha256 } from './env-evidence.mjs'

export const ACTION_RUN_SCHEMA_VERSION = '1.0.0'
export const EXECUTION_MODES = Object.freeze(['simulated', 'authorized_fixture', 'sandbox', 'customer_replay', 'shadow', 'live'])
export const OUTCOME_STATUSES = Object.freeze(['not_attempted', 'simulated', 'claimed', 'provider_confirmed', 'independently_verified', 'failed', 'unknown'])

const HEX_64 = /^[0-9a-f]{64}$/
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
const SECRET_LIKE_KEY = /(?:secret|password|private[_-]?key|raw[_-]?nonce|authorization[_-]?token|approval[_-]?token|bearer|access[_-]?token|refresh[_-]?token)/i
const APPROVAL_STATUSES = new Set(['not_required', 'approved', 'denied', 'expired', 'missing'])
const AUTHORIZATIONS = new Set(['allow', 'deny'])
const COVERAGE = new Set(['complete', 'partial', 'unknown'])
const FRESHNESS = new Set(['fresh', 'stale', 'unknown'])

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isPlainRecord = (value) => {
  if (!isRecord(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
const isNullableString = (value) => value === null || typeof value === 'string'
const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0
const isDigest = (value) => typeof value === 'string' && HEX_64.test(value)
const isCount = (value) => Number.isSafeInteger(value) && value >= 0

function isIsoTimestamp(value) {
  return typeof value === 'string' && ISO_UTC.test(value) && !Number.isNaN(Date.parse(value))
}

function scanJson(value, path, failures) {
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) {
    if (typeof value === 'number' && !Number.isFinite(value)) failures.push(`${path}: non-finite number`)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanJson(item, `${path}[${index}]`, failures))
    return
  }
  if (!isPlainRecord(value)) {
    failures.push(`${path}: evidence must contain plain JSON only`)
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_LIKE_KEY.test(key)) failures.push(`${path}.${key}: secret-like fields are forbidden`)
    scanJson(child, `${path}.${key}`, failures)
  }
}

function requireRecord(value, name, failures) {
  if (!isPlainRecord(value)) {
    failures.push(`${name}: required object missing or malformed`)
    return null
  }
  return value
}

function validateApproval(approval, failures) {
  if (!AUTHORIZATIONS.has(approval.authorization)) failures.push('approval.authorization: must be allow or deny')
  if (typeof approval.required !== 'boolean') failures.push('approval.required: must be boolean')
  if (!APPROVAL_STATUSES.has(approval.status)) failures.push('approval.status: unsupported status')
  if (!isNullableString(approval.nonce_digest) || (approval.nonce_digest !== null && !isDigest(approval.nonce_digest)))
    failures.push('approval.nonce_digest: must be null or a SHA-256 digest')
  if (approval.expires_at !== null && !isIsoTimestamp(approval.expires_at)) failures.push('approval.expires_at: must be null or an ISO UTC timestamp')

  if (approval.status === 'not_required') {
    if (approval.required || approval.nonce_digest !== null || approval.expires_at !== null)
      failures.push('approval: not_required must not carry approval authority')
  }
  if (approval.status === 'approved') {
    if (!approval.required || !isDigest(approval.nonce_digest) || !isIsoTimestamp(approval.expires_at))
      failures.push('approval: approved requires a nonce digest and expiry')
  }
  if (approval.authorization === 'allow' && approval.status === 'denied') failures.push('approval: allow cannot have denied status')
  if (approval.authorization === 'deny' && approval.status === 'approved') failures.push('approval: deny cannot have approved status')
}

function validateOutcome(evidence, failures) {
  const outcome = evidence.outcome_attestation
  const provider = evidence.provider_evidence
  if (!OUTCOME_STATUSES.includes(outcome.status)) failures.push('outcome_attestation.status: unsupported status')
  if (!['none', 'origin', 'provider', 'independent_verifier'].includes(outcome.attester))
    failures.push('outcome_attestation.attester: unsupported attester')
  if (outcome.attested_at !== null && !isIsoTimestamp(outcome.attested_at)) failures.push('outcome_attestation.attested_at: invalid timestamp')
  if (outcome.statement_digest !== null && !isDigest(outcome.statement_digest)) failures.push('outcome_attestation.statement_digest: must be null or a digest')

  if (!isNullableString(provider.provider)) failures.push('provider_evidence.provider: must be null or string')
  for (const key of ['receipt_digest', 'readback_digest']) {
    if (provider[key] !== null && !isDigest(provider[key])) failures.push(`provider_evidence.${key}: must be null or a digest`)
  }
  if (provider.readback_at !== null && !isIsoTimestamp(provider.readback_at)) failures.push('provider_evidence.readback_at: invalid timestamp')

  const hasProviderEvidence = provider.provider !== null || provider.receipt_digest !== null || provider.readback_digest !== null || provider.readback_at !== null
  if (evidence.execution_mode === 'simulated') {
    if (!['simulated', 'not_attempted'].includes(outcome.status)) failures.push('simulated evidence cannot claim a provider outcome')
    if (outcome.status === 'not_attempted' && evidence.proposal.policy_only !== true)
      failures.push('simulated not_attempted outcome is reserved for policy-only evaluation')
    if (hasProviderEvidence) failures.push('simulated evidence cannot carry provider evidence')
  }
  if (outcome.status === 'simulated' && evidence.execution_mode !== 'simulated') failures.push('simulated outcome requires simulated execution mode')
  if (['provider_confirmed', 'independently_verified'].includes(outcome.status)) {
    if (!['customer_replay', 'live'].includes(evidence.execution_mode)) failures.push('confirmed provider outcome requires customer_replay or live execution mode')
    if (!nonEmptyString(provider.provider) || !isDigest(provider.receipt_digest) || !isDigest(provider.readback_digest) || !isIsoTimestamp(provider.readback_at))
      failures.push('confirmed provider outcome requires provider receipt and readback evidence')
  }
  if (outcome.status === 'claimed' && (!nonEmptyString(provider.provider) || !isDigest(provider.receipt_digest)))
    failures.push('claimed provider outcome requires a provider receipt digest')
}

function validateCompleteness(completeness, now, failures) {
  if (!COVERAGE.has(completeness.coverage)) failures.push('completeness.coverage: unsupported status')
  if (completeness.expected_count !== null && !isCount(completeness.expected_count)) failures.push('completeness.expected_count: must be null or a non-negative integer')
  if (!isCount(completeness.observed_count)) failures.push('completeness.observed_count: must be a non-negative integer')
  if (completeness.covered_ids_digest !== null && !isDigest(completeness.covered_ids_digest)) failures.push('completeness.covered_ids_digest: must be null or a digest')
  if (!Array.isArray(completeness.omissions) || !Array.isArray(completeness.duplicates)) failures.push('completeness omissions and duplicates must be arrays')
  for (const omission of completeness.omissions || []) {
    if (!isPlainRecord(omission) || !isDigest(omission.id_digest) || !nonEmptyString(omission.reason)) failures.push('completeness.omissions: invalid omission entry')
  }
  for (const duplicate of completeness.duplicates || []) {
    if (!isPlainRecord(duplicate) || !isDigest(duplicate.id_digest) || !Number.isSafeInteger(duplicate.count) || duplicate.count < 2)
      failures.push('completeness.duplicates: invalid duplicate entry')
  }
  if (completeness.coverage === 'complete' && (
    completeness.expected_count === null ||
    completeness.expected_count !== completeness.observed_count ||
    completeness.omissions.length !== 0 ||
    completeness.duplicates.length !== 0
  )) failures.push('completeness: complete coverage requires exact counts with no omissions or duplicates')
  if (completeness.coverage === 'unknown' && completeness.expected_count !== null) failures.push('completeness: unknown coverage must not claim an expected count')

  const freshness = requireRecord(completeness.freshness, 'completeness.freshness', failures)
  if (!freshness) return
  if (!FRESHNESS.has(freshness.status)) failures.push('freshness.status: unsupported status')
  if (freshness.observed_at !== null && !isIsoTimestamp(freshness.observed_at)) failures.push('freshness.observed_at: invalid timestamp')
  if (freshness.max_age_ms !== null && (!Number.isSafeInteger(freshness.max_age_ms) || freshness.max_age_ms < 0)) failures.push('freshness.max_age_ms: must be null or a non-negative integer')
  if (freshness.status === 'unknown' && (freshness.observed_at !== null || freshness.max_age_ms !== null)) failures.push('freshness: unknown must not carry timing claims')
  if (freshness.status !== 'unknown' && (!isIsoTimestamp(freshness.observed_at) || freshness.max_age_ms === null)) failures.push('freshness: fresh/stale requires observed_at and max_age_ms')
  if (now !== undefined && freshness.status !== 'unknown' && isIsoTimestamp(freshness.observed_at) && Number.isSafeInteger(freshness.max_age_ms)) {
    const nowMs = typeof now === 'string' ? Date.parse(now) : now instanceof Date ? now.getTime() : Number(now)
    if (!Number.isFinite(nowMs)) failures.push('options.now: must be a valid timestamp')
    else {
      const actual = nowMs <= Date.parse(freshness.observed_at) + freshness.max_age_ms ? 'fresh' : 'stale'
      if (actual !== freshness.status) failures.push(`freshness: declared ${freshness.status} but evaluates ${actual}`)
    }
  }
}

export function actionRunEvidenceDigest(value) {
  const unsigned = { ...value }
  delete unsigned.evidence_digest
  delete unsigned.signature
  return sha256(canonical(unsigned))
}

export function validateActionRunEvidence(value, options = {}) {
  const failures = []
  const dimensions = {
    structure: false,
    semantics: false,
    integrity: false,
    completeness: false,
    freshness: false,
  }
  try {
    if (!isPlainRecord(value)) {
      failures.push('evidence: must be a plain object')
      return { ok: false, failures, dimensions }
    }
    scanJson(value, 'evidence', failures)
    const identity = requireRecord(value.identity, 'identity', failures)
    const proposal = requireRecord(value.proposal, 'proposal', failures)
    const approval = requireRecord(value.approval, 'approval', failures)
    const outcome = requireRecord(value.outcome_attestation, 'outcome_attestation', failures)
    const provider = requireRecord(value.provider_evidence, 'provider_evidence', failures)
    const completeness = requireRecord(value.completeness, 'completeness', failures)
    const source = requireRecord(value.source, 'source', failures)
    if (value.schema_version !== ACTION_RUN_SCHEMA_VERSION) failures.push(`schema_version: expected ${ACTION_RUN_SCHEMA_VERSION}`)
    if (!nonEmptyString(value.evidence_id)) failures.push('evidence_id: required non-empty string')
    if (!isIsoTimestamp(value.issued_at)) failures.push('issued_at: invalid ISO UTC timestamp')
    if (!EXECUTION_MODES.includes(value.execution_mode)) failures.push('execution_mode: unsupported mode')
    if (identity && (!nonEmptyString(identity.principal_id) || !isNullableString(identity.tenant_id) || !isNullableString(identity.on_behalf_of)))
      failures.push('identity: invalid principal, tenant, or on_behalf_of')
    if (proposal && (!isPlainRecord(proposal.proposed_effect) || !isDigest(proposal.input_digest))) failures.push('proposal: requires proposed_effect and input_digest')
    if (approval) validateApproval(approval, failures)
    if (outcome && provider && proposal) validateOutcome(value, failures)
    if (source && (!isNullableString(source.trace_id) || (source.audit_row_digest !== null && !isDigest(source.audit_row_digest)) || !nonEmptyString(source.verifier_version) || (source.oracle_verdict_digest !== null && !isDigest(source.oracle_verdict_digest))))
      failures.push('source: invalid trace/digest/version binding')
    if (completeness) validateCompleteness(completeness, options.now, failures)
    dimensions.structure = failures.length === 0
    dimensions.semantics = failures.length === 0
    if (isDigest(value.evidence_digest)) {
      dimensions.integrity = actionRunEvidenceDigest(value) === value.evidence_digest
      if (!dimensions.integrity) failures.push('evidence_digest: does not match the unsigned envelope')
    } else failures.push('evidence_digest: must be a SHA-256 digest')
    dimensions.completeness = !!completeness && COVERAGE.has(completeness.coverage) && failures.every((f) => !f.startsWith('completeness'))
    dimensions.freshness = !!completeness?.freshness && FRESHNESS.has(completeness.freshness.status) && failures.every((f) => !f.startsWith('freshness'))
  } catch {
    failures.push('evidence: malformed attacker-controlled input')
  }
  return { ok: failures.length === 0, failures, dimensions }
}

export function buildActionRunEvidence(input) {
  try {
    const cloned = JSON.parse(canonical({ ...input, schema_version: ACTION_RUN_SCHEMA_VERSION }))
    const evidence = { ...cloned, evidence_digest: '', signature: null }
    evidence.evidence_digest = actionRunEvidenceDigest(evidence)
    const verdict = validateActionRunEvidence(evidence)
    if (!verdict.ok) throw new TypeError(`invalid Action/Run Evidence: ${verdict.failures.join('; ')}`)
    return evidence
  } catch (error) {
    if (error instanceof TypeError) throw error
    throw new TypeError(`invalid Action/Run Evidence: ${error instanceof Error ? error.message : 'unserializable input'}`)
  }
}
