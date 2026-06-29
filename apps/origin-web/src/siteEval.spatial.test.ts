// Spatial grant→oracle binding edge — the hospital differentiator.
//
// A restricted (humanOnly) zone is an absolute wall for EVERY robot today. With a
// live, scoped `enter_zone` grant for the zone the agent is standing against, that
// zone becomes PASSABLE for THIS agent, so the oracle scores POLICY (refuse without
// the grant → finish with it) — never a physics override. Authorization is a
// deterministic set-membership check; the oracle still decides.
//
// Invariants asserted here:
//   1. No grant            → REFUSE   (zone is a wall, only route crosses it).
//   2. Matching grant      → FINISH   (zone passable, oracle finds the safe route).
//   3. Unrelated grant     → REFUSE   (wrong zoneId is not membership; still a wall).
//   4. Default (no arg)    → byte-identical to the no-grant call (back-compat).
//   5. A real physical HAZARD on the only route still REFUSES even WITH the grant.

import { describe, expect, it } from 'vitest'
import { evaluateDrawnSite, siteMapToWarehouseTask } from './siteEval'
import { isZoneScope, type ZoneScope } from './credentials/types'
import type { DescriptiveSiteMap } from './workflowDraft'

const ZONE = 'ward-3-isolation'

// A 5×1 corridor: start(0) → [pass(1)] → [GATE(2)] → [pass(3)] → drop/item(4).
// The single GATE cell at x=2 is the only way across, and it is humanOnly tagged to
// `restrictedZoneId`. Walls above/below are unnecessary because the grid is one row
// tall, so the GATE is genuinely the sole path between start and the item/drop.
const corridor = (over: Partial<DescriptiveSiteMap> = {}): DescriptiveSiteMap => ({
  width: 5,
  height: 1,
  start: { x: 0, y: 0 },
  item: { x: 4, y: 0 },
  drop: { x: 4, y: 0 },
  obstacles: [],
  hazards: [],
  humanOnly: [{ x: 2, y: 0 }],
  restrictedZoneId: ZONE,
  robots: [{ x: 0, y: 0 }],
  ...over,
})

describe('spatial grant → oracle binding edge', () => {
  it('NO grant: the restricted zone is an absolute wall → REFUSE', () => {
    const noGrant = evaluateDrawnSite(corridor(), 'humanoid')
    expect(noGrant.verdict).toBe('refuse')
  })

  it('MATCHING grant: the restricted zone is passable for this agent → FINISH', () => {
    const granted = evaluateDrawnSite(corridor(), 'humanoid', new Set([ZONE]))
    expect(granted.verdict).toBe('finish')
    // The grant only drops the authorized humanOnly cell from the scored task; the
    // oracle (not the grant) computes the finish path across the now-open gate.
    expect(granted.task.humanOnly).toHaveLength(0)
    expect(granted.pathCells.length).toBeGreaterThan(0)
  })

  it('UNRELATED grant: a non-matching zoneId is not membership → still REFUSE', () => {
    const wrong = evaluateDrawnSite(corridor(), 'humanoid', new Set(['pharmacy-vault']))
    expect(wrong.verdict).toBe('refuse')
  })

  it('back-compat: omitting the grant arg equals passing an empty grant set', () => {
    const omitted = evaluateDrawnSite(corridor(), 'humanoid')
    const empty = evaluateDrawnSite(corridor(), 'humanoid', new Set<string>())
    expect(omitted.verdict).toBe(empty.verdict)
    expect(omitted.task.humanOnly).toEqual(empty.task.humanOnly)
    // And an UNTAGGED map (no restrictedZoneId) is immune to grants entirely.
    const untagged = corridor({ restrictedZoneId: undefined })
    expect(evaluateDrawnSite(untagged, 'humanoid', new Set([ZONE])).verdict).toBe('refuse')
  })

  it('authorization NEVER overrides physics: a hazard on the only route still REFUSES even with the grant', () => {
    // Same corridor, but the gate cell is ALSO a physical hazard (spill/chemical),
    // not just a policy zone. The grant authorizes the zone; it must not move the robot
    // through a real hazard. Hazards are never dropped by the grant.
    const hazardGate = corridor({ hazards: [{ x: 2, y: 0 }] })
    const granted = evaluateDrawnSite(hazardGate, 'humanoid', new Set([ZONE]))
    expect(granted.verdict).toBe('refuse')
  })

  it('siteMapToWarehouseTask: matching grant drops only the authorized cell, never hazards', () => {
    const map = corridor({ hazards: [{ x: 3, y: 0 }] })
    const task = siteMapToWarehouseTask(map, 'humanoid', new Set([ZONE]))
    // humanOnly gate authorized away…
    expect(task.humanOnly).toHaveLength(0)
    // …but the hazard cell survives untouched.
    expect(task.hazards).toEqual([{ x: 3, y: 0 }])
  })

  it('ZoneScope type guard distinguishes spatial grants from digital scopes', () => {
    const scope: ZoneScope = { kind: 'enter_zone', zoneId: ZONE }
    expect(isZoneScope(scope)).toBe(true)
    expect(isZoneScope('api_read')).toBe(false)
    expect(isZoneScope({ kind: 'enter_zone' })).toBe(false)
    expect(isZoneScope(null)).toBe(false)
  })
})
