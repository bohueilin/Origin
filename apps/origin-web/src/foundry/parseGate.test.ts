// parseGate — behavioral spec, written BEFORE the implementation (TDD).
//
// The gate is the grid-world sibling of site-to-gym's reconVerifier: the VLM
// PROPOSES a floor; this deterministic gate decides whether that proposal can be
// SUPPORTED, instead of silently repairing it into something plausible.
//   VOID     — the proposal is structurally unsound (an anchor would have to be
//              invented/moved, or the geometry is out of contract). No map is returned.
//   ESCALATE — usable after cleanup, but noisy enough that a human should look.
//   VALID    — sound; small cleanups (dupes, role conflicts) are logged, never hidden.
// Every verdict carries a receipt (canonical-JSON SHA-256) that re-verifies offline.

import { describe, expect, it } from 'vitest'
import { gateParsedFloor, type ParseGateResult } from './parseGate'

/** A clean 8×8 proposal — dock, pick, drop and a few labeled cells, all in bounds. */
const clean = () => ({
  width: 8,
  height: 8,
  start: { x: 4, y: 7 },
  item: { x: 1, y: 3 },
  drop: { x: 6, y: 3 },
  obstacles: [{ x: 2, y: 2 }, { x: 5, y: 5 }],
  hazards: [{ x: 3, y: 4 }],
  humanOnly: [{ x: 6, y: 6 }],
})

const failed = (r: ParseGateResult): string[] => r.checks.filter((c) => !c.pass).map((c) => c.name)

describe('gateParsedFloor — VALID', () => {
  it('passes a clean proposal untouched: all checks pass, map returned, nothing dropped', () => {
    const r = gateParsedFloor(clean())
    expect(r.verdict).toBe('VALID')
    expect(r.code).toBe(0)
    expect(failed(r)).toEqual([])
    expect(r.map).not.toBeNull()
    expect(r.map?.width).toBe(8)
    expect(r.map?.obstacles).toHaveLength(2)
    expect(r.droppedFraction).toBe(0)
    expect(r.repairs).toEqual([])
  })

  it('tolerates dupes and cross-role conflicts as LOGGED cleanup, not a verdict change', () => {
    const raw = clean()
    raw.obstacles.push({ ...raw.obstacles[0] }) // duplicate wall
    raw.hazards.push({ ...raw.obstacles[1] }) // hazard on a wall cell — one cell, one role
    const r = gateParsedFloor(raw)
    expect(r.verdict).toBe('VALID')
    expect(r.map?.obstacles).toHaveLength(2) // dupe collapsed
    expect(r.map?.hazards).toHaveLength(1) // wall wins the conflicted cell
    expect(r.repairs.length).toBeGreaterThan(0) // …and both cleanups are on the record
  })

  it('tolerates ONE label sitting on an anchor (noise), drops it, and logs it', () => {
    const raw = clean()
    raw.obstacles.push({ ...raw.item }) // a wall on the pick cell — contradiction, but only one
    const r = gateParsedFloor(raw)
    expect(r.verdict).toBe('VALID')
    expect(r.map?.obstacles).toHaveLength(2)
    expect(r.repairs.join(' ')).toMatch(/anchor/i)
  })
})

describe('gateParsedFloor — VOID (anchor class, code 2): anchors are never invented or moved', () => {
  it('voids an out-of-bounds dock instead of relocating it', () => {
    const raw = { ...clean(), start: { x: 99, y: 1 } }
    const r = gateParsedFloor(raw)
    expect(r.verdict).toBe('VOID')
    expect(r.code).toBe(2)
    expect(r.map).toBeNull()
    expect(failed(r)).toContain('anchors_in_bounds')
  })

  it('voids coincident item/drop instead of nudging one to a cell the model never proposed', () => {
    const raw = { ...clean(), drop: { x: 1, y: 3 } } // === item
    const r = gateParsedFloor(raw)
    expect(r.verdict).toBe('VOID')
    expect(r.code).toBe(2)
    expect(r.map).toBeNull()
    expect(failed(r)).toContain('anchors_distinct')
  })

  it('voids a missing or non-integer anchor instead of fabricating one', () => {
    expect(gateParsedFloor({ ...clean(), drop: undefined }).verdict).toBe('VOID')
    const r = gateParsedFloor({ ...clean(), item: { x: 3.7, y: 2 } })
    expect(r.verdict).toBe('VOID')
    expect(r.code).toBe(2)
    expect(failed(r)).toContain('anchors_wellformed')
  })
})

describe('gateParsedFloor — VOID (geometry class, code 3)', () => {
  it('voids non-object input', () => {
    for (const bad of [null, undefined, 'hi', 42, []]) {
      const r = gateParsedFloor(bad)
      expect(r.verdict).toBe('VOID')
      expect(r.code).toBe(3)
      expect(r.map).toBeNull()
      expect(failed(r)).toContain('raw_shape')
    }
  })

  it('voids out-of-contract dimensions (the Perceiver contract is a 4–24 grid) instead of clamping', () => {
    const r = gateParsedFloor({ ...clean(), width: 30 })
    expect(r.verdict).toBe('VOID')
    expect(r.code).toBe(3)
    expect(failed(r)).toContain('raw_shape')
    expect(r.checks.find((c) => c.name === 'raw_shape')?.detail).toMatch(/4.24|contract/i)
  })

  it('voids a non-array cell field', () => {
    const r = gateParsedFloor({ ...clean(), obstacles: 'walls everywhere' })
    expect(r.verdict).toBe('VOID')
    expect(r.code).toBe(3)
  })

  it('voids when more than 20% of proposed cells are malformed or out of bounds', () => {
    const raw = clean()
    // 4 good cells proposed above; add 4 bad ones → 50% bad, way over the 20% budget.
    raw.obstacles.push({ x: 88, y: 1 }, { x: -2, y: 3 }, { x: 1.5, y: 1 } as never, 'junk' as never)
    const r = gateParsedFloor(raw)
    expect(r.verdict).toBe('VOID')
    expect(r.code).toBe(3)
    expect(failed(r)).toContain('cells_in_bounds')
    expect(r.droppedFraction).toBeGreaterThan(0.2)
  })
})

describe('gateParsedFloor — ESCALATE (code 4): usable, but a human should look', () => {
  it('escalates a moderate bad-cell fraction (5–20%], returning the cleaned map', () => {
    const raw = clean()
    // 16 good cells + 2 bad = 2/18 ≈ 11% dropped.
    for (let i = 0; i < 12; i += 1) raw.obstacles.push({ x: i % 8, y: i < 8 ? 0 : 1 })
    raw.obstacles.push({ x: 50, y: 50 }, { x: 51, y: 51 })
    const r = gateParsedFloor(raw)
    expect(r.verdict).toBe('ESCALATE')
    expect(r.code).toBe(4)
    expect(r.map).not.toBeNull()
    expect(r.droppedFraction).toBeGreaterThan(0.05)
    expect(r.droppedFraction).toBeLessThanOrEqual(0.2)
  })

  it('escalates three or more labels sitting on anchors (a contradictory proposal)', () => {
    const raw = clean()
    raw.obstacles.push({ ...raw.start }, { ...raw.item }, { ...raw.drop })
    const r = gateParsedFloor(raw)
    expect(r.verdict).toBe('ESCALATE')
    expect(failed(r)).toContain('anchor_contradictions')
    expect(r.map?.obstacles).toHaveLength(2) // the contradictions were dropped, not kept
  })

  it('escalates a floor that is mostly wall (≥60% blocked — likely a misread)', () => {
    const raw = clean()
    raw.obstacles = []
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
      const isAnchor = (x === 4 && y === 7) || (x === 1 && y === 3) || (x === 6 && y === 3)
      if (!isAnchor && raw.obstacles.length < 40) raw.obstacles.push({ x, y })
    }
    raw.hazards = []
    raw.humanOnly = []
    const r = gateParsedFloor(raw)
    expect(r.verdict).toBe('ESCALATE')
    expect(failed(r)).toContain('density_sanity')
  })
})

describe('gateParsedFloor — receipt: deterministic and offline re-verifiable', () => {
  it('emits stable digests: same input → same receipt; different input → different input digest', () => {
    const a = gateParsedFloor(clean())
    const b = gateParsedFloor(clean())
    const c = gateParsedFloor({ ...clean(), width: 9, height: 9 })
    expect(a.receipt.input_digest).toMatch(/^[0-9a-f]{64}$/)
    expect(a.receipt.receipt_digest).toMatch(/^[0-9a-f]{64}$/)
    expect(a.receipt.input_digest).toBe(b.receipt.input_digest)
    expect(a.receipt.receipt_digest).toBe(b.receipt.receipt_digest)
    expect(a.receipt.input_digest).not.toBe(c.receipt.input_digest)
  })

  it('key order does not change the input digest (canonical JSON)', () => {
    const shuffled = { height: 8, humanOnly: [{ y: 6, x: 6 }], hazards: [{ y: 4, x: 3 }], drop: { y: 3, x: 6 }, obstacles: [{ y: 2, x: 2 }, { y: 5, x: 5 }], item: { y: 3, x: 1 }, start: { y: 7, x: 4 }, width: 8 }
    expect(gateParsedFloor(shuffled).receipt.input_digest).toBe(gateParsedFloor(clean()).receipt.input_digest)
  })

  it('the receipt digest re-verifies: recomputing over the receipt body reproduces receipt_digest', () => {
    const r = gateParsedFloor(clean())
    const { receipt_digest, ...body } = r.receipt
    expect(gateParsedFloor.recomputeReceiptDigest(body)).toBe(receipt_digest)
  })

  it('verdict inside the receipt matches the top-level verdict', () => {
    const v = gateParsedFloor({ ...clean(), start: { x: 99, y: 0 } })
    expect(v.receipt.verdict).toBe('VOID')
    expect(v.receipt.code).toBe(v.code)
  })
})
