import { describe, expect, it } from 'vitest'
import { planResize, resizeSiteMap } from './siteMapResize'
import { cellNumber, pinCellNumbers, siteFleets, type DescriptiveSiteMap } from './workflowDraft'
import { starterUnderstanding } from './proving-ground/starterFloor'
import { deployedEmbodiments, fleetReadiness } from './proving-ground/fleetReadiness'
import { canonical, sha256 } from '@origin/evidence/env-evidence'

// A 12x12 map with explicit fleets whose cells sit in the far corner — they must
// be clipped when the grid shrinks, since `fleets` is authoritative.
const bigMap: DescriptiveSiteMap = {
  width: 12,
  height: 12,
  start: { x: 0, y: 6 },
  item: { x: 10, y: 10 },
  drop: { x: 11, y: 11 },
  obstacles: [{ x: 9, y: 9 }],
  hazards: [{ x: 8, y: 8 }],
  humanOnly: [{ x: 7, y: 11 }],
  robots: [],
  fleets: [
    {
      robots: [{ x: 11, y: 0 }, { x: 0, y: 11 }],
      items: [{ x: 10, y: 10 }, { x: 2, y: 2 }],
      drops: [{ x: 11, y: 11 }, { x: 3, y: 3 }],
    },
  ],
}

const inBounds = (p: { x: number; y: number }, w: number, h: number) =>
  p.x >= 0 && p.y >= 0 && p.x < w && p.y < h

/** A robot's effective type, resolved exactly as the oracle resolves it. */
function typeOf(map: DescriptiveSiteMap, x: number, y: number): string | undefined {
  const fleet = siteFleets(map).find((f) => f.robots.some((r) => r.x === x && r.y === y))
  return fleet ? map.robotTypes?.[`${x},${y}`] ?? fleet.embodiment ?? 'fallback' : undefined
}

describe('resizeSiteMap', () => {
  it('clips EVERY fleet layer (robots/items/drops) and every global layer to the new bounds', () => {
    const small = resizeSiteMap(bigMap, 5, 5)
    expect(small.width).toBe(5)
    expect(small.height).toBe(5)
    for (const f of siteFleets(small)) {
      for (const p of [...f.robots, ...f.items, ...f.drops]) expect(inBounds(p, 5, 5)).toBe(true)
    }
    for (const p of [...small.obstacles, ...small.hazards, ...small.humanOnly]) expect(inBounds(p, 5, 5)).toBe(true)
    // The scored lane follows the surviving item and drop; the start stays in bounds.
    expect(small.item).toEqual({ x: 2, y: 2 })
    expect(small.drop).toEqual({ x: 3, y: 3 })
    expect(inBounds(small.start, 5, 5)).toBe(true)
  })

  it('refuses a shrink that would remove every item or every drop, and never re-seeds one', () => {
    const plan = planResize(bigMap, 2, 2)
    expect(plan.width).toBe(4) // clamped to the supported range first
    const onlyFar: DescriptiveSiteMap = { ...bigMap, fleets: [{ robots: [], items: [{ x: 10, y: 10 }], drops: [{ x: 11, y: 11 }] }] }
    const refused = planResize(onlyFar, 5, 5)
    expect(refused.next).toBeNull()
    expect(refused.blocked).toEqual({ items: true, drops: true })
    expect(resizeSiteMap(onlyFar, 5, 5)).toBe(onlyFar) // the floor is returned untouched
  })

  it('clamps within the supported grid range', () => {
    expect(resizeSiteMap(bigMap, 99, 99).width).toBeLessThanOrEqual(12)
    expect(resizeSiteMap(bigMap, 1, 1).width).toBeGreaterThanOrEqual(4)
  })
})

// Regression for the 2026-10-24 re-audit (§3.1): shrinking the template from 12 to 11
// columns silently turned every fleet back into the workflow default type (the
// scored-type count fell from 3 to 1) and renumbered the surviving drops. Root cause:
// resizeSiteMap rebuilt each fleet as { robots, items, drops } and dropped `embodiment`,
// so every fleet fell back to the workflow type — on a grow as well as a shrink.
describe('resize never changes a surviving robot type or renumbers a surviving cell', () => {
  const template = starterUnderstanding().siteMap
  const pinned = pinCellNumbers(template)

  it('12 → 11: lists exactly the cells in column L, then keeps every type, number and fleet', () => {
    const plan = planResize(pinned, 11, 9)
    expect(plan.blocked).toBeNull()
    expect(plan.lost).toEqual([
      { kind: 'human', x: 11, y: 1, fleet: -1 },
      { kind: 'drop', x: 11, y: 4, fleet: 0 },
    ])
    // The scored lane's drop was in column L: the plan says where the lane goes next.
    expect(plan.lane).toEqual([{ part: 'drop', from: { x: 11, y: 4 }, to: { x: 8, y: 1 } }])
    const next = plan.next!

    // Surviving robots keep their type; fleets keep theirs; the scored types stay 3.
    for (const r of siteFleets(template).flatMap((f) => f.robots)) {
      expect(typeOf(next, r.x, r.y)).toBe(typeOf(template, r.x, r.y))
    }
    expect(siteFleets(next).map((f) => f.embodiment)).toEqual(['amr', 'humanoid', 'dog'])
    expect(deployedEmbodiments(next, 'amr')).toEqual(['amr', 'humanoid', 'dog'])

    // Surviving drops keep their identity: same cell, same fleet, same number.
    const dropsBefore = siteFleets(pinned).flatMap((f, fleet) => f.drops.map((p) => ({ ...p, fleet, n: cellNumber(pinned, 'drops', p.x, p.y) })))
    const dropsAfter = siteFleets(next).flatMap((f, fleet) => f.drops.map((p) => ({ ...p, fleet, n: cellNumber(next, 'drops', p.x, p.y) })))
    expect(dropsAfter).toEqual(dropsBefore.filter((d) => d.x < 11))
    expect(dropsAfter.map((d) => d.n)).toEqual([2, 3])
    // Every other surviving numbered cell keeps its number too.
    expect(cellNumber(next, 'humanOnly', 10, 1)).toBe(1)
    for (const [i, w] of template.obstacles.entries()) expect(cellNumber(next, 'obstacles', w.x, w.y)).toBe(i + 1)
    for (const [i, h] of template.hazards.entries()) expect(cellNumber(next, 'hazards', h.x, h.y)).toBe(i + 1)
  })

  it('a grow keeps every type and every number as well (the defect hit growing too)', () => {
    const grown = resizeSiteMap(pinned, 12, 10)
    expect(siteFleets(grown).map((f) => f.embodiment)).toEqual(['amr', 'humanoid', 'dog'])
    expect(deployedEmbodiments(grown, 'amr')).toEqual(['amr', 'humanoid', 'dog'])
    expect(grown.cellNumbers).toEqual(pinned.cellNumbers)
    expect(planResize(pinned, 12, 10).lost).toEqual([])
  })

  it('keeps painted per-robot types, and drops the type of a robot that left the floor', () => {
    const painted = { ...pinned, robotTypes: { '1,5': 'drone' as const, '11,0': 'arm' as const } }
    const next = resizeSiteMap(painted, 11, 9)
    expect(typeOf(next, 1, 5)).toBe('drone')
    expect(next.robotTypes).toEqual({ '1,5': 'drone' })
  })

  it('undo is exact: the plan never mutates the floor it was given', () => {
    const before = JSON.stringify(pinned)
    planResize(pinned, 11, 9)
    planResize(pinned, 4, 4)
    expect(JSON.stringify(pinned)).toBe(before)
  })

  it('pinning the numbers changes nothing the oracle scores or signs for the unchanged template', () => {
    const a = fleetReadiness(template, 'amr')
    const b = fleetReadiness(pinned, 'amr')
    expect(sha256(canonical(b.digestInput))).toBe(sha256(canonical(a.digestInput)))
    // And an untouched template is never pinned: the editor pins only before an edit.
    expect(template.cellNumbers).toBeUndefined()
  })
})
