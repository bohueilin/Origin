import { describe, expect, it } from 'vitest'
import {
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
})
