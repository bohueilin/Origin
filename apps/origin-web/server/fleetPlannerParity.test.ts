// Planner ↔ verifier parity — written RED against a live planner bug.
//
// The independent fleet verifier rejected 18% (22/119) of schedules the MAPD
// planner certified with fullyDeconflicted:true — all vertex conflicts. Root
// causes in src/multiAgent.ts: (1) a robot planned early can drive through the
// START cell of a robot planned later, which is still standing there; (2) the
// parked-tail reservation extends only `horizon+4` ticks past a robot's own
// timeline, which a longer later timeline can outrun. And the flag never
// re-checked its own claim.
//
// The contract this test pins forever: WHEN THE PLANNER SAYS fullyDeconflicted,
// THE INDEPENDENT VERIFIER AGREES. (Escape-hatch plans may still conflict; the
// planner must say so via the flag — that is the honest lane.)

import { describe, expect, it } from 'vitest'
import { planMultiAgent } from '../src/multiAgent'
import { verifyFleetSchedule } from './fleetVerify'

function mulberry(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('planMultiAgent ↔ verifyFleetSchedule parity', () => {
  it('a robot start on a wall or unsafe cell is never certified fullyDeconflicted (review reproduction)', () => {
    const onWall = planMultiAgent({
      width: 6, height: 4,
      blocked: [{ x: 0, y: 0 }], unsafe: [],
      robots: [{ x: 0, y: 0 }, { x: 5, y: 3 }],
      items: [{ x: 3, y: 1 }], drops: [{ x: 5, y: 0 }],
    })
    expect(onWall.fullyDeconflicted).toBe(false)
    const onUnsafe = planMultiAgent({
      width: 6, height: 4,
      blocked: [], unsafe: [{ x: 0, y: 0 }],
      robots: [{ x: 0, y: 0 }, { x: 5, y: 3 }],
      items: [{ x: 3, y: 1 }], drops: [{ x: 5, y: 0 }],
    })
    expect(onUnsafe.fullyDeconflicted).toBe(false)
  })

  it('every fullyDeconflicted plan across 120 seeded scenarios passes independent verification', () => {
    let checked = 0
    const failures: string[] = []
    for (let seed = 1; seed <= 120; seed += 1) {
      const rnd = mulberry(seed * 2246822519 + 3)
      const ri = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1))
      const width = ri(7, 12)
      const height = ri(6, 10)
      const taken = new Set<string>()
      const fresh = (): { x: number; y: number } => {
        for (;;) {
          const c = { x: ri(0, width - 1), y: ri(0, height - 1) }
          const k = `${c.x},${c.y}`
          if (!taken.has(k)) {
            taken.add(k)
            return c
          }
        }
      }
      const robots = Array.from({ length: ri(2, 4) }, fresh)
      const items = Array.from({ length: ri(2, 4) }, fresh)
      const drops = [fresh()]
      const blocked = Array.from({ length: ri(0, Math.floor(width * height * 0.08)) }, fresh)
      const unsafe = Array.from({ length: ri(0, 2) }, fresh)
      const plan = planMultiAgent({ width, height, blocked, unsafe, robots, items, drops })
      if (!plan.fullyDeconflicted) continue
      checked += 1
      const res = verifyFleetSchedule({
        width,
        height,
        blocked,
        unsafe,
        robots: plan.robots.map((r) => ({ start: r.start, timeline: r.timeline })),
      })
      if (res.verdict !== 'VALID') {
        failures.push(`seed ${seed}: ${res.checks.filter((c) => !c.pass).map((c) => `${c.name} (${c.detail.slice(0, 80)})`).join('; ')}`)
      }
    }
    expect(checked).toBeGreaterThan(50) // the property must actually be exercised
    expect(failures, failures.slice(0, 5).join('\n')).toEqual([])
  })
})
