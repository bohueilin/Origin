import { canonical, sha256 } from './env-evidence.mjs'

export const ACTION_RUN_SCHEMA_VERSION = '1.0.0'
export const EXECUTION_MODES = Object.freeze(['simulated', 'authorized_fixture', 'sandbox', 'customer_replay', 'shadow', 'live'])
export const OUTCOME_STATUSES = Object.freeze(['not_attempted', 'simulated', 'claimed', 'provider_confirmed', 'independently_verified', 'failed', 'unknown'])

const HEX_64 = /^[0-9a-f]{64}$/
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
const AUTHORIZATION_VERDICTS = new Set(['allow', 'deny', 'approval_required'])
const ATTESTERS = new Set(['none', 'origin', 'provider', 'independent_verifier'])
const COVERAGE = new Set(['complete', 'partial', 'unknown'])
const FRESHNESS = new Set(['fresh', 'stale', 'unknown'])
const NULLABLE_SECRET_DIGEST_PATHS = new Set(['evidence.authorization.nonce_digest'])

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isPlainRecord = (value) => isRecord(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0
const nullableString = (value) => value === null || typeof value === 'string'
const digest = (value) => typeof value === 'string' && HEX_64.test(value)
const count = (value) => Number.isSafeInteger(value) && value >= 0
const timestamp = (value) => typeof value === 'string' && ISO_UTC.test(value) && !Number.isNaN(Date.parse(value))
const isSecretLikeKey = (key) => /(?:nonce|token|credential|secret|password|private[_-]?key|bearer)/i.test(key)

function add(failures, condition, message) {
  if (!condition) failures.push(message)
}

function requireRecord(value, name, failures) {
  if (!isPlainRecord(value)) {
    failures.push(`${name}: required plain object missing or malformed`)
    return null
  }
  return value
}

function exactKeys(value, name, keys, failures) {
  if (!value) return
  const allowed = new Set(keys)
  for (const key of Object.keys(value)) if (!allowed.has(key)) failures.push(`${name}.${key}: unsupported field`)
  for (const key of keys) if (!(key in value)) failures.push(`${name}.${key}: required field missing`)
}

function scanJson(value, path, failures) {
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) {
    if (typeof value === 'number' && !Number.isFinite(value)) failures.push(`${path}: non-finite number`)
    return
  }
  if (Array.isArray(value)) return value.forEach((item, index) => scanJson(item, `${path}[${index}]`, failures))
  if (!isPlainRecord(value)) {
    failures.push(`${path}: evidence must contain plain JSON only`)
    return
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`
    const safeSecretDigest = key.endsWith('_digest') && (digest(child) || (child === null && NULLABLE_SECRET_DIGEST_PATHS.has(childPath)))
    if (isSecretLikeKey(key) && !safeSecretDigest)
      failures.push(`${path}.${key}: raw secret-like fields are forbidden`)
    scanJson(child, childPath, failures)
  }
}

function validateAuthorization(authorization, failures) {
  exactKeys(authorization, 'authorization', ['verdict', 'reason_codes', 'approval_id', 'approved_by', 'nonce_digest', 'expires_at'], failures)
  add(failures, AUTHORIZATION_VERDICTS.has(authorization.verdict), 'authorization.verdict: unsupported verdict')
  add(failures, Array.isArray(authorization.reason_codes) && authorization.reason_codes.every(nonEmptyString), 'authorization.reason_codes: must be an array of non-empty strings')
  for (const key of ['approval_id', 'approved_by']) add(failures, nullableString(authorization[key]), `authorization.${key}: must be null or string`)
  add(failures, authorization.nonce_digest === null || digest(authorization.nonce_digest), 'authorization.nonce_digest: must be null or a SHA-256 digest')
  add(failures, authorization.expires_at === null || timestamp(authorization.expires_at), 'authorization.expires_at: must be null or ISO UTC')
  const noApproval = authorization.approval_id === null && authorization.approved_by === null && authorization.nonce_digest === null && authorization.expires_at === null
  const approvedTuple = nonEmptyString(authorization.approval_id) && nonEmptyString(authorization.approved_by) && digest(authorization.nonce_digest) && timestamp(authorization.expires_at)
  const pendingTuple = nonEmptyString(authorization.approval_id) && authorization.approved_by === null && digest(authorization.nonce_digest) && timestamp(authorization.expires_at)
  if (authorization.verdict === 'allow' && !noApproval && !approvedTuple) failures.push('authorization: allow requires no approval or a complete approved tuple')
  if (authorization.verdict === 'deny' && !noApproval) failures.push('authorization: deny must not carry approval material')
  if (authorization.verdict === 'approval_required' && authorization.approved_by !== null) failures.push('authorization: approval_required must not name an approver')
  if (authorization.verdict === 'approval_required' && !noApproval && !pendingTuple) failures.push('authorization: approval_required requires no approval or a coherent pending tuple')
}

function emptyProvider(provider) {
  return provider.provider === null && provider.receipt_digest === null && provider.readback_digest === null && provider.readback_at === null
}

function validateProviderEvidence(provider, failures) {
  exactKeys(provider, 'provider_evidence', ['provider', 'receipt_digest', 'readback_digest', 'readback_at'], failures)
  add(failures, nullableString(provider.provider), 'provider_evidence.provider: must be null or string')
  add(failures, provider.receipt_digest === null || digest(provider.receipt_digest), 'provider_evidence.receipt_digest: must be null or a digest')
  add(failures, provider.readback_digest === null || digest(provider.readback_digest), 'provider_evidence.readback_digest: must be null or a digest')
  add(failures, provider.readback_at === null || timestamp(provider.readback_at), 'provider_evidence.readback_at: invalid timestamp')
  if (provider.readback_digest === null && provider.readback_at !== null) failures.push('provider_evidence: readback time requires readback digest')
  if (provider.readback_digest !== null && provider.readback_at === null) failures.push('provider_evidence: readback digest requires readback time')
  if (provider.provider === null && (provider.receipt_digest !== null || provider.readback_digest !== null || provider.readback_at !== null))
    failures.push('provider_evidence: provider name is required when provider evidence is present')
  if (provider.provider !== null && provider.receipt_digest === null && provider.readback_digest === null && provider.readback_at === null)
    failures.push('provider_evidence: provider name requires receipt or readback evidence')
}

function validateOutcome(evidence, failures) {
  const outcome = evidence.outcome_attestation
  const provider = evidence.provider_evidence
  exactKeys(outcome, 'outcome_attestation', ['status', 'attester', 'attested_at', 'statement_digest'], failures)
  add(failures, OUTCOME_STATUSES.includes(outcome.status), 'outcome_attestation.status: unsupported status')
  add(failures, ATTESTERS.has(outcome.attester), 'outcome_attestation.attester: unsupported attester')
  add(failures, outcome.attested_at === null || timestamp(outcome.attested_at), 'outcome_attestation.attested_at: invalid timestamp')
  add(failures, outcome.statement_digest === null || digest(outcome.statement_digest), 'outcome_attestation.statement_digest: must be null or a digest')

  if (outcome.status === 'not_attempted') {
    if (!emptyProvider(provider)) failures.push('not_attempted requires empty provider evidence')
    if (outcome.attester !== 'none' || outcome.attested_at !== null || outcome.statement_digest !== null) failures.push('not_attempted requires none attester and null attestation fields')
  }
  if (outcome.status === 'simulated') {
    if (evidence.execution_mode !== 'simulated') failures.push('simulated outcome requires simulated execution mode')
    if (!emptyProvider(provider)) failures.push('simulated execution requires empty provider evidence')
    if (outcome.attester !== 'origin') failures.push('simulated outcome requires origin attester')
  }
  if (outcome.status === 'provider_confirmed') {
    if (outcome.attester !== 'provider' || !nonEmptyString(provider.provider) || !digest(provider.receipt_digest))
      failures.push('provider_confirmed requires provider attester, name, and receipt digest')
  }
  if (outcome.status === 'independently_verified') {
    if (outcome.attester !== 'independent_verifier' || !digest(provider.readback_digest) || !timestamp(provider.readback_at))
      failures.push('independently_verified requires independent verifier attester and readback digest/time')
  }
  if (outcome.status === 'claimed' && !['origin', 'provider'].includes(outcome.attester)) failures.push('claimed outcome requires origin or provider attester')
}

function validateCompleteness(completeness, now, failures) {
  exactKeys(completeness, 'completeness', ['coverage', 'expected_count', 'observed_count', 'covered_ids_digest', 'omissions', 'duplicates', 'freshness'], failures)
  add(failures, COVERAGE.has(completeness.coverage), 'completeness.coverage: unsupported status')
  add(failures, completeness.expected_count === null || count(completeness.expected_count), 'completeness.expected_count: must be null or non-negative integer')
  add(failures, count(completeness.observed_count), 'completeness.observed_count: must be a non-negative integer')
  add(failures, completeness.covered_ids_digest === null || digest(completeness.covered_ids_digest), 'completeness.covered_ids_digest: must be null or a digest')
  add(failures, Array.isArray(completeness.omissions) && Array.isArray(completeness.duplicates), 'completeness.omissions/duplicates: must be arrays')
  for (const omission of completeness.omissions || []) {
    if (isPlainRecord(omission)) exactKeys(omission, 'completeness.omissions[]', ['id_digest', 'reason'], failures)
    add(failures, isPlainRecord(omission) && digest(omission.id_digest) && nonEmptyString(omission.reason), 'completeness.omissions: invalid entry')
  }
  for (const duplicate of completeness.duplicates || []) {
    if (isPlainRecord(duplicate)) exactKeys(duplicate, 'completeness.duplicates[]', ['id_digest', 'count'], failures)
    add(failures, isPlainRecord(duplicate) && digest(duplicate.id_digest) && Number.isSafeInteger(duplicate.count) && duplicate.count >= 2, 'completeness.duplicates: invalid entry')
  }
  if (completeness.coverage === 'complete' && (completeness.expected_count === null || completeness.expected_count !== completeness.observed_count || completeness.omissions.length || completeness.duplicates.length))
    failures.push('completeness: complete coverage requires exact counts without omissions or duplicates')
  if (completeness.coverage === 'unknown' && completeness.expected_count !== null) failures.push('completeness: unknown coverage must not claim expected count')

  const fresh = requireRecord(completeness.freshness, 'completeness.freshness', failures)
  if (!fresh) return
  exactKeys(fresh, 'completeness.freshness', ['status', 'observed_at', 'max_age_ms'], failures)
  add(failures, FRESHNESS.has(fresh.status), 'freshness.status: unsupported status')
  add(failures, fresh.observed_at === null || timestamp(fresh.observed_at), 'freshness.observed_at: invalid timestamp')
  add(failures, fresh.max_age_ms === null || (Number.isSafeInteger(fresh.max_age_ms) && fresh.max_age_ms > 0), 'freshness.max_age_ms: must be a strictly positive integer or null')
  if (fresh.status === 'unknown' && (fresh.observed_at !== null || fresh.max_age_ms !== null)) failures.push('freshness: unknown must not carry timing claims')
  if (fresh.status !== 'unknown' && (!timestamp(fresh.observed_at) || !Number.isSafeInteger(fresh.max_age_ms) || fresh.max_age_ms <= 0)) failures.push('freshness: fresh/stale requires observed_at and positive max_age_ms')
  if (now !== undefined && fresh.status !== 'unknown' && timestamp(fresh.observed_at) && Number.isSafeInteger(fresh.max_age_ms) && fresh.max_age_ms > 0) {
    const nowMs = typeof now === 'string' ? Date.parse(now) : now instanceof Date ? now.getTime() : Number(now)
    if (!Number.isFinite(nowMs)) failures.push('options.now: must be a valid timestamp')
    else {
      const actual = nowMs <= Date.parse(fresh.observed_at) + fresh.max_age_ms ? 'fresh' : 'stale'
      if (actual !== fresh.status) failures.push(`freshness: declared ${fresh.status} but evaluates ${actual}`)
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
  const dimensions = { structure: false, semantics: false, integrity: false, authorization_valid: false, provider_bound: false, completeness: false, freshness: false }
  try {
    if (!isPlainRecord(value)) return { ok: false, failures: ['evidence: must be a plain object'], dimensions }
    scanJson(value, 'evidence', failures)
    exactKeys(value, 'evidence', ['schema_version', 'evidence_id', 'issued_at', 'execution_mode', 'identity', 'subject', 'proposal', 'authorization', 'outcome_attestation', 'provider_evidence', 'completeness', 'source', 'evidence_digest', 'signature'], failures)
    const identity = requireRecord(value.identity, 'identity', failures)
    const subject = requireRecord(value.subject, 'subject', failures)
    const proposal = requireRecord(value.proposal, 'proposal', failures)
    const authorization = requireRecord(value.authorization, 'authorization', failures)
    const outcome = requireRecord(value.outcome_attestation, 'outcome_attestation', failures)
    const provider = requireRecord(value.provider_evidence, 'provider_evidence', failures)
    const completeness = requireRecord(value.completeness, 'completeness', failures)
    const source = requireRecord(value.source, 'source', failures)
    add(failures, value.schema_version === ACTION_RUN_SCHEMA_VERSION, `schema_version: expected ${ACTION_RUN_SCHEMA_VERSION}`)
    add(failures, nonEmptyString(value.evidence_id), 'evidence_id: required non-empty string')
    add(failures, timestamp(value.issued_at), 'issued_at: invalid ISO UTC timestamp')
    add(failures, EXECUTION_MODES.includes(value.execution_mode), 'execution_mode: unsupported mode')
    if (value.signature !== null) {
      const signature = requireRecord(value.signature, 'signature', failures)
      if (signature) {
        exactKeys(signature, 'signature', ['key_id', 'key_epoch', 'sigil'], failures)
        add(failures, nonEmptyString(signature.key_id) && Number.isSafeInteger(signature.key_epoch) && signature.key_epoch > 0 && isPlainRecord(signature.sigil), 'signature: invalid key metadata or Sigil')
      }
    }
    if (identity) {
      exactKeys(identity, 'identity', ['principal_id', 'tenant_id', 'workload_id', 'on_behalf_of'], failures)
      add(failures, nonEmptyString(identity.principal_id) && nullableString(identity.tenant_id) && nonEmptyString(identity.workload_id) && nullableString(identity.on_behalf_of), 'identity: invalid principal, tenant, workload, or on_behalf_of')
    }
    if (subject) {
      exactKeys(subject, 'subject', ['run_id', 'action_id', 'model_digest', 'tools_digest', 'policy_digest', 'environment_digest', 'evaluator_version', 'verifier_version', 'adapter_version'], failures)
      add(failures, nonEmptyString(subject.run_id) && nonEmptyString(subject.action_id) && digest(subject.model_digest) && digest(subject.tools_digest) && digest(subject.policy_digest) && digest(subject.environment_digest) && nonEmptyString(subject.evaluator_version) && nonEmptyString(subject.verifier_version) && nullableString(subject.adapter_version), 'subject: invalid run/action binding')
    }
    if (proposal) {
      exactKeys(proposal, 'proposal', ['action_type', 'proposed_effect', 'input_digest'], failures)
      add(failures, nonEmptyString(proposal.action_type) && isPlainRecord(proposal.proposed_effect) && digest(proposal.input_digest), 'proposal: requires action_type, proposed_effect, and input_digest')
    }
    const authorizationStart = failures.length
    if (authorization) validateAuthorization(authorization, failures)
    dimensions.authorization_valid = authorizationStart === failures.length
    const providerFailures = []
    if (provider) validateProviderEvidence(provider, providerFailures)
    dimensions.provider_bound = providerFailures.length === 0
    failures.push(...providerFailures)
    if (outcome && provider) validateOutcome(value, failures)
    if (authorization && outcome && ['deny', 'approval_required'].includes(authorization.verdict) && outcome.status !== 'not_attempted')
      failures.push('authorization: deny/approval_required requires not_attempted outcome')
    if (source) {
      exactKeys(source, 'source', ['trace_id', 'audit_row_digest', 'oracle_verdict_digest'], failures)
      add(failures, nullableString(source.trace_id) && (source.audit_row_digest === null || digest(source.audit_row_digest)) && (source.oracle_verdict_digest === null || digest(source.oracle_verdict_digest)), 'source: invalid trace/oracle binding')
    }
    if (completeness) validateCompleteness(completeness, options.now, failures)
    dimensions.structure = failures.length === 0
    dimensions.semantics = failures.length === 0
    if (digest(value.evidence_digest)) {
      dimensions.integrity = actionRunEvidenceDigest(value) === value.evidence_digest
      if (!dimensions.integrity) failures.push('evidence_digest: does not match the unsigned envelope')
    } else failures.push('evidence_digest: must be a SHA-256 digest')
    dimensions.completeness = !!completeness && completeness.coverage === 'complete' && failures.every((failure) => !failure.startsWith('completeness'))
    dimensions.freshness = !!completeness?.freshness && completeness.freshness.status === 'fresh' && failures.every((failure) => !failure.startsWith('freshness'))
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
