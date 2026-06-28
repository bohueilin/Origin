import { describe, it, expect } from 'vitest'
import { floorToSiteMap } from './workflowDraft'
import { evaluateDrawnSite } from './siteEval'
import type { GridPos } from './warehouse'
import type { FloorLayoutSpec } from './captureManifest'

// Real layouts taken from public/factoryceo/library.json templates.
const CROSS_DOCK: FloorLayoutSpec = { docks: 6, aisles: 8, staging_lanes: 4, robots: 3, no_go_zones: 2 }
const PICK_PACK: FloorLayoutSpec = { docks: 4, aisles: 12, staging_lanes: 5, robots: 4, no_go_zones: 1 }
const TINY: FloorLayoutSpec = { docks: 1, aisles: 0, staging_lanes: 1, robots: 1, no_go_zones: 0 }

function allCells(m: ReturnType<typeof floorToSiteMap>): GridPos[] {
  return [
    m.start, m.item, m.drop,
    ...(m.items ?? []), ...(m.drops ?? []), ...m.robots,
    ...m.obstacles, ...m.hazards, ...m.humanOnly,
  ]
}

describe('floorToSiteMap — templates rebuild the floor', () => {
  it('scales the grid to the template (not the 6x5 default)', () => {
    const m = floorToSiteMap(CROSS_DOCK)
    expect(m.width).toBeGreaterThan(6)
    expect(m.height).toBeGreaterThan(5)
  })

  it('keeps every cell in-bounds', () => {
    for (const layout of [CROSS_DOCK, PICK_PACK, TINY]) {
      const m = floorToSiteMap(layout)
      for (const c of allCells(m)) {
        expect(c.x).toBeGreaterThanOrEqual(0)
        expect(c.y).toBeGreaterThanOrEqual(0)
        expect(c.x).toBeLessThan(m.width)
        expect(c.y).toBeLessThan(m.height)
      }
    }
  })

  it('never places two things on the same cell', () => {
    for (const layout of [CROSS_DOCK, PICK_PACK, TINY]) {
      const cells = allCells(floorToSiteMap(layout)).map((c) => `${c.x},${c.y}`)
      expect(new Set(cells).size).toBe(cells.length)
    }
  })

  it('keeps row 0 a clear highway (no walls/hazards) so the floor is always solvable', () => {
    for (const layout of [CROSS_DOCK, PICK_PACK, TINY]) {
      const m = floorToSiteMap(layout)
      const blockers = [...m.obstacles, ...m.hazards, ...m.humanOnly]
      expect(blockers.some((c) => c.y === 0)).toBe(false)
      // the deterministic oracle finds a finish path on the rebuilt floor
      expect(evaluateDrawnSite(m, 'humanoid').verdict).toBe('finish')
    }
  })

  it('reflects the template counts (robots, docks → drops)', () => {
    const m = floorToSiteMap(CROSS_DOCK)
    expect(m.robots.length).toBe(3)
    // primary drop + extra drops = docks
    expect(1 + (m.drops?.length ?? 0)).toBe(6)
  })

  it('is deterministic (same layout → identical floor)', () => {
    expect(floorToSiteMap(PICK_PACK)).toEqual(floorToSiteMap(PICK_PACK))
  })
})
