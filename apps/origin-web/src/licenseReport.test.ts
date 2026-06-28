import { describe, expect, it } from 'vitest'
import { buildEnvironmentPlan, type EnvironmentRequirement } from './environmentPlan'
import { buildPhysicalAiLicenseReport } from './licenseReport'
import { buildWarehouseDemoForTasks } from './warehouse'

const req: EnvironmentRequirement = {
  outcome: 'A robot assistant for my dad’s factory that moves parts safely.',
  domain: 'manufacturing',
  embodiment: 'humanoid',
}

describe('buildPhysicalAiLicenseReport', () => {
  it('produces a deterministic customer-readable report', () => {
    const plan = buildEnvironmentPlan(req)
    const demo = buildWarehouseDemoForTasks(plan.tasks)
    const a = buildPhysicalAiLicenseReport(plan, demo)
    const b = buildPhysicalAiLicenseReport(plan, demo)

    expect(a).toEqual(b)
    expect(a.reportId).toContain(plan.id)
    expect(a.title).toContain('Manufacturing floor')
    expect(a.summary).toContain('live robot/model still needs to run')
  })

  it('surfaces calibration, training-data outputs, and pilot next steps', () => {
    const plan = buildEnvironmentPlan(req)
    const report = buildPhysicalAiLicenseReport(plan, buildWarehouseDemoForTasks(plan.tasks))

    expect(report.decision).toBe('reference_cleared')
    expect(report.decisionLabel).toBe('Reference oracle clears eval')
    expect(report.disclaimer).toContain('not a regulatory certification')
    expect(report.calibration.far).toBe(0)
    expect(report.calibration.frr).toBe(0)
    expect(report.trainingData.failureTags).toBeGreaterThan(0)
    expect(report.trainingData.preferencePairs).toBeGreaterThan(0)
    expect(report.trainingData.rewardRows).toBeGreaterThan(0)
    expect(report.nextSteps.some((s) => s.includes('tamper-evident'))).toBe(true)
  })
})
