import { describe, expect, it } from 'vitest'
import {
  ACTION_RUN_SCHEMA_VERSION,
  ACTION_RUN_SCHEMA_VERSIONS,
  actionRunEvidenceDigest,
  buildActionRunEvidence,
  validateActionRunEvidence,
} from './action-run-evidence.mjs'

const input = {
  evidence_id: 'action-run-fixture-1',
  issued_at: '2026-09-12T00:00:00.000Z',
  execution_mode: 'simulated',
  identity: { principal_id: 'agent-fixture', tenant_id: 'tenant-fixture', workload_id: 'janus-gym', on_behalf_of: null },
  subject: {
    run_id: 'run-fixture-1', action_id: 'action-fixture-1', model_digest: '0'.repeat(64), tools_digest: '1'.repeat(64),
    policy_digest: '2'.repeat(64), environment_digest: '3'.repeat(64), evaluator_version: 'fixture-evaluator-v1',
    verifier_version: 'fixture-verifier-v1', adapter_version: 'fixture-adapter-v1',
  },
  proposal: { action_type: 'refund', proposed_effect: { action: 'refund', amount_usd: 25 }, input_digest: 'a'.repeat(64) },
  authorization: {
    verdict: 'allow', reason_codes: ['fixture-policy-allow'], approval_id: null, approved_by: null, nonce_digest: null, expires_at: null,
  },
  outcome_attestation: {
    status: 'simulated', attester: 'origin', attested_at: '2026-09-12T00:00:00.000Z', statement_digest: 'b'.repeat(64),
  },
  provider_evidence: { provider: null, receipt_digest: null, readback_digest: null, readback_at: null },
  completeness: {
    coverage: 'complete', expected_count: 12, observed_count: 12, covered_ids_digest: 'c'.repeat(64), omissions: [], duplicates: [],
    freshness: { status: 'fresh', observed_at: '2026-09-12T00:00:00.000Z', max_age_ms: 300_000 },
  },
  source: { trace_id: 'trace-fixture-1', audit_row_digest: 'd'.repeat(64), oracle_verdict_digest: 'e'.repeat(64) },
}

describe('Action/Run Evidence', () => {
  it('builds and seals a valid simulated evidence envelope', () => {
    const built = buildActionRunEvidence(input)
    expect(built.evidence_digest).toMatch(/^[0-9a-f]{64}$/)
    expect(actionRunEvidenceDigest({ ...built, evidence_id: 'changed' })).not.toBe(built.evidence_digest)
    expect(validateActionRunEvidence(built).ok).toBe(true)
  })

  it('rejects incompatible mode and coverage', () => {
    const built = buildActionRunEvidence(input)
    expect(validateActionRunEvidence({
      ...built,
      outcome_attestation: { ...built.outcome_attestation, status: 'provider_confirmed' },
    }).ok).toBe(false)
    expect(validateActionRunEvidence({ ...built, completeness: { ...built.completeness, observed_count: 11 } }).ok).toBe(false)
  })

  it.each(['nonce', 'raw_nonce', 'token', 'raw_token', 'credential', 'credentials', 'raw_credential', 'secret', 'password', 'private_key', 'bearer'])(
    'fails closed for nested raw %s fields in both validator and builder',
    (key) => {
      const candidate = { ...input, proposal: { ...input.proposal, nested: { [key]: 'attacker-controlled' } } }
      expect(validateActionRunEvidence({ ...candidate, evidence_digest: 'f'.repeat(64), signature: null }).ok).toBe(false)
      expect(() => buildActionRunEvidence(candidate)).toThrow(TypeError)
    },
  )

  it('preserves digest-only authorization nonce fields and rejects non-positive fresh age', () => {
    const built = buildActionRunEvidence(input)
    expect(validateActionRunEvidence(built).ok).toBe(true)
    expect(validateActionRunEvidence({
      ...built,
      completeness: { ...built.completeness, freshness: { ...built.completeness.freshness, max_age_ms: 0 } },
    }).ok).toBe(false)
  })

  it.each([['nonce_digest', 'raw-secret-value'], ['token_digest', 'raw-secret-value'], ['credential_digest', 'raw-secret-value'], ['nonce_digest', null]])(
    'rejects unsafe nested secret-like digest field %s',
    (key, value) => {
      const candidate = { ...input, proposal: { ...input.proposal, proposed_effect: { [key]: value } } }
      expect(validateActionRunEvidence({ ...candidate, evidence_digest: 'f'.repeat(64), signature: null }).ok).toBe(false)
      expect(() => buildActionRunEvidence(candidate)).toThrow(TypeError)
    },
  )

  it('allows declared nullable and SHA-256 digest fields', () => {
    const approved = {
      ...input,
      authorization: {
        ...input.authorization,
        approval_id: 'approval-1', approved_by: 'reviewer-1', nonce_digest: 'f'.repeat(64), expires_at: '2026-09-12T01:00:00.000Z',
      },
    }
    expect(buildActionRunEvidence(approved).authorization.nonce_digest).toBe('f'.repeat(64))
    expect(buildActionRunEvidence(input).provider_evidence.receipt_digest).toBeNull()
  })

  it('closes omission and duplicate entries to their approved shapes', () => {
    const partial = {
      ...input,
      completeness: { ...input.completeness, coverage: 'partial', expected_count: 12, observed_count: 11 },
    }
    expect(() => buildActionRunEvidence({
      ...partial,
      completeness: { ...partial.completeness, omissions: [{ id_digest: '0'.repeat(64), reason: 'not-observed', extra: true }] },
    })).toThrow(TypeError)
    expect(() => buildActionRunEvidence({
      ...partial,
      completeness: { ...partial.completeness, duplicates: [{ id_digest: '0'.repeat(64), count: 2, extra: true }] },
    })).toThrow(TypeError)
  })

  it('enforces authorization tuples and non-execution outcomes', () => {
    const notAttempted = { status: 'not_attempted', attester: 'none', attested_at: null, statement_digest: null }
    const fullApproval = { approval_id: 'approval-1', approved_by: 'reviewer-1', nonce_digest: 'f'.repeat(64), expires_at: '2026-09-12T01:00:00.000Z' }
    expect(buildActionRunEvidence({ ...input, authorization: { ...input.authorization, ...fullApproval } }).authorization.approved_by).toBe('reviewer-1')
    expect(buildActionRunEvidence({
      ...input, execution_mode: 'live', authorization: { ...input.authorization, verdict: 'deny' }, outcome_attestation: notAttempted,
    }).outcome_attestation.status).toBe('not_attempted')
    expect(buildActionRunEvidence({
      ...input, execution_mode: 'shadow', authorization: { ...input.authorization, verdict: 'approval_required', approval_id: 'approval-1', approved_by: null, nonce_digest: 'f'.repeat(64), expires_at: '2026-09-12T01:00:00.000Z' }, outcome_attestation: notAttempted,
    }).authorization.verdict).toBe('approval_required')
    expect(() => buildActionRunEvidence({ ...input, authorization: { ...input.authorization, approval_id: 'approval-1' } })).toThrow(TypeError)
    expect(() => buildActionRunEvidence({ ...input, execution_mode: 'live', authorization: { ...input.authorization, verdict: 'deny' } })).toThrow(TypeError)
  })

  it('rejects fully populated provider confirmation in the simulated lane', () => {
    const candidate = {
      ...input,
      outcome_attestation: { status: 'provider_confirmed', attester: 'provider', attested_at: '2026-09-12T00:00:00.000Z', statement_digest: 'f'.repeat(64) },
      provider_evidence: { provider: 'fixture-provider', receipt_digest: '1'.repeat(64), readback_digest: '2'.repeat(64), readback_at: '2026-09-12T00:00:00.000Z' },
    }
    const sealed = { ...candidate, evidence_digest: '', signature: null }
    sealed.evidence_digest = actionRunEvidenceDigest(sealed)
    expect(validateActionRunEvidence(sealed).ok).toBe(false)
    expect(() => buildActionRunEvidence(candidate)).toThrow(TypeError)
  })

  it.each(['api_key', 'apiKey', 'signing_key', 'signingKey', 'session_key', 'sessionKey'])(
    'rejects nested raw provider-key alias %s in builder and validator',
    (key) => {
      const candidate = { ...input, proposal: { ...input.proposal, proposed_effect: { [key]: 'raw-provider-key' } } }
      const sealed = { ...candidate, evidence_digest: '', signature: null }
      sealed.evidence_digest = actionRunEvidenceDigest(sealed)
      expect(validateActionRunEvidence(sealed).ok).toBe(false)
      expect(() => buildActionRunEvidence(candidate)).toThrow(TypeError)
    },
  )
})

const DAY_MS = 24 * 60 * 60 * 1000
const evaluation = {
  battery: { id: 'fixture-battery', version: 'fixture-battery-v1' },
  oracle_version: 'fixture-verifier-v1',
  policy_parameters: { refundCap: 100, denyPii: true },
  decisions: [{ id: 'task-1', decision: 'allow', expected: 'allow' }, { id: 'task-2', decision: 'allow', expected: 'deny' }],
  summary: { matched: 1, total: 2, over_grants: 1, misses: 0 },
}
const ENVELOPE_1_0_0_KEYS = [
  'schema_version', 'evidence_id', 'issued_at', 'execution_mode', 'identity', 'subject', 'proposal', 'authorization',
  'outcome_attestation', 'provider_evidence', 'completeness', 'source', 'evidence_digest', 'signature',
]
// Re-seals a hand-edited record so that only the edit under test can fail.
const reseal = (value: Record<string, unknown>) => ({ ...value, evidence_digest: actionRunEvidenceDigest(value) })
const withWindow = (maxAgeMs: number, extra: Record<string, unknown> = {}) => buildActionRunEvidence({
  ...input, ...extra, completeness: { ...input.completeness, freshness: { ...input.completeness.freshness, max_age_ms: maxAgeMs } },
})
const after = (ms: number) => new Date(Date.parse(input.issued_at) + ms).toISOString()

describe('Action/Run Evidence schema versions', () => {
  it('builds 1.1.0 with an evaluation block and 1.0.0 without one', () => {
    expect(ACTION_RUN_SCHEMA_VERSION).toBe('1.1.0')
    expect(ACTION_RUN_SCHEMA_VERSIONS).toEqual(['1.0.0', '1.1.0'])
    const current = buildActionRunEvidence({ ...input, evaluation })
    expect(current.schema_version).toBe('1.1.0')
    expect(current.evaluation).toEqual(evaluation)
    expect(validateActionRunEvidence(current).ok).toBe(true)
    const legacy = buildActionRunEvidence(input)
    expect(legacy.schema_version).toBe('1.0.0')
    expect('evaluation' in legacy).toBe(false)
  })

  it('accepts the exact 1.0.0 key set and rejects a 1.0.0 record that carries an evaluation block', () => {
    const legacy = buildActionRunEvidence(input)
    expect(Object.keys(legacy).sort()).toEqual([...ENVELOPE_1_0_0_KEYS].sort())
    expect(validateActionRunEvidence(legacy).ok).toBe(true)
    const smuggled = validateActionRunEvidence(reseal({ ...legacy, evaluation }))
    expect(smuggled.ok).toBe(false)
    expect(smuggled.failures).toContain('evidence.evaluation: unsupported field')
  })

  it('rejects a 1.1.0 record without a non-null evaluation block', () => {
    const current = buildActionRunEvidence({ ...input, evaluation })
    const { evaluation: _dropped, ...withoutBlock } = current
    expect(validateActionRunEvidence(reseal(withoutBlock)).ok).toBe(false)
    expect(validateActionRunEvidence(reseal({ ...current, evaluation: null })).ok).toBe(false)
    expect(() => buildActionRunEvidence({ ...input, evaluation: null as never })).toThrow(TypeError)
  })

  it.each([
    ['a missing block key', (block: typeof evaluation) => { const { summary: _s, ...rest } = block; return rest }],
    ['an extra block key', (block: typeof evaluation) => ({ ...block, not_tested: ['x'] })],
    ['a missing battery key', (block: typeof evaluation) => ({ ...block, battery: { id: block.battery.id } })],
    ['an extra battery key', (block: typeof evaluation) => ({ ...block, battery: { ...block.battery, extra: 'x' } })],
    ['a missing row key', (block: typeof evaluation) => ({ ...block, decisions: [{ id: 'task-1', decision: 'allow' }] })],
    ['an extra row key', (block: typeof evaluation) => ({ ...block, decisions: [{ ...block.decisions[0], reason: 'free text' }] })],
    ['a missing summary key', (block: typeof evaluation) => ({ ...block, summary: { matched: 1, total: 2, over_grants: 1 } })],
    ['an extra summary key', (block: typeof evaluation) => ({ ...block, summary: { ...block.summary, passed_ids: ['task-1'] } })],
    ['a negative summary count', (block: typeof evaluation) => ({ ...block, summary: { ...block.summary, misses: -1 } })],
    ['non-object policy parameters', (block: typeof evaluation) => ({ ...block, policy_parameters: ['refundCap'] })],
  ])('rejects 1.1.0 with %s', (_name, edit) => {
    const current = buildActionRunEvidence({ ...input, evaluation })
    expect(validateActionRunEvidence(reseal({ ...current, evaluation: edit(structuredClone(evaluation)) })).ok).toBe(false)
  })

  it('rejects an unknown schema version', () => {
    const current = buildActionRunEvidence({ ...input, evaluation })
    const verdict = validateActionRunEvidence(reseal({ ...current, schema_version: '1.2.0' }))
    expect(verdict.ok).toBe(false)
    expect(verdict.dimensions.structure).toBe(false)
  })
})

describe('Action/Run Evidence against the clock', () => {
  it('fails a record dated more than 5 minutes after now and allows up to 5 minutes of skew', () => {
    const built = buildActionRunEvidence(input)
    const skewed = validateActionRunEvidence(built, { now: after(-5 * 60 * 1000) })
    expect(skewed).toMatchObject({ ok: true, clock: null })
    const future = validateActionRunEvidence(built, { now: after(-5 * 60 * 1000 - 1) })
    expect(future).toMatchObject({ ok: false, clock: 'future' })
    expect(future.failures).toEqual(['freshness: observed_at is more than 5 minutes after now'])
    expect(future.dimensions).toMatchObject({ structure: true, semantics: true, integrity: true, freshness: false })
  })

  it('reports a record 31 days after issue with a 30-day window as stale while structure and semantics hold', () => {
    const built = withWindow(30 * DAY_MS)
    expect(validateActionRunEvidence(built, { now: after(30 * DAY_MS) })).toMatchObject({ ok: true, clock: null })
    const stale = validateActionRunEvidence(built, { now: after(31 * DAY_MS) })
    expect(stale).toMatchObject({ ok: false, clock: 'stale' })
    expect(stale.failures).toEqual(['freshness: declared fresh but evaluates stale'])
    expect(stale.dimensions).toMatchObject({ structure: true, semantics: true, integrity: true, freshness: false })
  })

  it('caps the window a simulated record declares only when the caller passes the cap', () => {
    const tenYears = withWindow(3650 * DAY_MS)
    const now = after(31 * DAY_MS)
    expect(validateActionRunEvidence(tenYears, { now })).toMatchObject({ ok: true, clock: null })
    const capped = validateActionRunEvidence(tenYears, { now, simulatedMaxAgeCapMs: 30 * DAY_MS })
    expect(capped).toMatchObject({ ok: false, clock: 'over_cap' })
    expect(capped.dimensions).toMatchObject({ structure: true, semantics: true, integrity: true, freshness: false })
    expect(validateActionRunEvidence(tenYears, { now: after(29 * DAY_MS), simulatedMaxAgeCapMs: 30 * DAY_MS })).toMatchObject({ ok: true, clock: null })
    // Past the declared window itself, the record is stale, not over the cap.
    expect(validateActionRunEvidence(withWindow(31 * DAY_MS), { now: after(32 * DAY_MS), simulatedMaxAgeCapMs: 30 * DAY_MS }).clock).toBe('stale')
  })

  it('does not cap a record that is not simulated, and fails closed on a malformed cap', () => {
    const shadow = withWindow(3650 * DAY_MS, {
      execution_mode: 'shadow', authorization: { ...input.authorization, verdict: 'deny' },
      outcome_attestation: { status: 'not_attempted', attester: 'none', attested_at: null, statement_digest: null },
    })
    expect(validateActionRunEvidence(shadow, { now: after(31 * DAY_MS), simulatedMaxAgeCapMs: 30 * DAY_MS })).toMatchObject({ ok: true, clock: null })
    const malformed = validateActionRunEvidence(buildActionRunEvidence(input), { now: after(60_000), simulatedMaxAgeCapMs: 0 })
    expect(malformed).toMatchObject({ ok: false, clock: null })
    expect(malformed.dimensions.structure).toBe(false)
  })

  it('keeps a malformed freshness field structural, with no clock value', () => {
    const built = buildActionRunEvidence(input)
    const malformed = reseal({ ...built, completeness: { ...built.completeness, freshness: { ...built.completeness.freshness, observed_at: '12 September 2026' } } })
    const verdict = validateActionRunEvidence(malformed, { now: after(60_000) })
    expect(verdict).toMatchObject({ ok: false, clock: null })
    expect(verdict.dimensions).toMatchObject({ structure: false, semantics: false, integrity: true })
  })

  it('keeps a record that declares itself stale while it is fresh a semantic failure', () => {
    const built = buildActionRunEvidence(input)
    const contradictory = reseal({ ...built, completeness: { ...built.completeness, freshness: { ...built.completeness.freshness, status: 'stale' } } })
    const verdict = validateActionRunEvidence(contradictory, { now: after(60_000) })
    expect(verdict).toMatchObject({ ok: false, clock: null })
    expect(verdict.dimensions.structure).toBe(false)
  })
})

describe('Action/Run Evidence issue date', () => {
  it('fails a 1.1.0 record whose issued_at is not the observed_at its window runs from, as structure', () => {
    const current = buildActionRunEvidence({ ...input, evaluation })
    for (const issued_at of ['2099-01-01T00:00:00.000Z', '2001-01-01T00:00:00.000Z']) {
      const verdict = validateActionRunEvidence(reseal({ ...current, issued_at }), { now: after(60_000) })
      expect(verdict).toMatchObject({ ok: false, clock: null, failures: ['issued_at: must equal completeness.freshness.observed_at'] })
      expect(verdict.dimensions).toMatchObject({ structure: false, semantics: false, integrity: true })
    }
    expect(() => buildActionRunEvidence({ ...input, evaluation, issued_at: after(1) })).toThrow(TypeError)
  })

  it('leaves 1.0.0 records, and 1.1.0 records that declare no window, as they were', () => {
    expect(validateActionRunEvidence(buildActionRunEvidence({ ...input, issued_at: after(1) })).ok).toBe(true)
    const noWindow = { ...input.completeness, freshness: { status: 'unknown', observed_at: null, max_age_ms: null } }
    expect(validateActionRunEvidence(buildActionRunEvidence({ ...input, evaluation, issued_at: after(1), completeness: noWindow })).ok).toBe(true)
  })
})
