// fleetBench — behavioral spec, written BEFORE the implementation (TDD).
//
// Measures fleetVerify the way gateBench measures parseGate: seeded scenarios
// run through the REAL planner (planMultiAgent), then corrupted one violation
// class at a time. Catch = verdict VOID on a corrupted schedule; the equally
// commercial number is zero false VOIDs on clean, fully-deconflicted plans.
// Also OBSERVATIONAL: how the verifier judges the planner's own escape-hatch
// plans (fullyDeconflicted:false) — reported, not asserted.

import { describe, expect, it } from 'vitest'
import { runFleetBench, FLEET_CORRUPTIONS } from './fleetBench'

describe('runFleetBench', () => {
  const report = runFleetBench({ trialsPerClass: 25, seed: 20260731 })

  it('covers every corruption class with the requested trials', () => {
    expect(Object.keys(report.classes).sort()).toEqual([...FLEET_CORRUPTIONS].sort())
    for (const cls of FLEET_CORRUPTIONS) expect(report.classes[cls].trials).toBe(25)
  })

  it('clean fully-deconflicted plans NEVER void (the false-VOID number is the product)', () => {
    expect(report.classes.clean.expected).toBe('VALID')
    expect(report.classes.clean.catchRate).toBe(1)
    expect(report.falseVoidRate).toBe(0)
  })

  it('every injected violation class is caught at 100%', () => {
    for (const cls of ['teleport', 'wall_drive', 'unsafe_drive', 'vertex_inject', 'swap_inject', 'start_mismatch'] as const) {
      expect(report.classes[cls].expected).toBe('VOID')
      expect(report.classes[cls].catchRate).toBe(1)
    }
  })

  it('reports the escape-hatch observation honestly: counts, no invented expectation', () => {
    expect(report.escapeHatch.plans).toBeGreaterThanOrEqual(0)
    expect(report.escapeHatch.verdicts.VALID ?? 0).toBeGreaterThanOrEqual(0)
    expect(report.escapeHatch.note).toMatch(/observational/i)
  })

  it('is deterministic and digest-bound', () => {
    const again = runFleetBench({ trialsPerClass: 25, seed: 20260731 })
    expect(again).toEqual(report)
    expect(report.digest).toMatch(/^[0-9a-f]{64}$/)
    expect(runFleetBench({ trialsPerClass: 25, seed: 9 }).digest).not.toBe(report.digest)
  })

  it('labels its scope: real planner outputs, synthetic floors, this verifier only', () => {
    expect(report.scope).toMatch(/synthetic/i)
    expect(report.verifier).toBe('fleetVerify@1')
  })
})
