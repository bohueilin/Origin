// perceiverScore — behavioral spec, written BEFORE the implementation (TDD).
//
// Deterministic scorer for photo→grid parses against manufactured ground truth.
// The Perceiver's commercial number is not "it demos well" — it is per-role
// cell F1, anchor accuracy, and oracle-verdict agreement, measured under THIS
// scorer on labeled synthetic pairs. VOIDs are counted, never averaged away.

import { describe, expect, it } from 'vitest'
import { scoreParse, aggregateScores, genScenarioFloor } from './perceiverScore'
import { genFloor } from './gateBench'

const gt = genFloor(3)
const perfect = JSON.parse(JSON.stringify(gt)) as typeof gt

describe('scoreParse', () => {
  it('a perfect parse scores 1.0 across the board with all anchors exact', () => {
    const s = scoreParse(gt, perfect)
    expect(s.kind).toBe('scored')
    if (s.kind !== 'scored') return
    expect(s.anchorsExact).toBe(3)
    expect(s.dimsMatch).toBe(true)
    expect(s.roles.obstacles.f1).toBe(1)
    expect(s.roles.hazards.f1).toBe(1)
    expect(s.roles.humanOnly.f1).toBe(1)
    expect(s.verdictAgreement).toBe(true)
  })

  it('a shifted anchor drops anchorsExact without touching role F1', () => {
    const shifted = JSON.parse(JSON.stringify(gt)) as typeof gt
    shifted.drop = { x: (gt.drop.x + 1) % gt.width, y: gt.drop.y }
    const s = scoreParse(gt, shifted)
    if (s.kind !== 'scored') throw new Error('expected scored')
    expect(s.anchorsExact).toBe(2)
  })

  it('missing walls lower recall but not precision; invented walls do the reverse', () => {
    const withWalls = { ...gt, obstacles: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] }
    const missing = { ...withWalls, obstacles: withWalls.obstacles.slice(0, 2) }
    const invented = { ...withWalls, obstacles: [...withWalls.obstacles, { x: 0, y: 1 }, { x: 1, y: 1 }] }
    const sMissing = scoreParse(withWalls, missing)
    const sInvented = scoreParse(withWalls, invented)
    if (sMissing.kind !== 'scored' || sInvented.kind !== 'scored') throw new Error('expected scored')
    expect(sMissing.roles.obstacles.recall).toBe(0.5)
    expect(sMissing.roles.obstacles.precision).toBe(1)
    expect(sInvented.roles.obstacles.precision).toBeCloseTo(4 / 6)
    expect(sInvented.roles.obstacles.recall).toBe(1)
  })

  it('a VOID/refused parse is recorded as unparsed, never given a geometry score', () => {
    const s = scoreParse(gt, null)
    expect(s.kind).toBe('unparsed')
  })
})

describe('aggregateScores', () => {
  it('averages only scored parses, counts unparsed separately, and reports n honestly', () => {
    const scores = [scoreParse(gt, perfect), scoreParse(gt, perfect), scoreParse(gt, null)]
    const agg = aggregateScores(scores)
    expect(agg.n).toBe(3)
    expect(agg.scored).toBe(2)
    expect(agg.unparsed).toBe(1)
    expect(agg.meanRoleF1.obstacles).toBe(1)
    expect(agg.anchorAccuracy).toBe(1)
    expect(agg.verdictAgreementRate).toBe(1)
  })

  it('an empty run aggregates to zeros, not NaN', () => {
    const agg = aggregateScores([])
    expect(agg.n).toBe(0)
    expect(agg.anchorAccuracy).toBe(0)
    expect(Number.isNaN(agg.meanRoleF1.hazards)).toBe(false)
  })

  it('vacuous role scores (empty vs empty) never pay into the F1 means — a blind parser earns nothing', () => {
    // GT floor with NO humanOnly cells; a parser that also outputs none gets a
    // true-negative — but averaging that 1.0 into meanRoleF1 rewards parsers
    // that never predict the role. Vacuous pairs are excluded and counted.
    const empty = { ...gt, humanOnly: [] as { x: number; y: number }[] }
    const parsedEmpty = JSON.parse(JSON.stringify(empty)) as typeof empty
    const agg = aggregateScores([scoreParse(empty, parsedEmpty)])
    expect(agg.roleSupport.humanOnly).toBe(0) // no non-vacuous humanOnly pair contributed
    expect(agg.meanRoleF1.humanOnly).toBe(0) // reported as 0-with-0-support, never as a free 1.0
    expect(agg.roleSupport.obstacles).toBeGreaterThan(0)
    expect(agg.meanRoleF1.obstacles).toBe(1)
  })
})

describe('genScenarioFloor — the dataset must be able to FAIL the verdict metric', () => {
  it('produces a mix of finish / refuse / escalate ground truths across seeds', () => {
    const verdicts = { finish: 0, refuse: 0, escalate: 0 } as Record<string, number>
    for (let s = 0; s < 30; s += 1) {
      const { floor, expectedVerdict } = genScenarioFloor(s)
      verdicts[expectedVerdict] += 1
      // the scenario must actually produce that verdict under the scorer's oracle
      const check = scoreParse(floor, JSON.parse(JSON.stringify(floor)) as typeof floor)
      if (check.kind === 'scored') expect(check.gtVerdict).toBe(expectedVerdict)
    }
    expect(verdicts.finish).toBeGreaterThan(0)
    expect(verdicts.refuse).toBeGreaterThan(0)
    expect(verdicts.escalate).toBeGreaterThan(0)
  })

  it('scenario floors stay representable: no role cell sits on an anchor (the gate would drop it)', () => {
    for (let s = 0; s < 30; s += 1) {
      const { floor } = genScenarioFloor(s)
      const anchors = new Set([`${floor.start.x},${floor.start.y}`, `${floor.item.x},${floor.item.y}`, `${floor.drop.x},${floor.drop.y}`])
      for (const c of [...floor.obstacles, ...floor.hazards, ...floor.humanOnly]) {
        expect(anchors.has(`${c.x},${c.y}`)).toBe(false)
      }
    }
  })
})
