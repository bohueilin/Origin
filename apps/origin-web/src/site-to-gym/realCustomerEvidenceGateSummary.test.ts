import { describe, expect, it } from 'vitest'
import {
  REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY,
  realCustomerGateStateClass,
} from './realCustomerEvidenceGateSummary'

describe('real customer evidence gate summary', () => {
  it('defaults to blocked real-customer readiness', () => {
    expect(REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.gateStatus).toBe('BLOCKED_NO_REAL_CUSTOMER_AUTHORIZATION')
    expect(REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.verdict).toBe('REAL_CUSTOMER_HARDCASE_NOT_AVAILABLE')
    expect(REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.defaultGate.rowsCompiled).toBe(0)
    expect(REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.defaultGate.realCustomerReadinessPassed).toBe(false)
    expect(REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.defaultGate.trainingAllowed).toBe(false)
    expect(REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.defaultGate.externalApiAllowed).toBe(false)
  })

  it('names the evidence and authorization inputs needed for design partners', () => {
    expect(REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.requiredInputs).toContain('restricted-zone examples')
    expect(REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.requiredInputs).toContain('explicit approval for evaluation')
    expect(REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.requiredInputs).toContain('separate approval for training')
    expect(REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY.claimBoundary).toContain('redaction where needed')
  })

  it('keeps blocked and ready states visually distinct', () => {
    expect(realCustomerGateStateClass('blocked')).toBe('fail')
    expect(realCustomerGateStateClass('ready')).toBe('pass')
  })
})
