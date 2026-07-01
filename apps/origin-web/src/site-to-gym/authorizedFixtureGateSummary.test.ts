import { describe, expect, it } from 'vitest'
import {
  AUTHORIZED_FIXTURE_GATE_SUMMARY,
  formatAuthorizedFixturePercent,
} from './authorizedFixtureGateSummary'

describe('authorized fixture gate summary', () => {
  it('keeps the default real customer gate fail-closed', () => {
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.defaultRealCustomerGateStatus).toBe('BLOCKED_NO_REAL_CUSTOMER_AUTHORIZATION')
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.authorizedFixtureStatus).toBe('AUTHORIZED_FIXTURE_EVALUATED')
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.authorizedFixtureIsRealCustomerData).toBe(false)
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.realCustomerReadinessPassed).toBe(false)
  })

  it('shows the authorized positive path and rejected evidence rail', () => {
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.rows).toBe(7)
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.labelMix).toEqual({ finish: 1, escalate: 3, refuse: 3 })
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.evidenceReview.included).toBe(5)
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.evidenceReview.excluded).toBe(5)
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.evidenceReview.compiledHardCases).toBe(7)
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.evidenceReview.blockedHardCases).toBe(6)
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.evidenceReview.pendingRedactionBlocked).toBe(true)
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.evidenceReview.missingShaBlocked).toBe(true)
  })

  it('keeps the claim boundary explicit', () => {
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.trainingAllowed).toBe(false)
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.externalApiAllowed).toBe(false)
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.oracleDivergence).toBe(0)
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.allowedClaim).toContain('mechanics')
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.blockedClaim).toBe('Real customer readiness.')
    expect(AUTHORIZED_FIXTURE_GATE_SUMMARY.claimBoundary).toContain('not real customer data')
    expect(formatAuthorizedFixturePercent(0.833333)).toBe('83.3%')
  })
})
