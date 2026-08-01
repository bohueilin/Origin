// ----------------------------------------------------------------------------
// perceiverScore — deterministic scorer for photo→grid parses vs ground truth.
//
// The other half of the manufactured-pairs lane (floorRender makes the image;
// this measures what the Perceiver read back). Commercial claims come from
// HERE, scoped honestly: per-role cell precision/recall/F1, anchor exactness,
// grid-dimension match, and agreement between the oracle's verdict on the
// ground truth and on the parse. A VOID/refused parse is counted as `unparsed`
// — it is never averaged into geometry means, and never hidden.
// ----------------------------------------------------------------------------

import { bfsOracle, type WarehouseTask } from '../src/warehouse.ts'
import { applyEmbodiment } from '../src/environmentPlan.ts'
import { genFloor, type BenchFloor } from './gateBench.ts'

export interface RoleScore {
  precision: number
  recall: number
  f1: number
  gtCount: number
  parsedCount: number
}

export type ParseScore =
  | {
      kind: 'scored'
      anchorsExact: number
      dimsMatch: boolean
      roles: { obstacles: RoleScore; hazards: RoleScore; humanOnly: RoleScore }
      verdictAgreement: boolean
      gtVerdict: string
      parsedVerdict: string
    }
  | { kind: 'unparsed' }

export interface AggregateReport {
  n: number
  scored: number
  unparsed: number
  /** Mean F1 over NON-VACUOUS role pairs of scored parses. A pair where both
   *  ground truth and parse have zero cells is a true negative but carries no
   *  information about the role — averaging its free 1.0 in would reward a
   *  parser that never predicts the role (found by the adversarial review). */
  meanRoleF1: { obstacles: number; hazards: number; humanOnly: number }
  /** How many non-vacuous pairs contributed to each role mean (0 support ⇒ mean reported as 0). */
  roleSupport: { obstacles: number; hazards: number; humanOnly: number }
  /** Fraction of scored parses with all three anchors exactly placed. */
  anchorAccuracy: number
  dimsMatchRate: number
  verdictAgreementRate: number
}

const key = (c: { x: number; y: number }): string => `${c.x},${c.y}`

function roleScore(gt: { x: number; y: number }[], parsed: { x: number; y: number }[]): RoleScore {
  const gtSet = new Set(gt.map(key))
  const parsedSet = new Set(parsed.map(key))
  let tp = 0
  for (const k of parsedSet) if (gtSet.has(k)) tp += 1
  const precision = parsedSet.size ? tp / parsedSet.size : gtSet.size === 0 ? 1 : 0
  const recall = gtSet.size ? tp / gtSet.size : parsedSet.size === 0 ? 1 : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  return { precision, recall, f1, gtCount: gtSet.size, parsedCount: parsedSet.size }
}

/** Oracle verdict for a floor — same task construction as the parse endpoint:
 *  battery = max(8, w*h*2), the SAME 'amr' embodiment the endpoint pins
 *  (chooseEmbodiment(undefined)), and the same porous re-run to split refuse
 *  from escalate. Divergence here was an adversarial-review finding: without
 *  the embodiment the scorer's verdicts could disagree with what the product
 *  displays for the identical floor. */
function floorVerdict(floor: BenchFloor): string {
  const battery = Math.max(8, floor.width * floor.height * 2)
  const base: WarehouseTask = {
    id: 'bench',
    seed: 0,
    level: 'L3',
    title: 'bench',
    brief: 'bench',
    width: floor.width,
    height: floor.height,
    start: { ...floor.start },
    item: { ...floor.item },
    drop: { ...floor.drop },
    obstacles: floor.obstacles.map((c) => ({ ...c })),
    hazards: floor.hazards.map((c) => ({ ...c })),
    humanOnly: floor.humanOnly.map((c) => ({ ...c })),
    battery,
    maxSteps: battery + 16,
  }
  const task = applyEmbodiment(base, 'amr')
  const oracle = bfsOracle(task)
  if (oracle.label === 'finish') return 'finish'
  const porous = bfsOracle({ ...task, hazards: [], humanOnly: [] })
  return porous.label === 'finish' ? 'refuse' : 'escalate'
}

export function scoreParse(gt: BenchFloor, parsed: BenchFloor | null): ParseScore {
  if (!parsed) return { kind: 'unparsed' }
  const anchorsExact = (['start', 'item', 'drop'] as const).filter((a) => key(gt[a]) === key(parsed[a])).length
  const gtVerdict = floorVerdict(gt)
  const parsedVerdict = floorVerdict(parsed)
  return {
    kind: 'scored',
    anchorsExact,
    dimsMatch: gt.width === parsed.width && gt.height === parsed.height,
    roles: {
      obstacles: roleScore(gt.obstacles, parsed.obstacles),
      hazards: roleScore(gt.hazards, parsed.hazards),
      humanOnly: roleScore(gt.humanOnly, parsed.humanOnly),
    },
    verdictAgreement: gtVerdict === parsedVerdict,
    gtVerdict,
    parsedVerdict,
  }
}

export function aggregateScores(scores: ParseScore[]): AggregateReport {
  const scored = scores.filter((s): s is Extract<ParseScore, { kind: 'scored' }> => s.kind === 'scored')
  const mean = (f: (s: (typeof scored)[number]) => number): number =>
    scored.length ? scored.reduce((acc, s) => acc + f(s), 0) / scored.length : 0
  // Role means exclude vacuous pairs (0 GT cells AND 0 parsed cells): a true
  // negative, but no evidence of role skill — a blind parser earns nothing.
  const roleMean = (role: 'obstacles' | 'hazards' | 'humanOnly'): { mean: number; support: number } => {
    const informative = scored.filter((s) => s.roles[role].gtCount > 0 || s.roles[role].parsedCount > 0)
    return {
      support: informative.length,
      mean: informative.length ? informative.reduce((acc, s) => acc + s.roles[role].f1, 0) / informative.length : 0,
    }
  }
  const obstacles = roleMean('obstacles')
  const hazards = roleMean('hazards')
  const humanOnly = roleMean('humanOnly')
  return {
    n: scores.length,
    scored: scored.length,
    unparsed: scores.length - scored.length,
    meanRoleF1: { obstacles: obstacles.mean, hazards: hazards.mean, humanOnly: humanOnly.mean },
    roleSupport: { obstacles: obstacles.support, hazards: hazards.support, humanOnly: humanOnly.support },
    anchorAccuracy: mean((s) => (s.anchorsExact === 3 ? 1 : 0)),
    dimsMatchRate: mean((s) => (s.dimsMatch ? 1 : 0)),
    verdictAgreementRate: mean((s) => (s.verdictAgreement ? 1 : 0)),
  }
}

// ---- scenario floors: the dataset must be able to FAIL the verdict metric ---
//
// genFloor's floors are (by construction) almost always oracle-'finish', so a
// verdict-agreement metric over them cannot fail — a parser that reads nothing
// and emits any open floor scores 100% agreement (adversarial-review finding).
// Scenario floors mix in refuse (hazard ring around the pickup: a porous path
// exists, so the oracle refuses rather than escalates) and escalate (wall ring:
// no path even ignoring hazards). Rings never touch anchors, so the floors stay
// representable under the gate's one-cell-one-role rules.

// ---- grouped aggregation + paired A/B statistics (the honest-delta layer) ---

export interface BenchCondition {
  style: string
  gridRefs: boolean
  variant: string
}

export const conditionKey = (c: BenchCondition): string => `${c.style}|${c.gridRefs ? 'refs' : 'plain'}|${c.variant}`

export interface GroupedReport {
  overall: AggregateReport
  byCondition: Record<string, AggregateReport>
  byStyle: Record<string, AggregateReport>
}

/** Aggregate scores overall AND per condition/style — scores never leak across groups. */
export function aggregateScoresBy(rows: { condition: BenchCondition; score: ParseScore }[]): GroupedReport {
  const byCondition: Record<string, ParseScore[]> = {}
  const byStyle: Record<string, ParseScore[]> = {}
  for (const r of rows) {
    ;(byCondition[conditionKey(r.condition)] ??= []).push(r.score)
    ;(byStyle[r.condition.style] ??= []).push(r.score)
  }
  const agg = (m: Record<string, ParseScore[]>): Record<string, AggregateReport> =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, aggregateScores(v)]))
  return { overall: aggregateScores(rows.map((r) => r.score)), byCondition: agg(byCondition), byStyle: agg(byStyle) }
}

export type PairedMetric = 'anchorsExact' | 'dimsMatch' | 'obstaclesF1' | 'hazardsF1' | 'humanOnlyF1'
const PAIRED_METRICS: readonly PairedMetric[] = ['anchorsExact', 'dimsMatch', 'obstaclesF1', 'hazardsF1', 'humanOnlyF1']

export interface PairedDelta {
  metric: PairedMetric
  /** Pairs where BOTH sides parsed (unparsed pairs are excluded and counted). */
  pairs: number
  wins: number
  ties: number
  losses: number
  /** Mean of (a − b) per pair. Positive = arm A better. */
  meanDelta: number
  /** Exact two-sided binomial sign test on wins vs losses (ties dropped), clamped to 1. */
  signTestP: number
  excludedUnparsed: number
}

const metricValue = (s: Extract<ParseScore, { kind: 'scored' }>, m: PairedMetric): number => {
  if (m === 'anchorsExact') return s.anchorsExact === 3 ? 1 : 0
  if (m === 'dimsMatch') return s.dimsMatch ? 1 : 0
  if (m === 'obstaclesF1') return s.roles.obstacles.f1
  if (m === 'hazardsF1') return s.roles.hazards.f1
  return s.roles.humanOnly.f1
}

/** Exact two-sided binomial: p = min(1, 2 · Σ_{k≥max(w,l)} C(n,k) / 2^n). */
function signTest(wins: number, losses: number): number {
  const n = wins + losses
  if (n === 0) return 1
  const extreme = Math.max(wins, losses)
  // C(n,k) via multiplicative form — n here is bench-sized (≤ a few hundred).
  let tail = 0
  for (let k = extreme; k <= n; k += 1) {
    let c = 1
    for (let i = 1; i <= k; i += 1) c = (c * (n - k + i)) / i
    tail += c
  }
  return Math.min(1, (2 * tail) / 2 ** n)
}

/** Paired same-id comparison between two arms. Pairing is strict by `id`
 *  (floor+style); unmatched rows are ignored, never cross-paired. */
export function pairedCompare(
  a: { id: string; score: ParseScore }[],
  b: { id: string; score: ParseScore }[],
): PairedDelta[] {
  const bById = new Map(b.map((r) => [r.id, r.score]))
  return PAIRED_METRICS.map((metric) => {
    let pairs = 0
    let wins = 0
    let ties = 0
    let losses = 0
    let deltaSum = 0
    let excludedUnparsed = 0
    for (const ra of a) {
      const sb = bById.get(ra.id)
      if (!sb) continue
      if (ra.score.kind !== 'scored' || sb.kind !== 'scored') {
        excludedUnparsed += 1
        continue
      }
      const d = metricValue(ra.score, metric) - metricValue(sb, metric)
      pairs += 1
      deltaSum += d
      if (d > 0) wins += 1
      else if (d < 0) losses += 1
      else ties += 1
    }
    return {
      metric,
      pairs,
      wins,
      ties,
      losses,
      meanDelta: pairs ? deltaSum / pairs : 0,
      signTestP: signTest(wins, losses),
      excludedUnparsed,
    }
  })
}

export interface ScenarioFloor {
  floor: BenchFloor
  expectedVerdict: 'finish' | 'refuse' | 'escalate'
  scenario: 'plain' | 'hazard_ring' | 'wall_ring'
}

export function genScenarioFloor(seed: number): ScenarioFloor {
  const base = genFloor(seed)
  const kind = seed % 3
  if (kind === 0) {
    return { floor: base, expectedVerdict: floorVerdict(base) as ScenarioFloor['expectedVerdict'], scenario: 'plain' }
  }
  const anchors = new Set([
    `${base.start.x},${base.start.y}`,
    `${base.item.x},${base.item.y}`,
    `${base.drop.x},${base.drop.y}`,
  ])
  // Ring the pickup with the scenario role; drop any ring cell that would sit
  // on another anchor (representability) and clear competing roles off ring
  // cells so the ring is airtight.
  const ring: { x: number; y: number }[] = []
  for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
    const c = { x: base.item.x + dx, y: base.item.y + dy }
    if (c.x < 0 || c.y < 0 || c.x >= base.width || c.y >= base.height) continue
    if (anchors.has(`${c.x},${c.y}`)) continue
    ring.push(c)
  }
  const ringKeys = new Set(ring.map((c) => `${c.x},${c.y}`))
  const strip = (cells: { x: number; y: number }[]): { x: number; y: number }[] => cells.filter((c) => !ringKeys.has(`${c.x},${c.y}`))
  if (kind === 1) {
    const floor: BenchFloor = { ...base, obstacles: strip(base.obstacles), hazards: [...strip(base.hazards), ...ring], humanOnly: strip(base.humanOnly) }
    // A hazard ring the drop sits inside of (adjacent to item) can leave a safe
    // path; trust the oracle, not the construction: label with the real verdict.
    return { floor, expectedVerdict: floorVerdict(floor) as ScenarioFloor['expectedVerdict'], scenario: 'hazard_ring' }
  }
  const floor: BenchFloor = { ...base, obstacles: [...strip(base.obstacles), ...ring], hazards: strip(base.hazards), humanOnly: strip(base.humanOnly) }
  return { floor, expectedVerdict: floorVerdict(floor) as ScenarioFloor['expectedVerdict'], scenario: 'wall_ring' }
}
