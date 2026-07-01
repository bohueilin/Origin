import { describe, expect, it } from 'vitest'
import { CUSTOMER_ROBUSTNESS_SUMMARY, formatRobustnessPercent } from './customerRobustnessSummary'

describe('customer robustness summary', () => {
  it('keeps the current customer candidate broader claim blocked', () => {
    expect(CUSTOMER_ROBUSTNESS_SUMMARY.currentCandidateVerdict).toBe('CUSTOMER_SITE_PASS_BUT_COUNTERFACTUAL_FAIL')
    expect(CUSTOMER_ROBUSTNESS_SUMMARY.currentGate.status).toBe('ROBUSTNESS_GATE_FAIL')
    expect(CUSTOMER_ROBUSTNESS_SUMMARY.currentGate.refuseRecall).toBe(0.953846)
    expect(CUSTOMER_ROBUSTNESS_SUMMARY.currentGate.falseAcceptRate).toBe(0.046154)
  })

  it('keeps counterfactual curriculum outside the customer-owned lane', () => {
    expect(CUSTOMER_ROBUSTNESS_SUMMARY.curriculum.lane).toBe('COUNTERFACTUAL_ROBUSTNESS')
    expect(CUSTOMER_ROBUSTNESS_SUMMARY.curriculum.licenseClass).toBe('non_commercial_counterfactual_robustness')
    expect(CUSTOMER_ROBUSTNESS_SUMMARY.claimBoundary).toContain('not CUSTOMER_OWNED readiness')
  })

  it('formats robustness percentages', () => {
    expect(formatRobustnessPercent(0.953846)).toBe('95.4%')
    expect(formatRobustnessPercent(1)).toBe('100%')
    expect(formatRobustnessPercent(null)).toBe('not estimable')
  })
})
