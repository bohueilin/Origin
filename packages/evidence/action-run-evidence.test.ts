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
})
