import { describe, expect, it } from 'vitest'
import { DESIGN_PARTNER_INTAKE_SUMMARY } from './designPartnerIntakeSummary'

describe('design partner intake summary', () => {
  it('keeps the blank intake packet blocked by default', () => {
    expect(DESIGN_PARTNER_INTAKE_SUMMARY.contractVersion).toBe('design-partner-evidence-contract-v1')
    expect(DESIGN_PARTNER_INTAKE_SUMMARY.templateAvailable).toBe(true)
    expect(DESIGN_PARTNER_INTAKE_SUMMARY.preflightValidatorAvailable).toBe(true)
    expect(DESIGN_PARTNER_INTAKE_SUMMARY.packetStatus).toBe('STRUCTURALLY_VALID_BUT_NOT_AUTHORIZED')
    expect(DESIGN_PARTNER_INTAKE_SUMMARY.readyToCompile).toBe(false)
    expect(DESIGN_PARTNER_INTAKE_SUMMARY.readyForTraining).toBe(false)
  })

  it('does not imply real customer evidence or readiness', () => {
    expect(DESIGN_PARTNER_INTAKE_SUMMARY.realCustomerEvidenceAvailable).toBe(false)
    expect(DESIGN_PARTNER_INTAKE_SUMMARY.realCustomerReadinessPassed).toBe(false)
    expect(DESIGN_PARTNER_INTAKE_SUMMARY.externalApiDefault).toBe(false)
    expect(DESIGN_PARTNER_INTAKE_SUMMARY.blockedClaim).toBe('Real customer readiness.')
    expect(DESIGN_PARTNER_INTAKE_SUMMARY.claimBoundary).toContain('does not imply real customer data exists')
  })

  it('separates evidence layers and partner inputs', () => {
    expect(DESIGN_PARTNER_INTAKE_SUMMARY.requiredInputs).toContain('SHA-256 provenance')
    expect(DESIGN_PARTNER_INTAKE_SUMMARY.originOutputs).toContain('policy evaluation report')
    expect(DESIGN_PARTNER_INTAKE_SUMMARY.evidenceLayers[DESIGN_PARTNER_INTAKE_SUMMARY.evidenceLayers.length - 1].claim).toContain('approval and eval gates')
  })
})
