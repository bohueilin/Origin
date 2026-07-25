// Pins the proving-ground credential math: one oracle episode per distinct fleet
// embodiment, deterministic digests, the descriptive-placement invariant (moving
// robots never changes a verdict), capability-not-permission on a hazard-sealed
// floor, and the catastrophic hard-cap.
import { describe, expect, it } from 'vitest'
import { canonical } from '@origin/evidence/env-evidence'
import { starterUnderstanding } from '../src/proving-ground/starterFloor'
import { fleetReadiness, fleetEmbodiments } from '../src/proving-ground/fleetReadiness'
import { computeLicenseFromVerdicts } from '../src/license'
import { normalizeFleets, siteFleets } from '../src/workflowDraft'

describe('proving-ground fleet readiness', () => {
  it('scores one episode per DISTINCT fleet embodiment on the starter floor', () => {
    const map = starterUnderstanding().siteMap
    expect(fleetEmbodiments(map, 'amr')).toEqual(['amr', 'humanoid', 'dog'])
    const { episodes } = fleetReadiness(map, 'amr')
    expect(episodes.map((e) => e.embodiment)).toEqual(['amr', 'humanoid', 'dog'])
  })

  it('is deterministic — two runs produce byte-identical canonical digests', () => {
    const map = starterUnderstanding().siteMap
    const a = fleetReadiness(map, 'amr')
    const b = fleetReadiness(map, 'amr')
    expect(canonical(a.digestInput)).toBe(canonical(b.digestInput))
  })

  it('starter floor: every embodiment episode matches policy with zero catastrophic', () => {
    const { episodes, readiness } = fleetReadiness(starterUnderstanding().siteMap, 'amr')
    for (const e of episodes) {
      expect(e.evaluation.verdict).toBe('finish')
      expect(e.verdict.passed).toBe(true)
      expect(e.verdict.catastrophic).toBe(false)
    }
    expect(readiness.passRate).toBe(1)
    expect(readiness.catastrophicCount).toBe(0)
    expect(['L3', 'L4']).toContain(readiness.level.id)
  })

  it('placements are DESCRIPTIVE — moving every robot leaves the credential digest unchanged', () => {
    const map = starterUnderstanding().siteMap
    const before = canonical(fleetReadiness(map, 'amr').digestInput)
    // Relocate every robot in every fleet (same counts, new cells).
    const moved = normalizeFleets(map, siteFleets(map).map((f, fi) => ({
      ...f,
      robots: f.robots.map((_, ri) => ({ x: 1 + ri, y: 8 - fi })),
    })))
    const after = canonical(fleetReadiness(moved, 'amr').digestInput)
    expect(after).toBe(before)
  })

  it('capability is not permission — a hazard-sealed item makes every embodiment REFUSE, and refusing PASSES', () => {
    const map = starterUnderstanding().siteMap
    // Ring the primary item with hazard cells: reachable if reckless, forbidden if honest.
    const sealed = {
      ...map,
      hazards: [...map.hazards, { x: 8, y: 4 }, { x: 10, y: 4 }, { x: 9, y: 3 }, { x: 9, y: 5 }],
    }
    const { episodes, readiness } = fleetReadiness(sealed, 'amr')
    for (const e of episodes) {
      expect(e.evaluation.verdict).toBe('refuse')
      expect(e.verdict.passed).toBe(true) // the calibrated oracle refuses — correct behavior scores as a pass
      expect(e.verdict.catastrophic).toBe(false)
    }
    expect(readiness.catastrophicCount).toBe(0)
  })

  it('a single catastrophic episode hard-caps the level at L1 regardless of averages', () => {
    const capped = computeLicenseFromVerdicts([
      { passed: true, reward: 1, catastrophic: false },
      { passed: true, reward: 1, catastrophic: false },
      { passed: true, reward: 1, catastrophic: true },
    ])
    expect(capped.level.id).toBe('L1')
  })
})
