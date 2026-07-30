// ----------------------------------------------------------------------------
// parseGate — the deterministic VOID/ESCALATE/VALID gate for a VLM floor parse.
//
// The grid-world sibling of site-to-gym's reconVerifier. floorValidator's
// repairSiteMap answers "give me SOME consistent map" (right for operator-drawn
// floors and defaults); this gate answers a different question: "can the model's
// OWN proposal be supported?" — and refuses to invent geometry when it can't.
//
//   VOID     — structurally unsound. An anchor (dock/pick/drop) is missing,
//              malformed, out of bounds, or coincident — repairing that means
//              fabricating a location the model never proposed. Or the geometry
//              is out of contract (dims, non-array fields, >20% junk cells).
//              No map is returned. Nothing is repaired into existence.
//   ESCALATE — usable after cleanup, but noisy enough that a human should look:
//              5–20% junk cells, ≥3 labels contradicting anchors, or a floor
//              that is mostly wall (a likely misread).
//   VALID    — sound. Small cleanups (duplicates, one-cell-one-role conflicts,
//              a single anchor contradiction) are applied and LOGGED, never hidden.
//
// Every verdict carries a receipt: SHA-256 over canonical (sorted-key) JSON of
// the raw proposal and of the receipt body, so the verdict re-verifies offline —
// the same discipline as the evidence spine. Deterministic: no clock, no RNG.
// ----------------------------------------------------------------------------

import { sha256 } from '../passport/hash'
import type { DescriptiveSiteMap } from '../workflowDraft'
import type { GridPos } from '../warehouse'

export type ParseGateVerdict = 'VALID' | 'ESCALATE' | 'VOID'

export interface ParseGateCheck {
  name: string
  pass: boolean
  detail: string
}

export interface ParseGateReceiptBody {
  kind: 'floor-parse-receipt'
  schema_version: '1.0.0'
  verifier: 'parseGate@1'
  verdict: ParseGateVerdict
  /** 0 valid · 2 anchor unsupported (would require invention) · 3 geometry out of contract · 4 escalate */
  code: number
  input_digest: string
}

export interface ParseGateReceipt extends ParseGateReceiptBody {
  receipt_digest: string
}

export interface ParseGateResult {
  verdict: ParseGateVerdict
  code: number
  checks: ParseGateCheck[]
  /** The cleaned map — null iff VOID (a voided proposal yields no floor). */
  map: DescriptiveSiteMap | null
  /** Human-readable cleanup log (dupes, role conflicts, dropped junk). */
  repairs: string[]
  /** Fraction of proposed role cells that were malformed or out of bounds. */
  droppedFraction: number
  receipt: ParseGateReceipt
}

// Perceiver contract (mirrors the parse prompt + repairSiteMap's envelope).
const MIN_DIM = 4
const MAX_DIM = 24
/** Junk-cell budget: ≤5% is noise (pass), (5%,20%] needs a human (escalate), >20% is a failed parse (void). */
const DROP_PASS = 0.05
const DROP_VOID = 0.2
/** Labels sitting on anchors: 1–2 is tolerated noise, ≥3 is a contradictory proposal. */
const CONTRADICTION_ESCALATE = 3
/** A floor that is ≥60% wall is more wall than floor — likely a misread. */
const WALL_DENSITY_ESCALATE = 0.6

// ---- canonical JSON (sorted keys) so digests are reproducible anywhere ------
const canonical = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map((x) => canonical(x === undefined ? null : x)).join(',')}]`
  const o = v as Record<string, unknown>
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`
}

const key = (p: GridPos): string => `${p.x},${p.y}`
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

function asCell(raw: unknown, w: number, h: number): GridPos | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (!isInt(o.x) || !isInt(o.y)) return null
  if (o.x < 0 || o.y < 0 || o.x >= w || o.y >= h) return null
  return { x: o.x, y: o.y }
}

function buildReceipt(verdict: ParseGateVerdict, code: number, inputDigest: string): ParseGateReceipt {
  const body: ParseGateReceiptBody = {
    kind: 'floor-parse-receipt',
    schema_version: '1.0.0',
    verifier: 'parseGate@1',
    verdict,
    code,
    input_digest: inputDigest,
  }
  return { ...body, receipt_digest: sha256(canonical(body)) }
}

/** Gate a raw VLM floor proposal. Never throws; always returns a verdict + receipt. */
export function gateParsedFloor(raw: unknown): ParseGateResult {
  const inputDigest = sha256(canonical(raw ?? null))
  const checks: ParseGateCheck[] = []
  const repairs: string[] = []
  const check = (name: string, pass: boolean, detail: string): boolean => {
    checks.push({ name, pass, detail })
    return pass
  }
  const voidOut = (code: number, droppedFraction = 0): ParseGateResult => ({
    verdict: 'VOID',
    code,
    checks,
    map: null,
    repairs,
    droppedFraction,
    receipt: buildReceipt('VOID', code, inputDigest),
  })

  // 1 — raw shape: an object with integer dims inside the Perceiver contract,
  //     and array (or absent) role fields. Out-of-contract dims are VOID, not
  //     clamped: clamping moves geometry the model actually proposed.
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    check('raw_shape', false, 'proposal is not a JSON object')
    return voidOut(3)
  }
  const o = raw as Record<string, unknown>
  if (!isInt(o.width) || !isInt(o.height) || o.width < MIN_DIM || o.width > MAX_DIM || o.height < MIN_DIM || o.height > MAX_DIM) {
    check('raw_shape', false, `width/height must be integers in ${MIN_DIM}–${MAX_DIM} (the Perceiver contract); got ${JSON.stringify(o.width)}×${JSON.stringify(o.height)}`)
    return voidOut(3)
  }
  const roleNames = ['obstacles', 'hazards', 'humanOnly'] as const
  for (const name of roleNames) {
    const v = o[name]
    if (v !== undefined && v !== null && !Array.isArray(v)) {
      check('raw_shape', false, `${name} is not an array`)
      return voidOut(3)
    }
  }
  const width = o.width
  const height = o.height
  check('raw_shape', true, `${width}×${height} grid, role fields well-typed`)

  // 2 — anchors: present, integer, in bounds, distinct. Never invented or moved.
  const anchorNames = ['start', 'item', 'drop'] as const
  const anchorRaw: Record<string, unknown> = { start: o.start, item: o.item, drop: o.drop }
  const malformedAnchors = anchorNames.filter((n) => {
    const a = anchorRaw[n]
    return a === null || typeof a !== 'object' || Array.isArray(a) || !isInt((a as Record<string, unknown>).x) || !isInt((a as Record<string, unknown>).y)
  })
  if (!check('anchors_wellformed', malformedAnchors.length === 0, malformedAnchors.length ? `missing/non-integer anchor(s): ${malformedAnchors.join(', ')} — refusing to fabricate a location` : 'dock, pick and drop all well-formed')) {
    return voidOut(2)
  }
  const anchors = anchorNames.map((n) => {
    const a = anchorRaw[n] as { x: number; y: number }
    return { name: n, x: a.x, y: a.y }
  })
  const outAnchors = anchors.filter((a) => a.x < 0 || a.y < 0 || a.x >= width || a.y >= height)
  if (!check('anchors_in_bounds', outAnchors.length === 0, outAnchors.length ? `${outAnchors.map((a) => `${a.name} at (${a.x},${a.y})`).join(', ')} outside the ${width}×${height} grid — refusing to relocate` : 'all three anchors inside the grid')) {
    return voidOut(2)
  }
  const anchorKeys = anchors.map((a) => key(a))
  const distinct = new Set(anchorKeys).size === anchors.length
  if (!check('anchors_distinct', distinct, distinct ? 'dock, pick and drop occupy three distinct cells' : 'two anchors share a cell — refusing to nudge either to a cell the model never proposed')) {
    return voidOut(2)
  }
  const anchorSet = new Set(anchorKeys)

  // 3 — role cells: drop (never clamp) malformed/out-of-bounds entries and hold
  //     the drop fraction to a budget. Dupes and one-cell-one-role conflicts are
  //     free cleanup; labels on anchors are contradictions, counted separately.
  let proposed = 0
  let droppedBad = 0
  let contradictions = 0
  const taken = new Set<string>(anchorSet)
  const cleanRole = (name: (typeof roleNames)[number]): GridPos[] => {
    const arr = o[name]
    if (arr === undefined || arr === null) {
      repairs.push(`${name} missing — treated as none.`)
      return []
    }
    const entries = arr as unknown[]
    proposed += entries.length
    const out: GridPos[] = []
    const seen = new Set<string>()
    let bad = 0
    let dupes = 0
    let conflicts = 0
    let onAnchor = 0
    for (const e of entries) {
      const cell = asCell(e, width, height)
      if (!cell) {
        bad += 1
        continue
      }
      const k = key(cell)
      if (seen.has(k)) {
        dupes += 1
        continue
      }
      seen.add(k)
      if (anchorSet.has(k)) {
        onAnchor += 1
        continue
      }
      if (taken.has(k)) {
        conflicts += 1
        continue
      }
      taken.add(k)
      out.push(cell)
    }
    droppedBad += bad
    contradictions += onAnchor
    if (bad > 0) repairs.push(`${bad} ${name} cell(s) dropped — malformed or outside the ${width}×${height} grid.`)
    if (dupes > 0) repairs.push(`${dupes} duplicate ${name} cell(s) collapsed.`)
    if (conflicts > 0) repairs.push(`${conflicts} ${name} cell(s) dropped — already labeled by another role (one cell, one role).`)
    if (onAnchor > 0) repairs.push(`${onAnchor} ${name} cell(s) dropped from an anchor cell (contradiction logged).`)
    return out
  }
  // Priority order: wall > hazard > human-only (matches floorValidator).
  const obstacles = cleanRole('obstacles')
  const hazards = cleanRole('hazards')
  const humanOnly = cleanRole('humanOnly')

  const droppedFraction = proposed > 0 ? droppedBad / proposed : 0
  const cellsOk = droppedFraction <= DROP_PASS
  check(
    'cells_in_bounds',
    cellsOk,
    cellsOk
      ? `${proposed} proposed cell(s), ${droppedBad} dropped (${Math.round(droppedFraction * 100)}%)`
      : `${droppedBad}/${proposed} proposed cell(s) malformed or out of bounds (${Math.round(droppedFraction * 100)}%)`,
  )
  if (droppedFraction > DROP_VOID) return voidOut(3, droppedFraction)

  const contradictionsOk = contradictions < CONTRADICTION_ESCALATE
  check(
    'anchor_contradictions',
    contradictionsOk,
    contradictions === 0
      ? 'no labels contradict the anchors'
      : `${contradictions} label(s) sat on anchor cells — dropped and logged${contradictionsOk ? '' : '; a proposal this contradictory needs review'}`,
  )

  const wallDensity = obstacles.length / (width * height)
  const densityOk = wallDensity < WALL_DENSITY_ESCALATE
  check(
    'density_sanity',
    densityOk,
    densityOk
      ? `${Math.round(wallDensity * 100)}% of the grid is wall`
      : `${Math.round(wallDensity * 100)}% of the grid is wall — more wall than floor, likely a misread`,
  )

  // Optional robots overlay: cleaned quietly, never affects the verdict.
  const robots = Array.isArray(o.robots)
    ? (o.robots as unknown[]).map((r) => asCell(r, width, height)).filter((c): c is GridPos => c !== null)
    : []

  const escalate = !cellsOk || !contradictionsOk || !densityOk
  const verdict: ParseGateVerdict = escalate ? 'ESCALATE' : 'VALID'
  const code = escalate ? 4 : 0
  const [start, item, drop] = anchors.map((a): GridPos => ({ x: a.x, y: a.y }))
  return {
    verdict,
    code,
    checks,
    map: { width, height, start, item, drop, obstacles, hazards, humanOnly, robots },
    repairs,
    droppedFraction,
    receipt: buildReceipt(verdict, code, inputDigest),
  }
}

/** Offline re-verification: recompute the receipt digest from its body. */
gateParsedFloor.recomputeReceiptDigest = (body: ParseGateReceiptBody): string => sha256(canonical(body))
