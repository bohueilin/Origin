import { describe, it, expect } from 'vitest'
import { runShift, verifyOperations, fleetMetrics, DEFAULT_TARGETS } from '../src/simulation/opsMetrics'
import { buildWarehouseScene, simulate } from '../src/simulation/warehouseSim'

// The verified fleet-operations SLA (clean-room from the Worksite metrics concept). The
// properties: metrics are deterministic, collision events are measured from each wave's frames
// (any counted event fails the shift at tier L0), and the SLA credential is a real
// oracle-derived verdict — a passing shift really clears the targets, a failing one doesn't.

describe('fleet operations SLA', () => {
  it('is deterministic — same shift yields a byte-identical signed credential', () => {
    const a = verifyOperations(runShift(20260713, 5, 5))
    const b = verifyOperations(runShift(20260713, 5, 5))
    expect(JSON.stringify(a.digest_input)).toBe(JSON.stringify(b.digest_input))
  })

  it('shift totals add up the collision events counted in each wave', () => {
    for (const robots of [3, 4, 6]) {
      const s = runShift(42, 6, robots)
      expect(s.totals.collision_events).toBe(s.waves.reduce((n, w) => n + w.metrics.collision_events, 0))
      expect(s.totals.collision_events).toBeGreaterThan(0)
    }
  })

  it('collision events come from the run: one in the default /simulation run, none in the /operations default shift', () => {
    expect(fleetMetrics(simulate(buildWarehouseScene({ seed: 20260713, robots: 4 }))).collision_events).toBe(1)
    const s = runShift(777, 6, 4)
    expect(s.waves.map((w) => w.metrics.collision_events)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('a well-coordinated shift PASSES with a high RSL level', () => {
    const cred = verifyOperations(runShift(777, 6, 4), DEFAULT_TARGETS)
    expect(cred.passed).toBe(true)
    expect(['L3', 'L4']).toContain(cred.rsl_level)
    expect(cred.metrics.fulfilment_rate).toBeGreaterThanOrEqual(DEFAULT_TARGETS.min_fulfilment)
    expect(cred.metrics.avg_utilization).toBeGreaterThanOrEqual(DEFAULT_TARGETS.min_utilization)
  })

  it('an under-performing shift FAILS the SLA (collision events counted, so tier L0)', () => {
    const cred = verifyOperations(runShift(20260713, 6, 4), DEFAULT_TARGETS)
    expect(cred.passed).toBe(false)
    expect(['L0', 'L1', 'L2']).toContain(cred.rsl_level)
    expect(cred.metrics.collision_events).toBeGreaterThan(0) // counted events cap the shift
    expect(cred.rsl_level).toBe('L0')
  })

  it('a shift with no counted collision event that misses its fulfilment target fails at L2', () => {
    const cred = verifyOperations(runShift(2, 3, 2), DEFAULT_TARGETS)
    expect(cred.metrics.collision_events).toBe(0)
    expect(cred.metrics.fulfilment_rate).toBeLessThan(DEFAULT_TARGETS.min_fulfilment)
    expect(cred.passed).toBe(false)
    expect(cred.rsl_level).toBe('L2')
  })

  it('a passing shift states its counted collision events in its reason', () => {
    expect(verifyOperations(runShift(777, 6, 4)).reason).toMatch(/^Cleared every target — 0 collision events, /)
    const lenient = verifyOperations(runShift(777, 3, 5), { ...DEFAULT_TARGETS, max_collisions: 2 })
    expect([lenient.metrics.collision_events, lenient.passed]).toEqual([1, true])
    expect(lenient.reason).toMatch(/^Cleared every target — 1 collision event, /)
  })

  it('utilization is a fraction in [0,1] and peak <= fleet size', () => {
    const s = buildWarehouseScene({ seed: 1, robots: 4 })
    const m = fleetMetrics(simulate(s))
    expect(m.fleet_utilization).toBeGreaterThanOrEqual(0)
    expect(m.fleet_utilization).toBeLessThanOrEqual(1)
    expect(m.peak_simultaneous).toBeLessThanOrEqual(4)
  })
})
