import { describe, expect, it } from 'vitest'
import { planMultiAgent, type MultiAgentInput } from './multiAgent'

const base = (over: Partial<MultiAgentInput> = {}): MultiAgentInput => ({
  width: 6,
  height: 5,
  blocked: [],
  unsafe: [],
  robots: [{ x: 0, y: 0 }],
  items: [{ x: 2, y: 2 }],
  drops: [{ x: 5, y: 2 }],
  ...over,
})

/** Assert no two robots occupy the same cell, and none swap, at any tick. */
function assertCollisionFree(plan: ReturnType<typeof planMultiAgent>) {
  for (let t = 0; t < plan.ticks; t += 1) {
    const seen = new Map<string, number>()
    plan.robots.forEach((rp, ri) => {
      const p = rp.timeline[Math.min(t, rp.timeline.length - 1)]
      const k = `${p.x},${p.y}`
      expect(seen.has(k)).toBe(false) // vertex conflict
      seen.set(k, ri)
    })
    if (t + 1 < plan.ticks) {
      // edge/swap conflict: A→B while B→A between t and t+1
      for (let a = 0; a < plan.robots.length; a += 1) {
        for (let b = a + 1; b < plan.robots.length; b += 1) {
          const a0 = plan.robots[a].timeline[Math.min(t, plan.robots[a].timeline.length - 1)]
          const a1 = plan.robots[a].timeline[Math.min(t + 1, plan.robots[a].timeline.length - 1)]
          const b0 = plan.robots[b].timeline[Math.min(t, plan.robots[b].timeline.length - 1)]
          const b1 = plan.robots[b].timeline[Math.min(t + 1, plan.robots[b].timeline.length - 1)]
          const swap = a0.x === b1.x && a0.y === b1.y && a1.x === b0.x && a1.y === b0.y
          expect(swap).toBe(false)
        }
      }
    }
  }
}

describe('planMultiAgent', () => {
  it('is deterministic — same input yields identical timelines', () => {
    const a = planMultiAgent(base({ robots: [{ x: 0, y: 0 }, { x: 0, y: 4 }], items: [{ x: 2, y: 2 }, { x: 3, y: 1 }] }))
    const b = planMultiAgent(base({ robots: [{ x: 0, y: 0 }, { x: 0, y: 4 }], items: [{ x: 2, y: 2 }, { x: 3, y: 1 }] }))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('handles zero robots without throwing', () => {
    const plan = planMultiAgent(base({ robots: [] }))
    expect(plan.robots).toHaveLength(0)
    expect(plan.unassignedItems).toBe(1)
    expect(plan.fullyDeconflicted).toBe(true)
  })

  it('handles zero items (robots idle, none unassigned)', () => {
    const plan = planMultiAgent(base({ items: [] }))
    expect(plan.unassignedItems).toBe(0)
    expect(plan.robots[0].itemCount).toBe(0)
  })

  it('flags items in a fleet that has no robot as unassigned', () => {
    // Two fleets; fleet 1 has an item but no robot of fleet 1.
    const plan = planMultiAgent(
      base({
        robots: [{ x: 0, y: 0 }],
        items: [{ x: 2, y: 2 }, { x: 4, y: 4 }],
        drops: [{ x: 5, y: 2 }, { x: 5, y: 4 }],
        robotFleet: [0],
        itemFleet: [0, 1],
        dropFleet: [0, 1],
      }),
    )
    expect(plan.unassignedItems).toBeGreaterThan(0)
  })

  it('keeps fleets separate — a robot only serves its own fleet', () => {
    const plan = planMultiAgent(
      base({
        robots: [{ x: 0, y: 0 }, { x: 0, y: 4 }],
        items: [{ x: 2, y: 2 }, { x: 2, y: 4 }],
        drops: [{ x: 5, y: 0 }, { x: 5, y: 4 }],
        robotFleet: [0, 1],
        itemFleet: [0, 1],
        dropFleet: [0, 1],
      }),
    )
    expect(plan.robots[0].fleet).toBe(0)
    expect(plan.robots[1].fleet).toBe(1)
    expect(plan.unassignedItems).toBe(0)
  })

  it('produces a collision-free plan for several robots on an open floor', () => {
    const plan = planMultiAgent(
      base({
        width: 8,
        height: 6,
        robots: [{ x: 0, y: 0 }, { x: 0, y: 2 }, { x: 0, y: 4 }],
        items: [{ x: 4, y: 1 }, { x: 4, y: 3 }, { x: 5, y: 5 }],
        drops: [{ x: 7, y: 2 }],
      }),
    )
    assertCollisionFree(plan)
    expect(plan.fullyDeconflicted).toBe(true)
  })

  it('routes around blocked (wall + unsafe) cells', () => {
    const plan = planMultiAgent(
      base({
        blocked: [{ x: 1, y: 2 }],
        unsafe: [{ x: 2, y: 1 }],
      }),
    )
    // The robot never stands on a blocked or unsafe cell.
    for (const rp of plan.robots) {
      for (const p of rp.timeline) {
        expect(p.x === 1 && p.y === 2).toBe(false)
        expect(p.x === 2 && p.y === 1).toBe(false)
      }
    }
  })

  it('reports fullyDeconflicted=false when a robot needs the reservation-free fallback', () => {
    // 1-wide corridor: robot 0 parks on the only drop cell (0,0) forever; robot 1
    // must deliver there, so the reservation-aware path is impossible and the
    // deadlock escape hatch fires.
    const plan = planMultiAgent(
      base({
        width: 4,
        height: 1,
        robots: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
        items: [{ x: 3, y: 0 }],
        drops: [{ x: 0, y: 0 }],
      }),
    )
    expect(plan.fullyDeconflicted).toBe(false)
  })

  it('falls back gracefully (no throw) when an item is fully walled off', () => {
    const plan = planMultiAgent(
      base({
        items: [{ x: 3, y: 2 }],
        blocked: [
          { x: 2, y: 2 },
          { x: 4, y: 2 },
          { x: 3, y: 1 },
          { x: 3, y: 3 },
        ],
      }),
    )
    expect(plan.robots[0].reachable).toBe(false)
  })
})
