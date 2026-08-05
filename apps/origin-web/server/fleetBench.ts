// ----------------------------------------------------------------------------
// fleetBench — deterministic corruption benchmark for the fleet-schedule verifier.
//
// gateBench's sibling, one level up the stack: seeded floors → the REAL MAPD
// planner (planMultiAgent) → a valid baseline schedule → one injected violation
// class per trial → does fleetVerify catch it? The two commercial numbers are
// the same shape as the gate's: 100% catch on injected violations, and zero
// false VOIDs on clean, fully-deconflicted plans.
//
// Plus one OBSERVATIONAL lane, reported without an expectation: schedules the
// planner itself flags with its escape hatch (fullyDeconflicted:false) — how
// often does independent verification actually reject them? That number is
// reported as measured, whatever it is.
// ----------------------------------------------------------------------------

import { planMultiAgent, type MultiAgentInput } from '../src/multiAgent.ts'
import { verifyFleetSchedule, type FleetScheduleInput } from './fleetVerify.ts'
import { sha256 } from '../src/passport/hash.ts'
import type { GridPos } from '../src/warehouse.ts'

export const FLEET_CORRUPTIONS = [
  'clean',
  'teleport',
  'wall_drive',
  'unsafe_drive',
  'vertex_inject',
  'swap_inject',
  'start_mismatch',
] as const
export type FleetCorruption = (typeof FLEET_CORRUPTIONS)[number]

const EXPECTED: Record<FleetCorruption, 'VALID' | 'VOID'> = {
  clean: 'VALID',
  teleport: 'VOID',
  wall_drive: 'VOID',
  unsafe_drive: 'VOID',
  vertex_inject: 'VOID',
  swap_inject: 'VOID',
  start_mismatch: 'VOID',
}

export interface FleetBenchReport {
  verifier: 'fleetVerify@1'
  bench: 'fleetBench@1'
  scope: string
  seed: number
  trialsPerClass: number
  classes: Record<
    FleetCorruption,
    {
      trials: number
      // Every scenario drawn for this class (completed trials + escape-hatch
      // plans + unhosted redraws) — no draw is silently discarded.
      attempts: number
      // Scenarios that could not host this corruption class (corrupt() → null).
      unhosted: number
      expected: 'VALID' | 'VOID'
      got: Partial<Record<'VALID' | 'VOID', number>>
      // null when trials === 0: 'nothing was evaluable' must never read as
      // 'caught nothing' (catchRate 0).
      catchRate: number | null
      // true when the draw cap fired before trialsPerClass completed — the
      // runner script refuses to publish such a report.
      underfilled: boolean
    }
  >
  falseVoidRate: number
  escapeHatch: { plans: number; verdicts: Partial<Record<'VALID' | 'VOID', number>>; note: string }
  digest: string
}

function mulberry(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const canonical = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map((x) => canonical(x === undefined ? null : x)).join(',')}]`
  const o = v as Record<string, unknown>
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`
}

interface Scenario {
  planInput: MultiAgentInput
  schedule: FleetScheduleInput
  fullyDeconflicted: boolean
}

/** Seeded floor + fleet → planner → schedule. Deterministic per seed. */
function genScenario(seed: number): Scenario {
  const rnd = mulberry(seed * 2246822519 + 3)
  const ri = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1))
  const width = ri(7, 12)
  const height = ri(6, 10)
  const taken = new Set<string>()
  const fresh = (): GridPos => {
    for (;;) {
      const c = { x: ri(0, width - 1), y: ri(0, height - 1) }
      const k = `${c.x},${c.y}`
      if (!taken.has(k)) {
        taken.add(k)
        return c
      }
    }
  }
  const robots = Array.from({ length: ri(2, 4) }, fresh)
  const items = Array.from({ length: ri(2, 4) }, fresh)
  const drops = [fresh()]
  const blocked = Array.from({ length: ri(0, Math.floor(width * height * 0.08)) }, fresh)
  const unsafe = Array.from({ length: ri(0, 2) }, fresh)
  const planInput: MultiAgentInput = { width, height, blocked, unsafe, robots, items, drops }
  const plan = planMultiAgent(planInput)
  return {
    planInput,
    schedule: {
      width,
      height,
      blocked,
      unsafe,
      robots: plan.robots.map((r) => ({ start: { ...r.start }, timeline: r.timeline.map((p) => ({ ...p })) })),
    },
    fullyDeconflicted: plan.fullyDeconflicted,
  }
}

/** Apply one corruption to a (deep-copied) valid schedule. Returns null when the
 *  schedule is too small to host this class (caller draws a new seed). */
function corrupt(cls: FleetCorruption, base: FleetScheduleInput, rnd: () => number): FleetScheduleInput | null {
  const s: FleetScheduleInput = JSON.parse(JSON.stringify(base)) as FleetScheduleInput
  const ri = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1))
  const robotWithMoves = (): number | null => {
    const idx = s.robots.map((r, i) => (r.timeline.length >= 3 ? i : -1)).filter((i) => i >= 0)
    return idx.length ? idx[ri(0, idx.length - 1)] : null
  }
  switch (cls) {
    case 'clean':
      return s
    case 'teleport': {
      const i = robotWithMoves()
      if (i === null) return null
      const t = ri(1, s.robots[i].timeline.length - 1)
      s.robots[i].timeline[t] = { x: (s.robots[i].timeline[t].x + 3) % s.width, y: (s.robots[i].timeline[t].y + 2) % s.height }
      return s
    }
    case 'wall_drive': {
      const i = robotWithMoves()
      if (i === null || s.blocked.length === 0) return null
      const t = ri(1, s.robots[i].timeline.length - 1)
      s.robots[i].timeline[t] = { ...s.blocked[ri(0, s.blocked.length - 1)] }
      return s
    }
    case 'unsafe_drive': {
      const i = robotWithMoves()
      if (i === null || s.unsafe.length === 0) return null
      const t = ri(1, s.robots[i].timeline.length - 1)
      s.robots[i].timeline[t] = { ...s.unsafe[ri(0, s.unsafe.length - 1)] }
      return s
    }
    case 'vertex_inject': {
      if (s.robots.length < 2) return null
      const i = 0
      const j = 1
      const t = Math.min(s.robots[i].timeline.length, s.robots[j].timeline.length) - 1
      if (t < 1) return null
      s.robots[j].timeline[t] = { ...s.robots[i].timeline[t] }
      return s
    }
    case 'swap_inject': {
      if (s.robots.length < 2) return null
      const i = 0
      const j = 1
      const t = Math.min(s.robots[i].timeline.length, s.robots[j].timeline.length) - 1
      if (t < 1) return null
      const a = s.robots[i].timeline[t - 1]
      const b = s.robots[i].timeline[t]
      if (a.x === b.x && a.y === b.y) return null // robot i waited — no edge to swap over
      s.robots[j].timeline[t - 1] = { ...b }
      s.robots[j].timeline[t] = { ...a }
      return s
    }
    case 'start_mismatch': {
      const i = ri(0, s.robots.length - 1)
      s.robots[i].start = { x: (s.robots[i].start.x + 1) % s.width, y: s.robots[i].start.y }
      // keep the timeline as-is: it now begins somewhere other than the declared start
      return s
    }
  }
}

export function runFleetBench(opts: { trialsPerClass: number; seed: number; maxDrawsPerClass?: number }): FleetBenchReport {
  const { trialsPerClass, seed } = opts
  // Safety valve: bound the redraw loop so a class no scenario can host cannot
  // spin forever. Overridable only as a test seam; the artifact script never sets it.
  const maxDraws = opts.maxDrawsPerClass ?? trialsPerClass * 200
  const classes = {} as FleetBenchReport['classes']
  let falseVoids = 0
  let cleanTrials = 0
  const escapeVerdicts: Partial<Record<'VALID' | 'VOID', number>> = {}
  let escapePlans = 0

  for (const cls of FLEET_CORRUPTIONS) {
    const got: Partial<Record<'VALID' | 'VOID', number>> = {}
    let caught = 0
    let done = 0
    let attempts = 0
    let unhosted = 0
    // The cap is checked BEFORE each draw so an unhostable class terminates
    // even when every draw redraws (the old post-trial check never ran on a
    // continue, so all-unhosted looped forever).
    while (done < trialsPerClass && attempts < maxDraws) {
      attempts += 1
      const scenario = genScenario(seed + attempts * 13 + FLEET_CORRUPTIONS.indexOf(cls) * 100003)
      if (!scenario.fullyDeconflicted) {
        // Observational lane — count once per encountered escape-hatch plan.
        escapePlans += 1
        const v = verifyFleetSchedule(scenario.schedule).verdict
        escapeVerdicts[v] = (escapeVerdicts[v] ?? 0) + 1
        continue
      }
      const rnd = mulberry(seed * 7 + attempts * 31)
      const corrupted = corrupt(cls, scenario.schedule, rnd)
      if (corrupted === null) {
        unhosted += 1 // scenario cannot host this class — draw again, but on the record
        continue
      }
      const verdict = verifyFleetSchedule(corrupted).verdict
      got[verdict] = (got[verdict] ?? 0) + 1
      if (verdict === EXPECTED[cls]) caught += 1
      if (cls === 'clean') {
        cleanTrials += 1
        if (verdict === 'VOID') falseVoids += 1
      }
      done += 1
    }
    classes[cls] = {
      trials: done,
      attempts,
      unhosted,
      expected: EXPECTED[cls],
      got,
      catchRate: done ? caught / done : null,
      underfilled: done < trialsPerClass,
    }
  }

  const body = {
    verifier: 'fleetVerify@1' as const,
    bench: 'fleetBench@1' as const,
    scope:
      'Synthetic floors; baseline schedules produced by the real planner (src/multiAgent.ts) and only fully-deconflicted plans are corrupted. Measures the deterministic fleet verifier only. Reproducible from the seed.',
    seed,
    trialsPerClass,
    classes,
    falseVoidRate: cleanTrials ? falseVoids / cleanTrials : 0,
    escapeHatch: {
      plans: escapePlans,
      verdicts: escapeVerdicts,
      note: 'Observational: schedules the planner itself flagged (fullyDeconflicted:false), judged by the independent verifier. Reported as measured — no expected verdict.',
    },
  }
  return { ...body, digest: sha256(canonical(body)) }
}
