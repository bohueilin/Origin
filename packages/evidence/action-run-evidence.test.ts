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
  identity: { principal_id: 'agent-fixture', tenant_id: 'tenant-fixture', on_behalf_of: null },
  proposal: {
    proposed_effect: { action: 'refund', amount_usd: 25 },
    input_digest: 'a'.repeat(64),
  },
  approval: {
    authorization: 'allow',
    required: false,
    status: 'not_required',
    nonce_digest: null,
    expires_at: null,
  },
  outcome_attestation: {
    status: 'simulated',
    attester: 'origin',
    attested_at: '2026-09-12T00:00:00.000Z',
    statement_digest: 'b'.repeat(64),
  },
  provider_evidence: { provider: null, receipt_digest: null, readback_digest: null, readback_at: null },
  completeness: {
    coverage: 'complete',
    expected_count: 12,
    observed_count: 12,
    covered_ids_digest: 'c'.repeat(64),
    omissions: [],
    duplicates: [],
    freshness: {
      status: 'fresh',
      observed_at: '2026-09-12T00:00:00.000Z',
      max_age_ms: 300_000,
    },
  },
  source: {
    trace_id: 'trace-fixture-1',
    audit_row_digest: 'd'.repeat(64),
    verifier_version: 'fixture-oracle-v1',
    oracle_verdict_digest: 'e'.repeat(64),
  },
}

describe('Action/Run Evidence', () => {
  it('builds and seals a valid simulated evidence envelope', () => {
    const built = buildActionRunEvidence(input)
    expect(built.evidence_digest).toMatch(/^[0-9a-f]{64}$/)
    expect(actionRunEvidenceDigest({ ...built, evidence_id: 'changed' })).not.toBe(built.evidence_digest)
    expect(validateActionRunEvidence(built).ok).toBe(true)
  })

  it('rejects incompatible mode, coverage, and bearer-secret input', () => {
    const built = buildActionRunEvidence(input)
    expect(
      validateActionRunEvidence({
        ...built,
        outcome_attestation: { ...built.outcome_attestation, status: 'provider_confirmed' },
      }).ok,
    ).toBe(false)
    expect(validateActionRunEvidence({ ...built, completeness: { ...built.completeness, observed_count: 11 } }).ok).toBe(false)
    expect(validateActionRunEvidence({ ...built, approval: { ...built.approval, raw_nonce: 'bearer-secret' } }).ok).toBe(false)
  })
})
