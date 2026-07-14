// opsMetrics — a VERIFIED fleet-operations layer on top of the warehouse sim. Clean-room;
// inspired by the "Worksite" fleet-metrics concept (see docs/PRIOR_ART.md). Worksite's three
// metrics — fleet utilization, peak-simultaneous activity, collision events — reward a trained
// RL coordinator. Ours turn the SAME metrics into a DETERMINISTIC, signed operations SLA: a
// fleet earns an RSL-style readiness credential only if it clears utilization / fulfilment /
// zero-collision targets under Origin's oracle across a multi-wave shift, and that credential
// re-verifies offline on /verify. No learned/VLA result is claimed — the metrics are computed
// deterministically from the verified run, not a trained model.
import { buildWarehouseScene, simulate, type SimResult } from './warehouseSim'

export interface FleetMetrics {
  fleet_utilization: number // share of active agent×tick slots spent MOVING (Worksite's def)
  peak_simultaneous: number // max robots moving in a single tick (parallelism)
  collision_events: number // 0 — the safety invariant of the verified coordinator
  orders_fulfilled: number
  orders_total: number
  fulfilment_rate: number
  throughput_per_100_ticks: number
  human_yields: number
  robot_yields: number
  ticks: number
}

const cellEq = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x === b.x && a.y === b.y

// Compute the ops metrics deterministically from a single verified run's frames.
export function fleetMetrics(result: SimResult): FleetMetrics {
  let actingSlots = 0
  let activeSlots = 0
  let peak = 0
  for (let t = 1; t < result.frames.length; t += 1) {
    const prev = result.frames[t - 1]
    const cur = result.frames[t]
    let movingThisTick = 0
    for (let r = 0; r < cur.robots.length; r += 1) {
      const rc = cur.robots[r]
      if (rc.done) continue
      activeSlots += 1
      if (!cellEq(rc.pos, prev.robots[r].pos)) {
        actingSlots += 1
        movingThisTick += 1
      }
    }
    if (movingThisTick > peak) peak = movingThisTick
  }
  const ticks = result.frames.length
  return {
    fleet_utilization: activeSlots ? round4(actingSlots / activeSlots) : 0,
    peak_simultaneous: peak,
    collision_events: result.score.collisions, // 0 by construction
    orders_fulfilled: result.score.orders_fulfilled,
    orders_total: result.score.orders_total,
    fulfilment_rate: result.score.orders_total ? round4(result.score.orders_fulfilled / result.score.orders_total) : 0,
    throughput_per_100_ticks: ticks ? round4((result.score.orders_fulfilled / ticks) * 100) : 0,
    human_yields: result.score.human_yields,
    robot_yields: result.score.robot_yields,
    ticks,
  }
}

export interface WaveSummary {
  wave: number
  seed: number
  verdict: SimResult['verdict']
  metrics: FleetMetrics
}

export interface ShiftResult {
  waves: WaveSummary[]
  robots: number
  totals: {
    waves: number
    orders_fulfilled: number
    orders_total: number
    fulfilment_rate: number
    avg_utilization: number
    peak_simultaneous: number
    collision_events: number
    verdicts: Record<string, number>
    total_ticks: number
    throughput_per_100_ticks: number
  }
}

// A "shift": run the fleet across several waves of orders (each a fresh, seeded layout) and
// aggregate the ops metrics — the operations-dashboard timeseries. Deterministic.
export function runShift(baseSeed: number, waves: number, robots: number): ShiftResult {
  const w: WaveSummary[] = []
  const verdicts: Record<string, number> = { finish: 0, escalate: 0, refuse: 0 }
  let of = 0
  let ot = 0
  let ticks = 0
  let utilSum = 0
  let peak = 0
  let collisions = 0
  for (let i = 0; i < Math.max(1, waves); i += 1) {
    const seed = (baseSeed + i * 1013 + 7) >>> 0
    const scene = buildWarehouseScene({ seed, robots })
    const result = simulate(scene)
    const m = fleetMetrics(result)
    w.push({ wave: i + 1, seed, verdict: result.verdict, metrics: m })
    verdicts[result.verdict] += 1
    of += m.orders_fulfilled
    ot += m.orders_total
    ticks += m.ticks
    utilSum += m.fleet_utilization
    peak = Math.max(peak, m.peak_simultaneous)
    collisions += m.collision_events
  }
  return {
    waves: w,
    robots,
    totals: {
      waves: w.length,
      orders_fulfilled: of,
      orders_total: ot,
      fulfilment_rate: ot ? round4(of / ot) : 0,
      avg_utilization: round4(utilSum / w.length),
      peak_simultaneous: peak,
      collision_events: collisions,
      verdicts,
      total_ticks: ticks,
      throughput_per_100_ticks: ticks ? round4((of / ticks) * 100) : 0,
    },
  }
}

export interface OpsTargets {
  min_utilization: number // e.g. 0.55
  min_fulfilment: number // e.g. 0.95
  max_collisions: number // 0
}

export const DEFAULT_TARGETS: OpsTargets = { min_utilization: 0.5, min_fulfilment: 0.95, max_collisions: 0 }

export interface OpsCredential {
  kind: 'fleet-operations-sla'
  passed: boolean
  rsl_level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4'
  reason: string
  targets: OpsTargets
  metrics: ShiftResult['totals']
  robots: number
  digest_input: unknown // canonical object to hash into a signed credential (bound on /verify)
}

// The deterministic operations-SLA verifier — the oracle for a whole shift. A catastrophic
// safety event (a refused wave or any collision) hard-caps the level; ops targets set the rest.
export function verifyOperations(shift: ShiftResult, targets: OpsTargets = DEFAULT_TARGETS): OpsCredential {
  const t = shift.totals
  let passed: boolean
  let level: OpsCredential['rsl_level']
  let reason: string

  if (t.collision_events > targets.max_collisions) {
    passed = false
    level = 'L0'
    reason = `${t.collision_events} collision event(s) — a safety violation hard-caps the fleet at L0.`
  } else if (t.verdicts.refuse > 0) {
    passed = false
    level = 'L1'
    reason = `${t.verdicts.refuse} wave(s) required an unsafe order the oracle refuses — capped at L1.`
  } else if (t.fulfilment_rate < targets.min_fulfilment) {
    passed = false
    level = 'L2'
    reason = `Safe (0 collisions) but fulfilment ${pct(t.fulfilment_rate)} < target ${pct(targets.min_fulfilment)} — a human coordinator is required.`
  } else if (t.avg_utilization < targets.min_utilization) {
    passed = false
    level = 'L2'
    reason = `Safe and orders met, but fleet utilization ${pct(t.avg_utilization)} < target ${pct(targets.min_utilization)} — under-utilized.`
  } else {
    passed = true
    level = t.avg_utilization >= 0.7 ? 'L4' : 'L3'
    reason = `Cleared every target — 0 collisions, ${pct(t.fulfilment_rate)} fulfilment, ${pct(t.avg_utilization)} utilization across ${t.waves} waves. Reproducible under this verifier.`
  }

  return {
    kind: 'fleet-operations-sla',
    passed,
    rsl_level: level,
    reason,
    targets,
    metrics: t,
    robots: shift.robots,
    digest_input: {
      kind: 'fleet-operations-sla',
      robots: shift.robots,
      targets,
      totals: t,
      per_wave: shift.waves.map((w) => ({ wave: w.wave, seed: w.seed, verdict: w.verdict, utilization: w.metrics.fleet_utilization, orders: `${w.metrics.orders_fulfilled}/${w.metrics.orders_total}` })),
      rsl_level: level,
      passed,
    },
  }
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4
const pct = (x: number) => `${Math.round(x * 100)}%`
