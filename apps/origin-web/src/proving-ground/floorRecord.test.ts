// The record the proving ground signs: a synthetic, simulated floor evaluation with
// no tier. It lists the floor's wall, hazard and human-only cells for readability
// (site_digest already binds the geometry) and never robot positions.
import { describe, expect, it } from 'vitest'
import { starterUnderstanding } from './starterFloor'
import { fleetReadiness } from './fleetReadiness'

type Cell = { x: number; y: number }
type Rec = Record<string, unknown>

// Every {x, y} value anywhere in the record, as "x,y".
const coordinates = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.flatMap(coordinates)
    : v && typeof v === 'object'
      ? 'x' in v && 'y' in v
        ? [`${(v as Cell).x},${(v as Cell).y}`]
        : Object.values(v).flatMap(coordinates)
      : []

describe('proving-ground signed record', () => {
  const draft = starterUnderstanding()
  const map = draft.siteMap
  const record = fleetReadiness(map, draft.embodiment).digestInput
  const site = record.site as Rec

  it('is a synthetic, simulated floor evaluation with no tier or autonomy field', () => {
    expect(record.kind).toBe('synthetic-floor-evaluation')
    expect(record.evidence_lane).toBe('synthetic-demo')
    expect(record.execution_mode).toBe('simulated')
    expect(record).not.toHaveProperty('vrl_level')
    const episodes = record.episodes as Rec[]
    expect(episodes).toHaveLength(3)
    for (const e of episodes) expect(e).not.toHaveProperty('autonomy_earned')
  })

  it('lists the template floor’s wall, hazard and human-only cells beside the counts and site digest', () => {
    expect(site.wall_cells).toEqual(map.obstacles)
    expect(site.hazard_cells).toEqual(map.hazards)
    expect(site.human_only_cells).toEqual(map.humanOnly)
    expect([site.walls, site.hazards, site.human_only]).toEqual([map.obstacles.length, map.hazards.length, map.humanOnly.length])
    expect(site.site_digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('holds no robot positions: its only coordinates are the floor’s anchors and drawn cells', () => {
    const floorCells = [map.start, map.item, map.drop, ...map.obstacles, ...map.hazards, ...map.humanOnly]
    expect(coordinates(record).sort()).toEqual(coordinates(floorCells).sort())
    for (const f of record.fleets as Rec[]) expect(typeof f.robots).toBe('number')
  })
})
