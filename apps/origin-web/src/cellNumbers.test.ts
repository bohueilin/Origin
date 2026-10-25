import { describe, expect, it } from 'vitest'
import { cellNumber, normalizeFleets, pinCellNumbers, robotNumber, siteFleets } from './workflowDraft'
import { starterUnderstanding } from './proving-ground/starterFloor'
import { deployedEmbodiments } from './proving-ground/fleetReadiness'
import { floorTypes } from './proving-ground/floorCounts'

const template = starterUnderstanding().siteMap

describe('stable cell numbers', () => {
  it('pinning records exactly the numbers an untouched floor shows', () => {
    const pinned = pinCellNumbers(template)
    for (const [layer, cells] of [
      ['items', siteFleets(template).flatMap((f) => f.items)],
      ['drops', siteFleets(template).flatMap((f) => f.drops)],
      ['obstacles', template.obstacles],
      ['hazards', template.hazards],
      ['humanOnly', template.humanOnly],
    ] as const) {
      cells.forEach((p, i) => {
        expect(cellNumber(template, layer, p.x, p.y)).toBe(i + 1)
        expect(cellNumber(pinned, layer, p.x, p.y)).toBe(i + 1)
      })
    }
    expect(pinCellNumbers(pinned)).toBe(pinned) // idempotent: no churn on later edits
  })

  it('removing a cell leaves every other number alone; a new cell takes the next number', () => {
    const pinned = pinCellNumbers(template)
    const fleets = siteFleets(pinned)
    // Remove Fleet 1's drop (D1) and add a drop to Fleet 3.
    fleets[0] = { ...fleets[0], drops: [] }
    fleets[2] = { ...fleets[2], drops: [...fleets[2].drops, { x: 4, y: 8 }] }
    const next = normalizeFleets(pinned, fleets)
    expect(cellNumber(next, 'drops', 8, 1)).toBe(2)
    expect(cellNumber(next, 'drops', 8, 7)).toBe(3)
    expect(cellNumber(next, 'drops', 4, 8)).toBe(4)
    expect(next.cellNumbers?.drops?.['11,4']).toBeUndefined()
    // Walls behave the same way: drop W3, keep W4..W8, a new wall is W9.
    const walls = normalizeFleets({ ...next, obstacles: [...next.obstacles.filter((_, i) => i !== 2), { x: 0, y: 0 }] }, siteFleets(next))
    expect(cellNumber(walls, 'obstacles', template.obstacles[3].x, template.obstacles[3].y)).toBe(4)
    expect(cellNumber(walls, 'obstacles', 0, 0)).toBe(9)
  })

  it('robots keep their number within their fleet; a new robot takes the lowest free number', () => {
    const pinned = pinCellNumbers(template)
    // Untouched numbering: AM1 at B4, AM2 at B6, HU1, DG1.
    expect([robotNumber(template, 1, 3), robotNumber(template, 1, 5), robotNumber(template, 2, 1), robotNumber(template, 2, 7)]).toEqual([1, 2, 1, 1])
    expect(pinned.cellNumbers?.robots).toEqual({ '1,3': 1, '1,5': 2, '2,1': 1, '2,7': 1 })
    // Add AM3 at L3, then remove AM1: AM2 and AM3 keep their numbers.
    const withThird = siteFleets(pinned)
    withThird[0] = { ...withThird[0], robots: [...withThird[0].robots, { x: 11, y: 2 }] }
    const three = normalizeFleets(pinned, withThird)
    expect(robotNumber(three, 11, 2)).toBe(3)
    const fewer = siteFleets(three)
    fewer[0] = { ...fewer[0], robots: fewer[0].robots.filter((r) => !(r.x === 1 && r.y === 3)) }
    const gap = normalizeFleets(three, fewer)
    expect([robotNumber(gap, 1, 5), robotNumber(gap, 11, 2)]).toEqual([2, 3])
    // The next robot in Fleet 1 fills the gap (1); Fleet 2's next robot is its 2.
    const refill = siteFleets(gap)
    refill[0] = { ...refill[0], robots: [...refill[0].robots, { x: 0, y: 0 }] }
    refill[1] = { ...refill[1], robots: [...refill[1].robots, { x: 0, y: 8 }] }
    const filled = normalizeFleets(gap, refill)
    expect([robotNumber(filled, 0, 0), robotNumber(filled, 0, 8), robotNumber(filled, 1, 5), robotNumber(filled, 11, 2)]).toEqual([1, 2, 2, 3])
  })

  it('an untouched floor stays unpinned through normalizeFleets (its object, digest and hash do not change)', () => {
    expect(normalizeFleets(template, siteFleets(template)).cellNumbers).toBeUndefined()
  })
})

describe('floorTypes: one type list for the fleet cards, the type panel and the result', () => {
  it('lists the oracle’s scored types, in episode order, with per-fleet counts', () => {
    const types = floorTypes(template, 'amr')
    expect(types.map((t) => t.embodiment)).toEqual(deployedEmbodiments(template, 'amr'))
    expect(types.map((t) => [t.embodiment, t.robots, t.byFleet])).toEqual([
      ['amr', 2, [{ fleet: 0, robots: 2 }]],
      ['humanoid', 1, [{ fleet: 1, robots: 1 }]],
      ['dog', 1, [{ fleet: 2, robots: 1 }]],
    ])
  })

  it('a mixed fleet shows every type it has; an empty fleet is still scored as its fleet type', () => {
    const fleets = siteFleets(template)
    fleets[2] = { ...fleets[2], robots: [] } // Fleet 3 (dog) loses its robot
    const mixed = normalizeFleets({ ...template, robotTypes: { '1,5': 'humanoid' } }, fleets)
    const types = floorTypes(mixed, 'amr')
    expect(types.map((t) => t.embodiment)).toEqual(deployedEmbodiments(mixed, 'amr'))
    expect(types.find((t) => t.embodiment === 'humanoid')?.byFleet).toEqual([{ fleet: 0, robots: 1 }, { fleet: 1, robots: 1 }])
    expect(types.find((t) => t.embodiment === 'amr')?.byFleet).toEqual([{ fleet: 0, robots: 1 }])
    expect(types.find((t) => t.embodiment === 'dog')).toMatchObject({ robots: 0, emptyFleets: [2] })
  })
})
