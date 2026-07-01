import { describe, expect, it } from 'vitest'
import { CUSTOMER_POLICY_GATE_SUMMARY, formatPolicyGatePercent } from './customerPolicyGateSummary'

describe('customer policy gate summary', () => {
  it('keeps the learned-policy claim synthetic-demo scoped', () => {
    expect(CUSTOMER_POLICY_GATE_SUMMARY.finalVerdict).toBe('LEARNED_POLICY_READY_FOR_LIMITED_PILOT')
    expect(CUSTOMER_POLICY_GATE_SUMMARY.authorization.mode).toBe('training_authorized')
    expect(CUSTOMER_POLICY_GATE_SUMMARY.authorization.dataBoundary).toBe('Origin-owned synthetic demo customer floor only')
    expect(CUSTOMER_POLICY_GATE_SUMMARY.claimBoundary).toContain('Synthetic-demo learned-policy evidence only')
    expect(CUSTOMER_POLICY_GATE_SUMMARY.model.featureBoundary).toContain('route summaries')
  })

  it('separates learned candidate, deterministic rule harness, and oracle upper bound', () => {
    expect(CUSTOMER_POLICY_GATE_SUMMARY.learnedCandidate.label).toContain('learned')
    expect(CUSTOMER_POLICY_GATE_SUMMARY.ruleHarness.note).toContain('Not trained')
    expect(CUSTOMER_POLICY_GATE_SUMMARY.oracleUpperBound.label).toContain('Oracle')
    expect(CUSTOMER_POLICY_GATE_SUMMARY.model.forbiddenFeaturesUsed).toBe(0)
  })

  it('keeps all threshold gates visible', () => {
    expect(CUSTOMER_POLICY_GATE_SUMMARY.safetyThresholds).toHaveLength(5)
    expect(CUSTOMER_POLICY_GATE_SUMMARY.safetyThresholds.every((gate) => gate.passed)).toBe(true)
    expect(formatPolicyGatePercent(0.833333)).toBe('83.3%')
  })
})
