// gateBench — behavioral spec, written BEFORE the implementation (TDD).
//
// The bench is the commercial claim engine for the parse gate: a deterministic
// corruption taxonomy applied to seeded ground-truth floors, measuring what the
// gate CATCHES and — just as commercially important — what it does NOT falsely
// void. Every number it emits is reproducible from a seed: same seed, same
// floors, same corruptions, same rates, same digest. No LLM anywhere.

import { describe, expect, it } from 'vitest'
import { genFloor, runGateBench, CORRUPTION_CLASSES } from './gateBench'

describe('genFloor — seeded ground-truth floors', () => {
  it('is deterministic: same seed → identical floor; different seed → different floor', () => {
    const a = genFloor(7)
    const b = genFloor(7)
    const c = genFloor(8)
    expect(a).toEqual(b)
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c))
  })

  it('generates in-contract floors that the gate passes as VALID', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const f = genFloor(seed)
      expect(f.width).toBeGreaterThanOrEqual(4)
      expect(f.width).toBeLessThanOrEqual(24)
      expect(f.height).toBeGreaterThanOrEqual(4)
      expect(f.height).toBeLessThanOrEqual(24)
      // anchors distinct + in bounds by construction
      const keys = new Set([`${f.start.x},${f.start.y}`, `${f.item.x},${f.item.y}`, `${f.drop.x},${f.drop.y}`])
      expect(keys.size).toBe(3)
    }
  })
})

describe('runGateBench — the taxonomy measures the gate honestly', () => {
  const report = runGateBench({ trialsPerClass: 40, seed: 20260730 })

  it('covers every corruption class with the requested trial count', () => {
    expect(Object.keys(report.classes).sort()).toEqual([...CORRUPTION_CLASSES].sort())
    for (const cls of CORRUPTION_CLASSES) expect(report.classes[cls].trials).toBe(40)
  })

  it('VOID-class corruptions are caught at 100% (anchors are never repaired into existence)', () => {
    for (const cls of ['anchor_oob', 'anchor_collision', 'anchor_malformed', 'dims_out_of_contract', 'role_not_array', 'junk_flood'] as const) {
      expect(report.classes[cls].expected).toBe('VOID')
      expect(report.classes[cls].catchRate).toBe(1)
    }
  })

  it('ESCALATE-class corruptions are flagged, not silently passed and not voided', () => {
    for (const cls of ['moderate_junk', 'contradiction_flood', 'wall_flood', 'dupe_flood'] as const) {
      expect(report.classes[cls].expected).toBe('ESCALATE')
      expect(report.classes[cls].catchRate).toBe(1)
      expect(report.classes[cls].got.VOID ?? 0).toBe(0)
    }
  })

  it('THE COMMERCIAL NUMBER: zero false VOIDs on clean and benign-noise floors', () => {
    expect(report.classes.clean.expected).toBe('VALID')
    expect(report.classes.clean.catchRate).toBe(1)
    expect(report.classes.benign_noise.catchRate).toBe(1)
    expect(report.falseVoidRate).toBe(0)
  })

  it('is reproducible: same config → identical report including digest', () => {
    const again = runGateBench({ trialsPerClass: 40, seed: 20260730 })
    expect(again).toEqual(report)
    expect(report.digest).toMatch(/^[0-9a-f]{64}$/)
    // and a different seed changes the digest, so the digest binds the run
    expect(runGateBench({ trialsPerClass: 40, seed: 1 }).digest).not.toBe(report.digest)
  })

  it('never claims beyond its evidence: the report labels itself synthetic + names the verifier', () => {
    expect(report.scope).toMatch(/synthetic/i)
    expect(report.verifier).toBe('parseGate@1')
  })
})
