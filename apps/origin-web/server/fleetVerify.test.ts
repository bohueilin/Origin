// fleetVerify — behavioral spec, written BEFORE the implementation (TDD).
//
// The MAPD planner (src/multiAgent.ts) PROPOSES robot timelines — and honestly
// admits an escape hatch (fullyDeconflicted:false) where legs bypass the
// reservation table. Nothing independently checked a schedule until now. This
// verifier is the deterministic judge: bounds, walls, kinematics (no
// teleports), vertex conflicts, head-on swaps, start integrity — model
// proposes, environment verifies, for FLEETS.

import { describe, expect, it } from 'vitest'
import { verifyFleetSchedule, type FleetScheduleInput } from './fleetVerify'
import { planMultiAgent } from '../src/multiAgent'

const openFloor = (robots: { start: { x: number; y: number }; timeline: { x: number; y: number }[] }[]): FleetScheduleInput => ({
  width: 8,
  height: 6,
  blocked: [{ x: 3, y: 3 }],
  unsafe: [{ x: 5, y: 1 }],
  robots,
})

const failed = (r: ReturnType<typeof verifyFleetSchedule>): string[] => r.checks.filter((c) => !c.pass).map((c) => c.name)

describe('verifyFleetSchedule — accepts what is actually conflict-free', () => {
  it('two robots on disjoint routes verify VALID', () => {
    const r = verifyFleetSchedule(
      openFloor([
        { start: { x: 0, y: 0 }, timeline: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] },
        { start: { x: 0, y: 5 }, timeline: [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 1, y: 4 }] },
      ]),
    )
    expect(r.verdict).toBe('VALID')
    expect(failed(r)).toEqual([])
    expect(r.receipt.receipt_digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('a real planMultiAgent plan verifies VALID when the planner reports fullyDeconflicted', () => {
    const plan = planMultiAgent({
      width: 9,
      height: 7,
      blocked: [{ x: 4, y: 2 }, { x: 4, y: 3 }],
      unsafe: [{ x: 2, y: 5 }],
      robots: [{ x: 0, y: 0 }, { x: 8, y: 6 }],
      items: [{ x: 6, y: 1 }, { x: 1, y: 4 }],
      drops: [{ x: 8, y: 0 }],
    })
    if (!plan.fullyDeconflicted) return // planner used its escape hatch — nothing to assert
    const input: FleetScheduleInput = {
      width: 9,
      height: 7,
      blocked: [{ x: 4, y: 2 }, { x: 4, y: 3 }],
      unsafe: [{ x: 2, y: 5 }],
      robots: plan.robots.map((r) => ({ start: r.start, timeline: r.timeline })),
    }
    expect(verifyFleetSchedule(input).verdict).toBe('VALID')
  })

  it('unequal timeline lengths are handled: a finished robot PARKS and still occupies its cell', () => {
    // Robot A parks at (2,0) after tick 1; robot B arrives at (2,0) at tick 3 → vertex conflict.
    const r = verifyFleetSchedule(
      openFloor([
        { start: { x: 1, y: 0 }, timeline: [{ x: 1, y: 0 }, { x: 2, y: 0 }] },
        { start: { x: 5, y: 0 }, timeline: [{ x: 5, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 0 }, { x: 2, y: 0 }] },
      ]),
    )
    expect(r.verdict).toBe('VOID')
    expect(failed(r)).toContain('vertex_conflicts')
  })
})

describe('verifyFleetSchedule — catches every injected violation by name', () => {
  it('teleport (non-adjacent step)', () => {
    const r = verifyFleetSchedule(openFloor([{ start: { x: 0, y: 0 }, timeline: [{ x: 0, y: 0 }, { x: 2, y: 0 }] }]))
    expect(r.verdict).toBe('VOID')
    expect(failed(r)).toContain('kinematics')
  })

  it('diagonal step', () => {
    const r = verifyFleetSchedule(openFloor([{ start: { x: 0, y: 0 }, timeline: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }]))
    expect(failed(r)).toContain('kinematics')
  })

  it('driving onto a wall, an unsafe cell, or out of bounds', () => {
    expect(failed(verifyFleetSchedule(openFloor([{ start: { x: 3, y: 2 }, timeline: [{ x: 3, y: 2 }, { x: 3, y: 3 }] }])))).toContain('bounds_and_walls')
    expect(failed(verifyFleetSchedule(openFloor([{ start: { x: 5, y: 0 }, timeline: [{ x: 5, y: 0 }, { x: 5, y: 1 }] }])))).toContain('bounds_and_walls')
    expect(failed(verifyFleetSchedule(openFloor([{ start: { x: 0, y: 0 }, timeline: [{ x: 0, y: 0 }, { x: -1, y: 0 }] }])))).toContain('bounds_and_walls')
  })

  it('two robots in one cell at one tick (vertex conflict)', () => {
    const r = verifyFleetSchedule(
      openFloor([
        { start: { x: 0, y: 0 }, timeline: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
        { start: { x: 2, y: 0 }, timeline: [{ x: 2, y: 0 }, { x: 1, y: 0 }] },
      ]),
    )
    expect(r.verdict).toBe('VOID')
    expect(failed(r)).toContain('vertex_conflicts')
    expect(r.conflicts).toBeGreaterThan(0)
  })

  it('head-on swap (edge conflict) — the classic MAPF corruption vertex checks miss', () => {
    const r = verifyFleetSchedule(
      openFloor([
        { start: { x: 0, y: 0 }, timeline: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
        { start: { x: 1, y: 0 }, timeline: [{ x: 1, y: 0 }, { x: 0, y: 0 }] },
      ]),
    )
    expect(r.verdict).toBe('VOID')
    expect(failed(r)).toContain('swap_conflicts')
  })

  it('timeline that does not begin at the declared start', () => {
    const r = verifyFleetSchedule(openFloor([{ start: { x: 0, y: 0 }, timeline: [{ x: 1, y: 0 }, { x: 2, y: 0 }] }]))
    expect(failed(r)).toContain('timeline_shape')
  })

  it('empty fleet or empty timeline is a shape failure, not a crash', () => {
    expect(verifyFleetSchedule(openFloor([])).verdict).toBe('VOID')
    expect(failed(verifyFleetSchedule(openFloor([{ start: { x: 0, y: 0 }, timeline: [] }])))).toContain('timeline_shape')
  })
})

describe('verifyFleetSchedule — the integer lattice is the model (adversarial-review criticals)', () => {
  it('NaN coordinates cannot tunnel: every comparison fails open, so they must be rejected up front', () => {
    // 4x4, solid wall column at x=1; (0,0) → (NaN,NaN) → (3,0) previously verified VALID.
    const r = verifyFleetSchedule({
      width: 4, height: 4,
      blocked: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }],
      unsafe: [],
      robots: [{ start: { x: 0, y: 0 }, timeline: [{ x: 0, y: 0 }, { x: NaN, y: NaN }, { x: 3, y: 0 }] }],
    })
    expect(r.verdict).toBe('VOID')
    expect(failed(r)).toContain('timeline_shape')
  })

  it('fractional coordinates cannot walk through a wall between lattice cells', () => {
    const r = verifyFleetSchedule({
      width: 4, height: 2,
      blocked: [{ x: 1, y: 0 }, { x: 1, y: 1 }],
      unsafe: [],
      robots: [{ start: { x: 0, y: 0 }, timeline: [{ x: 0, y: 0 }, { x: 0.9, y: 0 }, { x: 1.1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] }],
    })
    expect(r.verdict).toBe('VOID')
    expect(failed(r)).toContain('timeline_shape')
  })

  it('never throws on malformed input — malformed is VOID, not a crash', () => {
    const cases: unknown[] = [
      { width: 4, height: 4, blocked: [], unsafe: [], robots: [{ start: null, timeline: [{ x: 0, y: 0 }] }] },
      { width: 4, height: 4, blocked: [], unsafe: [], robots: [{ start: { x: 0, y: 0 }, timeline: [null, { x: 1, y: 0 }] }] },
      { width: 4, height: 4, blocked: 'walls', unsafe: [], robots: [] },
      { width: NaN, height: 4, blocked: [], unsafe: [], robots: [{ start: { x: 0, y: 0 }, timeline: [{ x: 0, y: 0 }] }] },
      null,
    ]
    for (const c of cases) {
      const r = verifyFleetSchedule(c as never)
      expect(r.verdict).toBe('VOID')
    }
  })
})

describe('verifyFleetSchedule — determinism', () => {
  it('same input → identical result and digest', () => {
    const input = openFloor([{ start: { x: 0, y: 0 }, timeline: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }])
    const a = verifyFleetSchedule(input)
    const b = verifyFleetSchedule(input)
    expect(a).toEqual(b)
  })
})
