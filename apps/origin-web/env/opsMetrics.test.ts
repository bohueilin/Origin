import { describe, it, expect } from 'vitest'
import { runShift, verifyOperations, fleetMetrics, DEFAULT_TARGETS } from '../src/simulation/opsMetrics'
import { buildWarehouseScene, simulate } from '../src/simulation/warehouseSim'

// The verified fleet-operations SLA (clean-room from the Worksite metrics concept). The
// invariants: metrics are deterministic, collisions are always 0, and the SLA credential is a
// real oracle-derived verdict — a passing shift really clears the targets, a failing one doesn't.

describe('fleet operations SLA', () => {
  it('is deterministic — same shift yields a byte-identical signed credential', () => {
    const a = verifyOperations(runShift(20260713, 5, 5))
    const b = verifyOperations(runShift(20260713, 5, 5))
    expect(JSON.stringify(a.digest_input)).toBe(JSON.stringify(b.digest_input))
  })

  it('always reports zero collisions (the safety invariant)', () => {
    for (const robots of [3, 4, 6]) {
      const s = runShift(42, 6, robots)
      expect(s.totals.collision_events).toBe(0)
    }
  })

  it('a well-coordinated shift PASSES with a high RSL level', () => {
    const cred = verifyOperations(runShift(777, 6, 4), DEFAULT_TARGETS)
    expect(cred.passed).toBe(true)
    expect(['L3', 'L4']).toContain(cred.rsl_level)
    expect(cred.metrics.fulfilment_rate).toBeGreaterThanOrEqual(DEFAULT_TARGETS.min_fulfilment)
    expect(cred.metrics.avg_utilization).toBeGreaterThanOrEqual(DEFAULT_TARGETS.min_utilization)
  })

  it('an under-performing shift FAILS the SLA (safe but below target)', () => {
    const cred = verifyOperations(runShift(20260713, 6, 4), DEFAULT_TARGETS)
    expect(cred.passed).toBe(false)
    expect(['L0', 'L1', 'L2']).toContain(cred.rsl_level)
    expect(cred.metrics.collision_events).toBe(0) // still safe — it just didn't hit the ops bar
  })

  it('utilization is a fraction in [0,1] and peak <= fleet size', () => {
    const s = buildWarehouseScene({ seed: 1, robots: 4 })
    const m = fleetMetrics(simulate(s))
    expect(m.fleet_utilization).toBeGreaterThanOrEqual(0)
    expect(m.fleet_utilization).toBeLessThanOrEqual(1)
    expect(m.peak_simultaneous).toBeLessThanOrEqual(4)
  })
})
