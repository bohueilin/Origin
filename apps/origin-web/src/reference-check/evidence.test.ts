import { describe, expect, it } from 'vitest'
import { buildSyntheticReferenceCheckEvidence } from './evidence'

const base = {
  evidenceId: 'rc-evidence-0001',
  issuedAt: '2026-09-12T12:00:00.000Z',
  maxAgeMs: 60_000,
  scenario: 'support' as const,
  declaredConfig: { model: 'declared-agent-v1', tools: ['crm.write', 'email.send'], context: 'support-policy@1', harness: 'browser@1' },
  selectedPolicy: { denyPii: true, denyForbidden: true, denyTainted: true, refundCap: 50, requireApprovalHigh: true },
  battery: Array.from({ length: 12 }, (_, index) => ({ id: `support-${index + 1}` })),
  rows: Array.from({ length: 12 }, (_, index) => ({
    id: `support-${index + 1}`, yours: 'allow', oracle: 'allow', passed: true, catastrophic: false,
  })),
  environmentDigest: 'a'.repeat(64),
  evaluatorVersion: 'support-reward@1',
  verifierVersion: 'support-verifier@1',
}

describe('buildSyntheticReferenceCheckEvidence', () => {
  it('emits a local policy-evaluation envelope, not a claimed agent run', () => {
    const evidence = buildSyntheticReferenceCheckEvidence(base)

    expect(evidence.execution_mode).toBe('simulated')
    expect(evidence.identity).toEqual({ principal_id: 'user-declared-agent-configuration', tenant_id: null, workload_id: 'origin-reference-check', on_behalf_of: null })
    expect(evidence.subject.run_id).not.toBe(evidence.subject.action_id)
    expect(evidence.outcome_attestation).toEqual({ status: 'not_attempted', attester: 'none', attested_at: null, statement_digest: null })
    expect(evidence.provider_evidence).toEqual({ provider: null, receipt_digest: null, readback_digest: null, readback_at: null })
    expect(evidence.authorization).toMatchObject({ verdict: 'deny', reason_codes: ['synthetic_policy_only_no_execution_authority'] })
    expect(evidence.completeness).toMatchObject({ coverage: 'complete', expected_count: 12, observed_count: 12, omissions: [], duplicates: [] })
    expect(evidence.source.oracle_verdict_digest).toMatch(/^[a-f0-9]{64}$/)
    expect(evidence.proposal.proposed_effect).toMatchObject({ kind: 'synthetic_reference_check_policy_evaluation', named_agent_contacted: false })
  })

  it('makes incomplete or duplicated decision records explicit rather than calling coverage complete', () => {
    const evidence = buildSyntheticReferenceCheckEvidence({
      ...base,
      rows: [base.rows[0], base.rows[0]],
    })

    expect(evidence.completeness.coverage).toBe('partial')
    expect(evidence.completeness.observed_count).toBe(2)
    expect(evidence.completeness.omissions).toHaveLength(11)
    expect(evidence.completeness.duplicates).toHaveLength(1)
  })
})
