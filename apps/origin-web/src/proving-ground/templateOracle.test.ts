// Regression gate for the proving-ground template: presentation changes to the
// floor editor must never move the oracle. The template floor, its fleet
// composition and the fleet-readiness digest for the unchanged template are
// pinned here, so a design pass that touches scoring fails loudly.
import { describe, expect, it } from 'vitest'
import { canonical, sha256 } from '@origin/evidence/env-evidence'
import { siteFleets } from '../workflowDraft'
import { starterUnderstanding } from './starterFloor'
import { deployedEmbodiments, fleetReadiness } from './fleetReadiness'
import { floorCounts } from './floorCounts'

// Captured on main at f0d0e55, before the 2026-10-24 P0 editor redesign.
const TEMPLATE_DIGEST = '4b1482e306c268dcb6252cc7543cf22d2de13db1c498b530e76166c003c20857'

describe('proving-ground template floor', () => {
  const draft = starterUnderstanding()
  const map = draft.siteMap

  it('keeps the 12 × 9 floor, its 23 occupied cells and its three fleets', () => {
    expect([map.width, map.height]).toEqual([12, 9])
    const fleets = siteFleets(map)
    expect(fleets.map((f) => [f.embodiment, f.robots.length, f.items.length, f.drops.length])).toEqual([
      ['amr', 2, 1, 1],
      ['humanoid', 1, 1, 1],
      ['dog', 1, 1, 1],
    ])
    const placed = fleets.reduce((n, f) => n + f.robots.length + f.items.length + f.drops.length, 0)
    expect(placed + map.obstacles.length + map.hazards.length + map.humanOnly.length).toBe(23)
  })

  it('scores one episode per deployed robot type with an unchanged digest', () => {
    expect(deployedEmbodiments(map, draft.embodiment)).toEqual(['amr', 'humanoid', 'dog'])
    const { episodes, digestInput } = fleetReadiness(map, draft.embodiment)
    expect(episodes.map((e) => [e.embodiment, e.evaluation.verdict])).toEqual([
      ['amr', 'finish'],
      ['humanoid', 'finish'],
      ['dog', 'finish'],
    ])
    expect(sha256(canonical(digestInput))).toBe(TEMPLATE_DIGEST)
  })

  it('states one floor total whose robot-type count is the number of scored episodes', () => {
    const totals = floorCounts(map, draft.embodiment)
    expect(totals).toEqual({ robots: 4, fleets: 3, items: 3, robotTypes: 3 })
    expect(totals.robotTypes).toBe(fleetReadiness(map, draft.embodiment).episodes.length)
  })
})
