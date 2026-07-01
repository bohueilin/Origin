import { describe, expect, it } from 'vitest'
import {
  CUSTOMER_CALIBRATION_SUMMARY,
  CUSTOMER_CALIBRATION_TASKS,
  formatCalibrationPercent,
} from './customerCalibrationSummary'

describe('customer calibration summary', () => {
  it('keeps the public calibration claim authorization-gated', () => {
    expect(CUSTOMER_CALIBRATION_SUMMARY.generatedRows).toBe(84)
    expect(CUSTOMER_CALIBRATION_SUMMARY.labelMix).toEqual({ finish: 36, escalate: 36, refuse: 12 })
    expect(CUSTOMER_CALIBRATION_SUMMARY.authorization.mode).toBe('evaluation_only')
    expect(CUSTOMER_CALIBRATION_SUMMARY.authorization.trainingAllowed).toBe(false)
    expect(CUSTOMER_CALIBRATION_SUMMARY.authorization.requiresCustomerApprovalBeforeTraining).toBe(true)
    expect(CUSTOMER_CALIBRATION_SUMMARY.claimBoundary).toContain('not a trained customer policy')
  })

  it('keeps every split refuse-supported and disjoint by claim', () => {
    for (const split of Object.values(CUSTOMER_CALIBRATION_SUMMARY.splitMix)) {
      expect(split.refuse).toBeGreaterThan(0)
    }
    expect(CUSTOMER_CALIBRATION_SUMMARY.splitOverlap).toEqual({
      sourceRecordId: 0,
      topologyHash: 0,
      occupancyHash: 0,
    })
  })

  it('shows the calibrated candidate as eval-only, not trained', () => {
    expect(CUSTOMER_CALIBRATION_SUMMARY.before.falseAcceptRate).toBe(0)
    expect(CUSTOMER_CALIBRATION_SUMMARY.before.falseRefuseRate).toBeGreaterThan(0.8)
    expect(CUSTOMER_CALIBRATION_SUMMARY.candidate.policy).toContain('not trained')
    expect(CUSTOMER_CALIBRATION_TASKS).toHaveLength(3)
    expect(CUSTOMER_CALIBRATION_TASKS.some((task) => task.failureType === 'correct refuse')).toBe(true)
    expect(formatCalibrationPercent(0.833333)).toBe('83.3%')
  })
})
