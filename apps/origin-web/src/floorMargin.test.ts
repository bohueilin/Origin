// floorMargin — behavioral spec, written BEFORE the implementation (TDD).
//
// The robotics question a buyer asks after "does a safe route exist?" is
// "how easily does that stop being true?" This module answers with two
// DIFFERENT, honestly-separated numbers:
//
//   * criticalCells — EXACT single-failure analysis, budget-aware: every free
//     cell whose blocking (turned into a wall) flips the oracle verdict away
//     from finish. Exhaustive sweep, so it also catches budget kills the
//     graph-cut cannot see (a detour that still connects but no longer fits
//     the battery).
//   * disconnectionMargin — EXACT minimum number of free cells whose removal
//     disconnects the safe route graph (min vertex cut, start→item→drop),
//     computed budget-BLIND and labeled as such. An upper bound on the true
//     budget-aware margin, never presented as the margin itself.
//
// Deterministic; same verdict semantics as the parse endpoint (same task
// builder, same 'amr' embodiment).

import { describe, expect, it } from 'vitest'
import { analyzeFloorMargin } from './floorMargin'
import type { DescriptiveSiteMap } from './workflowDraft'

const floor = (over: Partial<DescriptiveSiteMap> = {}): DescriptiveSiteMap => ({
  width: 7,
  height: 5,
  start: { x: 0, y: 2 },
  item: { x: 3, y: 2 },
  drop: { x: 6, y: 2 },
  obstacles: [],
  hazards: [],
  humanOnly: [],
  robots: [],
  ...over,
})

/** Wall off everything except a single row-2 corridor. */
const corridor = (): DescriptiveSiteMap => {
  const obstacles: { x: number; y: number }[] = []
  for (let y = 0; y < 5; y += 1) for (let x = 0; x < 7; x += 1) if (y !== 2) obstacles.push({ x, y })
  return floor({ obstacles })
}

describe('analyzeFloorMargin — base verdicts', () => {
  it('an open floor is finish with NO critical cells and margin > 1', () => {
    const r = analyzeFloorMargin(floor())
    expect(r.verdict).toBe('finish')
    expect(r.criticalCells).toEqual([])
    expect(r.singleFailureSafe).toBe(true)
    expect(r.disconnectionMargin).toBeGreaterThan(1)
  })

  it('a single corridor is finish but every corridor cell between anchors is critical', () => {
    const r = analyzeFloorMargin(corridor())
    expect(r.verdict).toBe('finish')
    expect(r.singleFailureSafe).toBe(false)
    expect(r.disconnectionMargin).toBe(1)
    // corridor cells strictly between the anchors: x=1,2 (start→item) and x=4,5 (item→drop)
    const keys = r.criticalCells.map((c) => `${c.x},${c.y}`).sort()
    expect(keys).toEqual(['1,2', '2,2', '4,2', '5,2'])
  })

  it('a non-finish floor reports margin 0 and no critical cells (nothing to protect)', () => {
    const blockedIn = floor({ obstacles: [{ x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 4, y: 2 }] })
    // item fully walled in → escalate
    const r = analyzeFloorMargin({ ...blockedIn, obstacles: [...blockedIn.obstacles, { x: 4, y: 1 }, { x: 4, y: 3 }, { x: 2, y: 2 }] })
    expect(['escalate', 'refuse']).toContain(r.verdict)
    expect(r.disconnectionMargin).toBe(0)
    expect(r.criticalCells).toEqual([])
    expect(r.singleFailureSafe).toBe(false)
  })
})

describe('analyzeFloorMargin — the sweep catches what the cut cannot (budget kills)', () => {
  it('a shortcut whose loss forces an over-budget detour is critical even though the graph stays connected', () => {
    // Tight battery: shortest safe route fits exactly; the detour connects but
    // does not fit. The sweep must flag the shortcut cell; the budget-blind cut
    // must NOT count it as a disconnection.
    const m = floor({ width: 12, height: 12, start: { x: 0, y: 0 }, item: { x: 11, y: 0 }, drop: { x: 0, y: 1 } })
    // wall row y=1 except a single gap at x=0 (drop) — detours for row 0 don't exist except through y≥1
    const obstacles: { x: number; y: number }[] = []
    for (let x = 1; x < 12; x += 1) obstacles.push({ x, y: 1 })
    const r = analyzeFloorMargin({ ...m, obstacles }, { batteryOverride: 24 })
    expect(r.verdict).toBe('finish')
    // blocking any row-0 cell between start and item disconnects (row 0 is the only path) — those are cut cells.
    // The budget-aware sweep must find critical cells; and the analysis must
    // EXPOSE both numbers separately rather than blending them.
    expect(r.singleFailureSafe).toBe(false)
    expect(r.criticalCells.length).toBeGreaterThan(0)
    expect(typeof r.disconnectionMargin).toBe('number')
  })

  it('budget kill, isolated: connectivity survives the block but the battery does not', () => {
    // Two routes: short top corridor, long bottom detour. Battery fits ONLY the short one.
    const width = 11
    const height = 4
    const obstacles: { x: number; y: number }[] = []
    for (let x = 1; x < width - 1; x += 1) obstacles.push({ x, y: 1 }) // wall between row 0 and row 2, open at both ends
    const m: DescriptiveSiteMap = {
      width, height,
      start: { x: 0, y: 0 }, item: { x: width - 1, y: 0 }, drop: { x: width - 2, y: 0 },
      obstacles, hazards: [], humanOnly: [], robots: [],
    }
    const r = analyzeFloorMargin(m, { batteryOverride: 14 })
    expect(r.verdict).toBe('finish')
    const critical = new Set(r.criticalCells.map((c) => `${c.x},${c.y}`))
    // Blocking a mid-row-0 cell leaves the long detour CONNECTED but over budget:
    expect(critical.has('5,0')).toBe(true)
    // ...and the budget-blind disconnection margin sees ≥2 routes, so > 1:
    expect(r.disconnectionMargin).toBeGreaterThan(1)
  })
})

describe('analyzeFloorMargin — exactness of the disconnection margin (brute-force cross-check)', () => {
  it('matches brute force over singles and pairs on small floors', () => {
    const maps = [
      floor(),
      corridor(),
      floor({ obstacles: [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 3 }] }), // partial wall → narrow passages
      floor({ obstacles: [{ x: 1, y: 1 }, { x: 5, y: 3 }], hazards: [{ x: 2, y: 4 }] }),
    ]
    for (const m of maps) {
      const r = analyzeFloorMargin(m)
      if (r.verdict !== 'finish') continue
      const brute = bruteDisconnectionMargin(m)
      expect(r.disconnectionMargin).toBe(brute)
    }
  })
})

describe('analyzeFloorMargin — anchors are never cuttable (adversarial-review majors)', () => {
  it('an anchor on the cut path is not countable: the review\'s executed instance (reported 1, truth 2)', () => {
    // Verified reproduction from the adversarial review: the old code cut
    // THROUGH an anchor cell on one leg and reported disconnectionMargin 1;
    // brute force over blockable FREE cells (anchors excluded) proves 2.
    const m: DescriptiveSiteMap = {
      width: 5, height: 4,
      start: { x: 3, y: 2 }, item: { x: 0, y: 2 }, drop: { x: 4, y: 3 },
      obstacles: [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 2, y: 3 }],
      hazards: [], humanOnly: [], robots: [],
    }
    const r = analyzeFloorMargin(m)
    if (r.verdict !== 'finish') throw new Error('fixture must be finish')
    expect(bruteDisconnectionMargin(m)).toBe(2)
    expect(r.disconnectionMargin).toBe(2)
  })

  it('adjacent anchors: a floor that free cells cannot disconnect reports null, never 268435456', () => {
    const m = floor({ start: { x: 1, y: 2 }, item: { x: 2, y: 2 }, drop: { x: 3, y: 2 } })
    const r = analyzeFloorMargin(m)
    expect(r.verdict).toBe('finish')
    expect(r.disconnectionMargin).toBeNull()
    expect(r.singleFailureSafe).toBe(true)
  })

  it('one adjacent pair, one separated pair: the separated leg governs the number', () => {
    const m = floor({ start: { x: 0, y: 2 }, item: { x: 1, y: 2 }, drop: { x: 6, y: 2 } })
    const r = analyzeFloorMargin(m)
    expect(r.verdict).toBe('finish')
    expect(typeof r.disconnectionMargin).toBe('number')
    expect(r.disconnectionMargin).toBe(bruteDisconnectionMargin(m))
  })
})

describe('analyzeFloorMargin — determinism', () => {
  it('same map → identical report, and the digest binds it', () => {
    const a = analyzeFloorMargin(corridor())
    const b = analyzeFloorMargin(corridor())
    expect(a).toEqual(b)
    expect(a.digest).toMatch(/^[0-9a-f]{64}$/)
    expect(a.digest).not.toBe(analyzeFloorMargin(floor()).digest)
  })
})

// ---- brute force: an INDEPENDENT connectivity check (plain BFS written here,
// not the module under test), so the cross-check means something. ----

function safeConnected(m: DescriptiveSiteMap, extra: { x: number; y: number }[]): boolean {
  const solid = new Set([...m.obstacles, ...m.hazards, ...m.humanOnly, ...extra].map((c) => `${c.x},${c.y}`))
  const reach = (from: { x: number; y: number }, to: { x: number; y: number }): boolean => {
    if (solid.has(`${from.x},${from.y}`) || solid.has(`${to.x},${to.y}`)) return false
    const seen = new Set([`${from.x},${from.y}`])
    const q = [from]
    for (let i = 0; i < q.length; i += 1) {
      const c = q[i]
      if (c.x === to.x && c.y === to.y) return true
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        const n = { x: c.x + dx, y: c.y + dy }
        const k = `${n.x},${n.y}`
        if (n.x < 0 || n.y < 0 || n.x >= m.width || n.y >= m.height || solid.has(k) || seen.has(k)) continue
        seen.add(k)
        q.push(n)
      }
    }
    return false
  }
  return reach(m.start, m.item) && reach(m.item, m.drop)
}

function freeCells(m: DescriptiveSiteMap): { x: number; y: number }[] {
  const anchors = new Set([`${m.start.x},${m.start.y}`, `${m.item.x},${m.item.y}`, `${m.drop.x},${m.drop.y}`])
  const solid = new Set([...m.obstacles, ...m.hazards, ...m.humanOnly].map((c) => `${c.x},${c.y}`))
  const out: { x: number; y: number }[] = []
  for (let y = 0; y < m.height; y += 1) for (let x = 0; x < m.width; x += 1) {
    const k = `${x},${y}`
    if (!anchors.has(k) && !solid.has(k)) out.push({ x, y })
  }
  return out
}

function bruteDisconnectionMargin(m: DescriptiveSiteMap): number | null {
  if (!safeConnected(m, [])) return 0
  const cells = freeCells(m)
  for (const c of cells) if (!safeConnected(m, [c])) return 1
  for (let i = 0; i < cells.length; i += 1)
    for (let j = i + 1; j < cells.length; j += 1)
      if (!safeConnected(m, [cells[i], cells[j]])) return 2
  // no 1- or 2-cut exists; the module's value must agree it is ≥3 (or null =
  // not disconnectable by free cells at all)
  const v = analyzeFloorMargin(m).disconnectionMargin
  if (v !== null && v < 3) throw new Error(`cut says ${v} but brute force found no 1/2-cut`)
  return v
}
