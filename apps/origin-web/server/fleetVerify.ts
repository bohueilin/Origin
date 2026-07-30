// ----------------------------------------------------------------------------
// fleetVerify — the deterministic judge for multi-robot schedules.
//
// src/multiAgent.ts PLANS timelines (space-time BFS with a reservation table)
// and honestly reports an escape hatch: when a leg cannot be routed under
// reservations it routes reservation-free and sets fullyDeconflicted:false.
// Until now nothing independently CHECKED a schedule — the planner graded its
// own homework. This module is the missing judge: given a floor and a set of
// per-robot timelines (from our planner, a customer's planner, or an LLM), it
// verifies, deterministically and per named check:
//
//   timeline_shape    — every robot has a timeline that begins at its start
//   bounds_and_walls  — no position out of bounds, on a wall, or in an unsafe cell
//   kinematics        — every step is a wait or one orthogonal move (no teleports)
//   vertex_conflicts  — no two robots share a cell at any tick
//   swap_conflicts    — no head-on edge exchange between consecutive ticks
//
// A robot whose timeline ends early PARKS: it occupies its final cell for the
// rest of the horizon (that is what a stopped robot does on a real floor).
// Verdict VALID/VOID + a receipt (canonical-JSON SHA-256) in the same
// discipline as parseGate. Model proposes; environment verifies — for fleets.
// ----------------------------------------------------------------------------

import type { GridPos } from '../src/warehouse.ts'
import { sha256 } from '../src/passport/hash.ts'

export interface FleetRobotSchedule {
  start: GridPos
  /** Position at each tick, tick 0 first. */
  timeline: GridPos[]
}

export interface FleetScheduleInput {
  width: number
  height: number
  /** Walls. */
  blocked: GridPos[]
  /** Hazards + human-only — cells a routed robot must never occupy. */
  unsafe: GridPos[]
  robots: FleetRobotSchedule[]
}

export interface FleetVerifyCheck {
  name: string
  pass: boolean
  detail: string
}

export interface FleetVerifyReceipt {
  kind: 'fleet-schedule-receipt'
  schema_version: '1.0.0'
  verifier: 'fleetVerify@1'
  verdict: 'VALID' | 'VOID'
  input_digest: string
  receipt_digest: string
}

export interface FleetVerifyResult {
  verdict: 'VALID' | 'VOID'
  checks: FleetVerifyCheck[]
  /** Total vertex + swap conflicts found. */
  conflicts: number
  robots: number
  ticks: number
  receipt: FleetVerifyReceipt
}

const key = (p: GridPos): string => `${p.x},${p.y}`

const canonical = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map((x) => canonical(x === undefined ? null : x)).join(',')}]`
  const o = v as Record<string, unknown>
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const isCell = (v: unknown): v is GridPos =>
  v !== null && typeof v === 'object' && isInt((v as GridPos).x) && isInt((v as GridPos).y)

export function verifyFleetSchedule(input: FleetScheduleInput): FleetVerifyResult {
  const checks: FleetVerifyCheck[] = []
  const check = (name: string, pass: boolean, detail: string): boolean => {
    checks.push({ name, pass, detail })
    return pass
  }
  const inputDigest = sha256(canonical(input ?? null))
  const finish = (conflicts: number, ticks: number): FleetVerifyResult => {
    const verdict: 'VALID' | 'VOID' = checks.every((c) => c.pass) ? 'VALID' : 'VOID'
    const body = {
      kind: 'fleet-schedule-receipt' as const,
      schema_version: '1.0.0' as const,
      verifier: 'fleetVerify@1' as const,
      verdict,
      input_digest: inputDigest,
    }
    return {
      verdict,
      checks,
      conflicts,
      robots: Array.isArray(input?.robots) ? input.robots.length : 0,
      ticks,
      receipt: { ...body, receipt_digest: sha256(canonical(body)) },
    }
  }

  // 1 — shape: the INTEGER LATTICE is the model, enforced before any other
  //     check runs. The adversarial review proved every downstream check fails
  //     OPEN on non-integer values (NaN compares false to everything; a 0.9
  //     never string-matches an integer wall key; |Δ| of a fractional step can
  //     be < 1), so a NaN/fractional timeline tunneled through walls and got a
  //     VALID receipt. Non-integer, non-finite, or structurally malformed
  //     input is VOID here, never a crash and never a pass.
  const shapeProblems: string[] = []
  if (input === null || typeof input !== 'object') shapeProblems.push('input is not an object')
  const robots = input !== null && typeof input === 'object' && Array.isArray(input.robots) ? input.robots : []
  if (input !== null && typeof input === 'object') {
    if (!isInt(input.width) || !isInt(input.height) || input.width <= 0 || input.height <= 0) shapeProblems.push('width/height must be positive integers')
    if (!Array.isArray(input.blocked)) shapeProblems.push('blocked is not an array')
    else input.blocked.forEach((c, i) => { if (!isCell(c)) shapeProblems.push(`blocked[${i}] is not an integer cell`) })
    if (!Array.isArray(input.unsafe)) shapeProblems.push('unsafe is not an array')
    else input.unsafe.forEach((c, i) => { if (!isCell(c)) shapeProblems.push(`unsafe[${i}] is not an integer cell`) })
  }
  if (robots.length === 0) shapeProblems.push('no robots in the schedule')
  robots.forEach((r, i) => {
    if (r === null || typeof r !== 'object' || !isCell(r.start)) {
      shapeProblems.push(`robot ${i}: missing/non-integer start`)
      return
    }
    if (!Array.isArray(r.timeline) || r.timeline.length === 0) {
      shapeProblems.push(`robot ${i}: empty timeline`)
      return
    }
    const badTick = r.timeline.findIndex((p) => !isCell(p))
    if (badTick >= 0) {
      shapeProblems.push(`robot ${i} tick ${badTick}: position is not an integer lattice cell — off-lattice motion is rejected, not interpolated`)
      return
    }
    if (r.timeline[0].x !== r.start.x || r.timeline[0].y !== r.start.y)
      shapeProblems.push(`robot ${i}: timeline begins at (${r.timeline[0].x},${r.timeline[0].y}), declared start is (${r.start.x},${r.start.y})`)
  })
  if (!check('timeline_shape', shapeProblems.length === 0, shapeProblems.length ? shapeProblems.slice(0, 4).join('; ') : `${robots.length} robot(s) on the integer lattice, all timelines begin at their starts`)) {
    return finish(0, 0)
  }

  const horizon = Math.max(...robots.map((r) => r.timeline.length))
  /** Position at tick t — a finished robot parks on its final cell. */
  const at = (r: FleetRobotSchedule, t: number): GridPos => r.timeline[Math.min(t, r.timeline.length - 1)]

  // 2 — bounds, walls, unsafe cells.
  const solid = new Set(input.blocked.map(key))
  const unsafe = new Set(input.unsafe.map(key))
  const cellProblems: string[] = []
  robots.forEach((r, i) => {
    r.timeline.forEach((p, t) => {
      if (p.x < 0 || p.y < 0 || p.x >= input.width || p.y >= input.height) cellProblems.push(`robot ${i} tick ${t}: (${p.x},${p.y}) out of bounds`)
      else if (solid.has(key(p))) cellProblems.push(`robot ${i} tick ${t}: on a wall at (${p.x},${p.y})`)
      else if (unsafe.has(key(p))) cellProblems.push(`robot ${i} tick ${t}: in an unsafe cell at (${p.x},${p.y})`)
    })
  })
  check('bounds_and_walls', cellProblems.length === 0, cellProblems.length ? `${cellProblems.length} violation(s): ${cellProblems.slice(0, 3).join('; ')}` : 'every position in bounds, off walls, out of unsafe cells')

  // 3 — kinematics: wait or one orthogonal step.
  const kinProblems: string[] = []
  robots.forEach((r, i) => {
    for (let t = 1; t < r.timeline.length; t += 1) {
      const a = r.timeline[t - 1]
      const b = r.timeline[t]
      const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
      if (d > 1) kinProblems.push(`robot ${i} tick ${t}: (${a.x},${a.y})→(${b.x},${b.y}) is not a wait or single orthogonal step`)
    }
  })
  check('kinematics', kinProblems.length === 0, kinProblems.length ? `${kinProblems.length} violation(s): ${kinProblems.slice(0, 3).join('; ')}` : 'every step is a wait or one orthogonal move')

  // 4 — vertex conflicts across the padded horizon (parked robots still occupy).
  let vertexConflicts = 0
  const vertexExamples: string[] = []
  for (let t = 0; t < horizon; t += 1) {
    const seen = new Map<string, number>()
    robots.forEach((r, i) => {
      const p = at(r, t)
      const k = key(p)
      const prev = seen.get(k)
      if (prev !== undefined) {
        vertexConflicts += 1
        if (vertexExamples.length < 3) vertexExamples.push(`tick ${t}: robots ${prev} and ${i} both at (${p.x},${p.y})`)
      } else {
        seen.set(k, i)
      }
    })
  }
  check('vertex_conflicts', vertexConflicts === 0, vertexConflicts ? `${vertexConflicts} conflict(s): ${vertexExamples.join('; ')}` : 'no two robots share a cell at any tick')

  // 5 — swap conflicts (head-on exchange a↔b between t-1 and t).
  let swapConflicts = 0
  const swapExamples: string[] = []
  for (let t = 1; t < horizon; t += 1) {
    for (let i = 0; i < robots.length; i += 1) {
      for (let j = i + 1; j < robots.length; j += 1) {
        const ai = at(robots[i], t - 1)
        const bi = at(robots[i], t)
        const aj = at(robots[j], t - 1)
        const bj = at(robots[j], t)
        if (ai.x === bj.x && ai.y === bj.y && aj.x === bi.x && aj.y === bi.y && (ai.x !== bi.x || ai.y !== bi.y)) {
          swapConflicts += 1
          if (swapExamples.length < 3) swapExamples.push(`tick ${t}: robots ${i} and ${j} swap (${ai.x},${ai.y})↔(${aj.x},${aj.y})`)
        }
      }
    }
  }
  check('swap_conflicts', swapConflicts === 0, swapConflicts ? `${swapConflicts} swap(s): ${swapExamples.join('; ')}` : 'no head-on exchanges')

  return finish(vertexConflicts + swapConflicts, horizon)
}
