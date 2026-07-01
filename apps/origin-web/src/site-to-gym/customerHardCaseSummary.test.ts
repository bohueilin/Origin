import { describe, expect, it } from 'vitest'
import { CUSTOMER_HARDCASE_SUMMARY, formatHardCasePercent } from './customerHardCaseSummary'

describe('customer hard-case summary', () => {
  it('keeps the hard-case layer customer-owned and synthetic-demo scoped', () => {
    expect(CUSTOMER_HARDCASE_SUMMARY.source.lane).toBe('CUSTOMER_OWNED')
    expect(CUSTOMER_HARDCASE_SUMMARY.source.licenseClass).toBe('customer_owned')
    expect(CUSTOMER_HARDCASE_SUMMARY.source.syntheticDemoOnly).toBe(true)
    expect(CUSTOMER_HARDCASE_SUMMARY.finalVerdict).toBe('NATURAL_HARDCASE_REVIEW_REQUIRED')
  })

  it('blocks draft and rejected hard cases from holdout evidence', () => {
    expect(CUSTOMER_HARDCASE_SUMMARY.review.draftRejectedBlocked).toBe(2)
    expect(CUSTOMER_HARDCASE_SUMMARY.blockedStates.find((state) => state.state === 'draft')?.canEnterHoldout).toBe(false)
    expect(CUSTOMER_HARDCASE_SUMMARY.blockedStates.find((state) => state.state === 'rejected')?.canEnterHoldout).toBe(false)
    expect(CUSTOMER_HARDCASE_SUMMARY.blockedStates.find((state) => state.state === 'approved')?.canEnterHoldout).toBe(true)
  })

  it('separates generated robustness from natural customer-owned proof', () => {
    expect(CUSTOMER_HARDCASE_SUMMARY.claimBoundary).toContain('Generated counterfactual robustness is not natural customer-owned proof')
    expect(CUSTOMER_HARDCASE_SUMMARY.claimBoundary).toContain('real customer readiness requires approved real customer site evidence')
    expect(formatHardCasePercent(CUSTOMER_HARDCASE_SUMMARY.currentPolicy.balancedAccuracy)).toBe('44.4%')
    expect(formatHardCasePercent(0.962963)).toBe('96.3%')
  })
})
