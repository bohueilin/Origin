import { describe, it, expect } from 'vitest'
import { createCaptureManifest } from './captureManifest'
import { proposeUnderstanding } from './workflowDraft'
import { evaluateDrawnSite } from './siteEval'
import type { RobotEmbodiment } from './environmentPlan'

const base = {
  outcome: 'Move totes to packing',
  domain: 'warehouse' as const,
  expectedEmbodiment: 'humanoid' as RobotEmbodiment,
  description: '',
  safetyRules: [],
  items: [],
}

describe('mixed robot types from capture', () => {
  it('seeds one robot per expected type, each typed', () => {
    const m = createCaptureManifest({ ...base, expectedEmbodiments: ['humanoid', 'dog', 'drone'] })
    const u = proposeUnderstanding(m)
    expect(u.siteMap.robots.length).toBeGreaterThanOrEqual(3)
    const types = Object.values(u.siteMap.robotTypes ?? {})
    expect(new Set(types)).toEqual(new Set(['humanoid', 'dog', 'drone']))
    // the floor stays solvable for the oracle
    expect(evaluateDrawnSite(u.siteMap, 'humanoid').verdict).toBe('finish')
  })

  it('a single expected type leaves no per-robot overrides', () => {
    const m = createCaptureManifest({ ...base, expectedEmbodiments: ['humanoid'] })
    const u = proposeUnderstanding(m)
    expect(u.siteMap.robotTypes ?? {}).toEqual({})
  })

  it('caps the expected set at 5 types', () => {
    const m = createCaptureManifest({
      ...base,
      expectedEmbodiments: ['humanoid', 'dog', 'drone', 'amr', 'arm', 'carrier'],
    })
    expect(m.expectedEmbodiments?.length).toBe(5)
  })

  it('mixes types onto a template floor too', () => {
    const m = createCaptureManifest({
      ...base,
      expectedEmbodiments: ['humanoid', 'amr'],
      floorLayout: { docks: 4, aisles: 6, staging_lanes: 3, robots: 4, no_go_zones: 1 },
    })
    const u = proposeUnderstanding(m)
    const types = new Set(Object.values(u.siteMap.robotTypes ?? {}))
    expect(types).toEqual(new Set(['humanoid', 'amr']))
    expect(evaluateDrawnSite(u.siteMap, 'humanoid').verdict).toBe('finish')
  })
})
