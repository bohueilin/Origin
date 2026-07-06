// Origin Training Evidence — curriculum (P8: difficulty bands as first-class metadata)
// =============================================================================
// Difficulty is a first-class, DERIVED, VERIFIER-INDEPENDENT band on every task. The
// verifier NEVER reads it (band logic lives here, not in warehouse.ts) — otherwise a
// policy could farm easy bands for reward (Goodhart). The curriculum samples near the
// competence frontier (~50–70% pass) and promotes a band on mastery. The sealed
// CurriculumState (rlkit/curriculum-evidence.mjs) makes promotion earned, not granted.
// =============================================================================

import {
  warehouseTasks,
  bfsOracle,
  evaluateWarehousePolicy,
  type WarehouseTask,
  type WarehouseAction,
} from './warehouse.ts'

export type DifficultyBand = 'B0' | 'B1' | 'B2' | 'B3' | 'B4'
export const BANDS: DifficultyBand[] = ['B0', 'B1', 'B2', 'B3', 'B4']

export const CURRICULUM_VERSION = '2026-07-05.1'

// The ONLY thing that maps measurable complexity → band. Frozen + version-stamped.
// complexity = area/10 + 3·hazardCells + 0.5·oracleHorizon (all machine-measured,
// verifier-independent). Cutoffs spread the real task set across B0..B4.
export const BAND_REGISTRY = {
  version: CURRICULUM_VERSION,
  weights: { area: 1, hazardCells: 3, horizon: 0.5 },
  cutoffs: [6, 9, 12, 18], // B0 <6 · B1 <9 · B2 <12 · B3 <18 · B4 ≥18
} as const

export function taskComplexity(task: WarehouseTask): number {
  const area = task.width * task.height
  const hazardCells = task.hazards.length + task.humanOnly.length
  const horizon = bfsOracle(task).pathLength
  const w = BAND_REGISTRY.weights
  return Math.round((w.area * (area / 10) + w.hazardCells * hazardCells + w.horizon * horizon) * 10) / 10
}

export function difficultyBand(task: WarehouseTask): DifficultyBand {
  const score = taskComplexity(task)
  let i = 0
  while (i < BAND_REGISTRY.cutoffs.length && score >= BAND_REGISTRY.cutoffs[i]) i += 1
  return BANDS[i]
}

export function nextBand(band: DifficultyBand): DifficultyBand {
  const i = BANDS.indexOf(band)
  return BANDS[Math.min(i + 1, BANDS.length - 1)]
}

export interface BandCompetence {
  pass: number
  total: number
  rate: number
}

// Per-band pass rate of a policy, via the REAL verifier (evaluateWarehousePolicy).
export function measureCompetence(
  policy: (t: WarehouseTask) => WarehouseAction[],
  tasks: WarehouseTask[] = [...warehouseTasks],
): Partial<Record<DifficultyBand, BandCompetence>> {
  const acc: Partial<Record<DifficultyBand, { pass: number; total: number }>> = {}
  for (const rollout of evaluateWarehousePolicy('curriculum', policy, tasks)) {
    const band = difficultyBand(rollout.task)
    const a = (acc[band] ??= { pass: 0, total: 0 })
    a.total += 1
    if (rollout.passed) a.pass += 1
  }
  const out: Partial<Record<DifficultyBand, BandCompetence>> = {}
  for (const band of BANDS) {
    const a = acc[band]
    if (a) out[band] = { pass: a.pass, total: a.total, rate: Math.round((a.pass / a.total) * 100) / 100 }
  }
  return out
}

// Sample near the competence frontier: the HARDEST band with pass rate in [lo,hi];
// else the band whose rate is closest to the frontier midpoint.
export function curriculumSample(
  competence: Partial<Record<DifficultyBand, BandCompetence>>,
  opts: { lo: number; hi: number } = { lo: 0.5, hi: 0.7 },
): { band: DifficultyBand; task: WarehouseTask } {
  const present = BANDS.filter((b) => competence[b])
  const mid = (opts.lo + opts.hi) / 2
  const inFrontier = present.filter((b) => competence[b]!.rate >= opts.lo && competence[b]!.rate <= opts.hi)
  const band = inFrontier.length
    ? inFrontier[inFrontier.length - 1]
    : present.reduce((best, b) => (Math.abs(competence[b]!.rate - mid) < Math.abs(competence[best]!.rate - mid) ? b : best), present[0])
  const task = warehouseTasks.find((t) => difficultyBand(t) === band) ?? warehouseTasks[0]
  return { band, task }
}

export interface Promotion {
  from: DifficultyBand
  to: DifficultyBand
  promoted: boolean
  mastery: number
  rate: number
}

// Mastery-gated promotion: advance ONE band only when the active band is mastered.
export function promoteCurriculum(
  active: DifficultyBand,
  competence: Partial<Record<DifficultyBand, BandCompetence>>,
  mastery = 0.9,
): Promotion {
  const rate = competence[active]?.rate ?? 0
  const to = rate >= mastery ? nextBand(active) : active
  return { from: active, to, promoted: to !== active, mastery, rate }
}
