import { describe, expect, it } from 'vitest'
import { resizeSiteMap } from './siteMapResize'
import { siteFleets, type DescriptiveSiteMap } from './workflowDraft'

// A 12x12 map with explicit fleets whose cells sit in the far corner — they must
// be clamped/dropped when the grid shrinks, since `fleets` is authoritative.
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
      items: [{ x: 10, y: 10 }, { x: 9, y: 11 }],
      drops: [{ x: 11, y: 11 }, { x: 11, y: 8 }],
    },
  ],
}

const inBounds = (p: { x: number; y: number }, w: number, h: number) =>
  p.x >= 0 && p.y >= 0 && p.x < w && p.y < h

describe('resizeSiteMap', () => {
  it('clamps EVERY fleet layer (robots/items/drops) to the new bounds', () => {
    const small = resizeSiteMap(bigMap, 5, 5)
    expect(small.width).toBe(5)
    expect(small.height).toBe(5)
    for (const f of siteFleets(small)) {
      for (const p of [...f.robots, ...f.items, ...f.drops]) {
        expect(inBounds(p, 5, 5)).toBe(true)
      }
    }
    // global layers too
    for (const p of [...small.obstacles, ...small.hazards, ...small.humanOnly]) {
      expect(inBounds(p, 5, 5)).toBe(true)
    }
  })

  it('always preserves at least one item and one drop (the oracle anchors)', () => {
    const small = resizeSiteMap(bigMap, 4, 4)
    const fleets = siteFleets(small)
    expect(fleets.flatMap((f) => f.items).length).toBeGreaterThanOrEqual(1)
    expect(fleets.flatMap((f) => f.drops).length).toBeGreaterThanOrEqual(1)
    expect(inBounds(small.item, 4, 4)).toBe(true)
    expect(inBounds(small.drop, 4, 4)).toBe(true)
    expect(inBounds(small.start, 4, 4)).toBe(true)
  })

  it('clamps within the supported grid range', () => {
    expect(resizeSiteMap(bigMap, 99, 99).width).toBeLessThanOrEqual(12)
    expect(resizeSiteMap(bigMap, 1, 1).width).toBeGreaterThanOrEqual(4)
  })
})
