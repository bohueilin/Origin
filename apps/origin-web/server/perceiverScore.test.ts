// perceiverScore — behavioral spec, written BEFORE the implementation (TDD).
//
// Deterministic scorer for photo→grid parses against manufactured ground truth.
// The Perceiver's commercial number is not "it demos well" — it is per-role
// cell F1, anchor accuracy, and oracle-verdict agreement, measured under THIS
// scorer on labeled synthetic pairs. VOIDs are counted, never averaged away.

import { describe, expect, it } from 'vitest'
import {
  scoreParse,
  aggregateScores,
  aggregateScoresBy,
  pairedCompare,
  genScenarioFloor,
  deriveUnparsedCause,
  checkMinScored,
  reportDigest,
  runArtifactName,
  resolveWriteOnce,
} from './perceiverScore'
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

  it('an unparsed row carries its cause when one is given, and omits the field when not', () => {
    expect(scoreParse(gt, null, 'gate_void')).toEqual({ kind: 'unparsed', cause: 'gate_void' })
    expect(scoreParse(gt, null)).toEqual({ kind: 'unparsed' })
  })
})

describe('deriveUnparsedCause — WHY a row went unparsed, recoverable per row not just per arm', () => {
  it('a response that produced a siteMap has no unparsed cause', () => {
    expect(deriveUnparsedCause({ siteMap: { width: 6 } })).toBe(null)
  })

  it('endpoint fallback reasons pass through verbatim (bad_json, api_error, network, no_key)', () => {
    for (const f of ['bad_json', 'api_error', 'network', 'no_key'] as const) {
      expect(deriveUnparsedCause({ fallback: f })).toBe(f)
    }
  })

  it('a gate refusal with no fallback maps to its verdict: VOID → gate_void, ESCALATE → gate_escalate', () => {
    expect(deriveUnparsedCause({ gate: { verdict: 'VOID' } })).toBe('gate_void')
    expect(deriveUnparsedCause({ gate: { verdict: 'ESCALATE' } })).toBe('gate_escalate')
  })

  it('a fallback wins over a gate verdict, and unrecognized shapes report unknown — never an invented cause', () => {
    expect(deriveUnparsedCause({ fallback: 'bad_json', gate: { verdict: 'VOID' } })).toBe('bad_json')
    expect(deriveUnparsedCause({})).toBe('unknown')
    expect(deriveUnparsedCause({ fallback: 'some_future_reason' })).toBe('unknown')
    expect(deriveUnparsedCause({ gate: { verdict: 'VALID' } })).toBe('unknown')
  })
})

describe('aggregateScoresBy — grouped aggregation for the A/B arms', () => {
  it('partitions by condition with no leakage, and overall equals the flat aggregate', () => {
    const rows = [
      { condition: { style: 'print', gridRefs: false, variant: 'legend' }, score: scoreParse(gt, perfect) },
      { condition: { style: 'print', gridRefs: true, variant: 'legend' }, score: scoreParse(gt, null) },
      { condition: { style: 'sketch', gridRefs: true, variant: 'counting' }, score: scoreParse(gt, perfect) },
    ] as const
    const g = aggregateScoresBy([...rows])
    expect(g.overall).toEqual(aggregateScores(rows.map((r) => r.score)))
    expect(Object.keys(g.byCondition).sort()).toEqual(['print|plain|legend', 'print|refs|legend', 'sketch|refs|counting'])
    expect(g.byCondition['print|plain|legend'].scored).toBe(1)
    expect(g.byCondition['print|refs|legend'].unparsed).toBe(1)
    expect(g.byCondition['print|refs|legend'].scored).toBe(0)
    expect(g.byStyle.print.n).toBe(2)
    expect(g.byStyle.sketch.n).toBe(1)
  })
})

describe('pairedCompare — same-floor paired deltas with an exact sign test', () => {
  const win = () => scoreParse(gt, perfect) // anchorsExact 3 → metric 1
  const lose = () => {
    const shifted = JSON.parse(JSON.stringify(gt)) as typeof gt
    shifted.drop = { x: (gt.drop.x + 1) % gt.width, y: gt.drop.y }
    shifted.width = gt.width + 1 // also breaks dimsMatch
    return scoreParse(gt, shifted)
  }

  it('5 clean wins on a metric: exact two-sided binomial p = 2·(1/2)^5 = 0.0625', () => {
    const ids = ['0-print', '1-print', '2-print', '3-print', '4-print']
    const a = ids.map((id) => ({ id, score: win() }))
    const b = ids.map((id) => ({ id, score: lose() }))
    const deltas = pairedCompare(a, b)
    const anchors = deltas.find((d) => d.metric === 'anchorsExact')
    expect(anchors?.pairs).toBe(5)
    expect(anchors?.wins).toBe(5)
    expect(anchors?.losses).toBe(0)
    expect(anchors?.signTestP).toBeCloseTo(0.0625, 10)
    expect(anchors?.meanDelta).toBeGreaterThan(0)
  })

  it('identical arms: all ties, meanDelta 0, p = 1', () => {
    const ids = ['0-print', '1-print', '2-print']
    const a = ids.map((id) => ({ id, score: win() }))
    const b = ids.map((id) => ({ id, score: win() }))
    for (const d of pairedCompare(a, b)) {
      expect(d.ties).toBe(d.pairs)
      expect(d.meanDelta).toBe(0)
      expect(d.signTestP).toBe(1)
    }
  })

  it('an unparsed side excludes the pair from deltas and counts it honestly', () => {
    const a = [{ id: 'x', score: win() }, { id: 'y', score: win() }]
    const b = [{ id: 'x', score: scoreParse(gt, null) }, { id: 'y', score: lose() }]
    const d = pairedCompare(a, b).find((m) => m.metric === 'anchorsExact')
    expect(d?.pairs).toBe(1)
    expect(d?.excludedUnparsed).toBe(1)
  })

  it('is antisymmetric: swapping arms negates meanDelta and swaps wins/losses', () => {
    const ids = ['0-print', '1-print']
    const a = ids.map((id) => ({ id, score: win() }))
    const b = ids.map((id) => ({ id, score: lose() }))
    const ab = pairedCompare(a, b).find((m) => m.metric === 'dimsMatch')
    const ba = pairedCompare(b, a).find((m) => m.metric === 'dimsMatch')
    expect(ab?.meanDelta).toBeCloseTo(-(ba?.meanDelta ?? NaN), 10)
    expect(ab?.wins).toBe(ba?.losses)
    expect(ab?.losses).toBe(ba?.wins)
  })

  it('pairs strictly by id: unmatched rows are ignored, never cross-paired', () => {
    const a = [{ id: 'only-in-a', score: win() }, { id: 'both', score: win() }]
    const b = [{ id: 'both', score: lose() }, { id: 'only-in-b', score: lose() }]
    const d = pairedCompare(a, b).find((m) => m.metric === 'anchorsExact')
    expect(d?.pairs).toBe(1)
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

  it('breaks unparsed down by cause; a causeless unparsed counts as unknown, never disappears', () => {
    const scores = [
      scoreParse(gt, perfect),
      scoreParse(gt, null, 'gate_void'),
      scoreParse(gt, null, 'gate_void'),
      scoreParse(gt, null, 'bad_json'),
      scoreParse(gt, null),
    ]
    const agg = aggregateScores(scores)
    // existing shape intact: scored/unparsed counts unchanged by the breakdown
    expect(agg.n).toBe(5)
    expect(agg.scored).toBe(1)
    expect(agg.unparsed).toBe(4)
    expect(agg.unparsedBreakdown).toEqual({ gate_void: 2, bad_json: 1, unknown: 1 })
  })

  it('a fully scored run reports an empty breakdown', () => {
    expect(aggregateScores([scoreParse(gt, perfect)]).unparsedBreakdown).toEqual({})
  })
})

describe('checkMinScored — losing hard rows must fail the run, not flatter the headline means', () => {
  it('flags every arm whose scored fraction sits below the floor, with the fraction on the record', () => {
    const v = checkMinScored({ A0: { scored: 4, n: 10 }, A1: { scored: 10, n: 10 } }, 0.9)
    expect(v).toEqual([{ arm: 'A0', scored: 4, n: 10, fraction: 0.4 }])
  })

  it('exactly at the floor passes — the guard is strict-below', () => {
    expect(checkMinScored({ A0: { scored: 9, n: 10 } }, 0.9)).toEqual([])
  })

  it('a zero-row arm measured nothing: flagged under any positive floor, no division by zero', () => {
    expect(checkMinScored({ A0: { scored: 0, n: 0 } }, 0.9)).toEqual([{ arm: 'A0', scored: 0, n: 0, fraction: 0 }])
  })

  it('a floor of 0 disables the guard', () => {
    expect(checkMinScored({ A0: { scored: 0, n: 10 }, A1: { scored: 0, n: 0 } }, 0)).toEqual([])
  })
})

describe('reportDigest — canonical-JSON sha256 self-digest, same discipline as gateBench', () => {
  it('is 64 hex chars and independent of key order', () => {
    const a = reportDigest({ x: 1, y: [1, 2, { z: 'a' }] })
    const b = reportDigest({ y: [1, 2, { z: 'a' }], x: 1 })
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).toBe(b)
  })

  it('changes when any value changes', () => {
    expect(reportDigest({ x: 1 })).not.toBe(reportDigest({ x: 2 }))
  })

  it('drops undefined values instead of serializing them (canonical form)', () => {
    expect(reportDigest({ x: 1, y: undefined })).toBe(reportDigest({ x: 1 }))
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

// ---- Run-artifact naming + write-once (Q1a: per-row publication, no clobber) ----
//
// 2026-08-04: a 2-floor smoke run overwrote bench-out/perceiver-report.json and
// with it the last copy of the 2026-08-01 headline experiment's raw report — its
// aggregates are now permanently attested-only. These tests pin the contract
// that makes that class of loss impossible: run outputs are named by date +
// content digest and are never overwritten with different bytes.
describe('runArtifactName', () => {
  it('embeds kind, day, and a digest prefix', () => {
    const d = 'a'.repeat(64)
    expect(runArtifactName('report', '2026-08-04', d)).toBe('perceiver-report-2026-08-04-aaaaaaaa.json')
    expect(runArtifactName('rows', '2026-08-04', d)).toBe('perceiver-rows-2026-08-04-aaaaaaaa.json')
  })
  it('rejects malformed days and short digests', () => {
    expect(() => runArtifactName('report', '20260804', 'a'.repeat(64))).toThrow()
    expect(() => runArtifactName('report', '2026-08-04', 'abc')).toThrow()
  })
})

describe('resolveWriteOnce', () => {
  it('writes when the path is free', () => {
    expect(resolveWriteOnce(false, null, '{"a":1}')).toBe('write')
  })
  it('skips when identical bytes already exist (same digest, same name — harmless)', () => {
    expect(resolveWriteOnce(true, '{"a":1}', '{"a":1}')).toBe('skip-identical')
  })
  it('refuses to overwrite different bytes — the 08-01 loss can never recur', () => {
    expect(() => resolveWriteOnce(true, '{"a":1}', '{"a":2}')).toThrow(/refus/i)
  })
})
