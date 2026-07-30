// ----------------------------------------------------------------------------
// gateBench — deterministic corruption benchmark for the floor-parse gate.
//
// The commercial question a buyer asks about parseGate is not "does it have
// tests" but "what does it catch, at what rate, and does it ever void a good
// parse?" This module answers with NUMBERS, reproducibly: seeded ground-truth
// floors, a taxonomy of eleven corruption classes with known expected verdicts,
// and per-class catch rates. Everything is derived from a seed — no clock, no
// RNG, no LLM — so the published report re-verifies from source, and the run is
// pinned by a canonical-JSON SHA-256 digest.
//
// Scope, stated plainly: floors are SYNTHETIC (procedurally generated), and the
// bench measures the GATE's discrimination — not the vision model's accuracy.
// (That is scripts/perceiver-bench.mjs, which needs a live model.)
// ----------------------------------------------------------------------------

import { sha256 } from '../src/passport/hash.ts'
import { gateParsedFloor, type ParseGateVerdict } from '../src/foundry/parseGate.ts'

export interface BenchFloor {
  width: number
  height: number
  start: { x: number; y: number }
  item: { x: number; y: number }
  drop: { x: number; y: number }
  obstacles: { x: number; y: number }[]
  hazards: { x: number; y: number }[]
  humanOnly: { x: number; y: number }[]
}

export const CORRUPTION_CLASSES = [
  'clean',
  'benign_noise',
  'anchor_oob',
  'anchor_collision',
  'anchor_malformed',
  'dims_out_of_contract',
  'role_not_array',
  'junk_flood',
  'moderate_junk',
  'contradiction_flood',
  'wall_flood',
  'dupe_flood',
] as const
export type CorruptionClass = (typeof CORRUPTION_CLASSES)[number]

const EXPECTED: Record<CorruptionClass, ParseGateVerdict> = {
  clean: 'VALID',
  benign_noise: 'VALID',
  anchor_oob: 'VOID',
  anchor_collision: 'VOID',
  anchor_malformed: 'VOID',
  dims_out_of_contract: 'VOID',
  role_not_array: 'VOID',
  junk_flood: 'VOID',
  moderate_junk: 'ESCALATE',
  contradiction_flood: 'ESCALATE',
  wall_flood: 'ESCALATE',
  dupe_flood: 'ESCALATE',
}

export interface BenchClassResult {
  trials: number
  expected: ParseGateVerdict
  got: Partial<Record<ParseGateVerdict, number>>
  catchRate: number
}

export interface GateBenchReport {
  verifier: 'parseGate@1'
  bench: 'gateBench@1'
  scope: string
  seed: number
  trialsPerClass: number
  classes: Record<CorruptionClass, BenchClassResult>
  /** Fraction of clean + benign_noise trials the gate wrongly VOIDed. Must be 0. */
  falseVoidRate: number
  digest: string
}

// ---- seeded PRNG (mulberry32) — determinism is the whole point --------------
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

/** Deterministic in-contract ground-truth floor for a seed. Always gate-VALID. */
export function genFloor(seed: number): BenchFloor {
  const rnd = mulberry(seed * 2654435761 + 1)
  const ri = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1))
  const width = ri(6, 16)
  const height = ri(6, 16)
  const taken = new Set<string>()
  const freshCell = (): { x: number; y: number } => {
    for (;;) {
      const c = { x: ri(0, width - 1), y: ri(0, height - 1) }
      const k = `${c.x},${c.y}`
      if (!taken.has(k)) {
        taken.add(k)
        return c
      }
    }
  }
  const start = freshCell()
  const item = freshCell()
  const drop = freshCell()
  const role = (count: number): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = []
    for (let i = 0; i < count; i += 1) out.push(freshCell())
    return out
  }
  // Densities stay far inside the gate's ESCALATE thresholds by construction.
  const cells = width * height
  return {
    width,
    height,
    start,
    item,
    drop,
    obstacles: role(ri(0, Math.floor(cells * 0.12))),
    hazards: role(ri(0, Math.floor(cells * 0.05))),
    humanOnly: role(ri(0, Math.floor(cells * 0.04))),
  }
}

type Raw = Record<string, unknown>

/** Apply one corruption class to a clean floor. Deterministic per (floor, rnd). */
function corrupt(cls: CorruptionClass, floor: BenchFloor, rnd: () => number): unknown {
  const ri = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1))
  const raw: Raw = JSON.parse(JSON.stringify(floor)) as Raw
  const anchors = ['start', 'item', 'drop'] as const
  switch (cls) {
    case 'clean':
      return raw
    case 'benign_noise': {
      // Duplicates, one cross-role conflict, one anchor contradiction, tiny junk —
      // everything the gate must tolerate (logged, never voided).
      const obs = raw.obstacles as { x: number; y: number }[]
      if (obs.length > 0) obs.push({ ...obs[0] })
      obs.push({ ...(raw.item as { x: number; y: number }) })
      const haz = raw.hazards as { x: number; y: number }[]
      if (obs.length > 1) haz.push({ ...obs[1] })
      return raw
    }
    case 'anchor_oob': {
      const which = anchors[ri(0, 2)]
      raw[which] = { x: (raw.width as number) + ri(1, 40), y: ri(0, (raw.height as number) - 1) }
      return raw
    }
    case 'anchor_collision': {
      raw.drop = { ...(raw.item as object) }
      return raw
    }
    case 'anchor_malformed': {
      const which = anchors[ri(0, 2)]
      raw[which] = ri(0, 1) === 0 ? undefined : { x: ri(0, 3) + 0.5, y: 1 }
      return raw
    }
    case 'dims_out_of_contract': {
      raw.width = ri(0, 1) === 0 ? ri(25, 64) : ri(0, 3)
      return raw
    }
    case 'role_not_array': {
      raw.obstacles = 'walls everywhere'
      return raw
    }
    case 'junk_flood': {
      // Push the malformed fraction decisively past the 20% VOID budget — AND
      // pad with duplicates of one valid cell. The adversarial review proved
      // dupe padding diluted the old budget to a false VALID; this class now
      // pins the fix: duplicates must never rescue a junk flood.
      const obs = raw.obstacles as unknown[]
      const good = (raw.obstacles as unknown[]).length + (raw.hazards as unknown[]).length + (raw.humanOnly as unknown[]).length
      const junk = Math.max(3, Math.ceil(good * 0.5) + 2)
      for (let i = 0; i < junk; i += 1) obs.push({ x: 100 + i, y: 100 + i })
      const pad = ri(0, 1) === 0 ? junk * 40 : 0 // half the trials attempt the dilution attack
      for (let i = 0; i < pad; i += 1) obs.push({ x: 0, y: 0 })
      return raw
    }
    case 'dupe_flood': {
      // Degenerate repetition alone: hundreds of copies of one in-bounds cell.
      const obs = raw.obstacles as unknown[]
      const copies = ri(50, 400)
      for (let i = 0; i < copies; i += 1) obs.push({ x: 0, y: 0 })
      return raw
    }
    case 'moderate_junk': {
      // Land the bad fraction inside (5%, 20%]: pad the good pool to a known
      // size, then add exactly ~10% junk.
      const obs = raw.obstacles as { x: number; y: number }[]
      const w = raw.width as number
      const h = raw.height as number
      const seen = new Set<string>(
        [...(raw.obstacles as { x: number; y: number }[]), ...(raw.hazards as { x: number; y: number }[]), ...(raw.humanOnly as { x: number; y: number }[]), raw.start as { x: number; y: number }, raw.item as { x: number; y: number }, raw.drop as { x: number; y: number }].map((c) => `${c.x},${c.y}`),
      )
      let padded = 0
      for (let y = 0; y < h && padded < 27; y += 1) {
        for (let x = 0; x < w && padded < 27; x += 1) {
          const k = `${x},${y}`
          if (seen.has(k)) continue
          // Cap wall density under the 60% escalate threshold.
          if (obs.length >= Math.floor(w * h * 0.5)) break
          seen.add(k)
          obs.push({ x, y })
          padded += 1
        }
      }
      const good = obs.length + (raw.hazards as unknown[]).length + (raw.humanOnly as unknown[]).length
      const junk = Math.max(2, Math.floor(good * 0.1))
      for (let i = 0; i < junk; i += 1) obs.push({ x: 200 + i, y: 200 + i })
      return raw
    }
    case 'contradiction_flood': {
      const obs = raw.obstacles as { x: number; y: number }[]
      obs.push({ ...(raw.start as { x: number; y: number }) }, { ...(raw.item as { x: number; y: number }) }, { ...(raw.drop as { x: number; y: number }) })
      return raw
    }
    case 'wall_flood': {
      const w = raw.width as number
      const h = raw.height as number
      const anchorsSet = new Set(
        [raw.start as { x: number; y: number }, raw.item as { x: number; y: number }, raw.drop as { x: number; y: number }].map((c) => `${c.x},${c.y}`),
      )
      const obs: { x: number; y: number }[] = []
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          if (anchorsSet.has(`${x},${y}`)) continue
          if (obs.length >= Math.ceil(w * h * 0.7)) break
          obs.push({ x, y })
        }
      }
      raw.obstacles = obs
      raw.hazards = []
      raw.humanOnly = []
      return raw
    }
  }
}

export function runGateBench(opts: { trialsPerClass: number; seed: number }): GateBenchReport {
  const { trialsPerClass, seed } = opts
  const classes = {} as Record<CorruptionClass, BenchClassResult>
  let falseVoids = 0
  let benignTrials = 0
  for (const cls of CORRUPTION_CLASSES) {
    const got: Partial<Record<ParseGateVerdict, number>> = {}
    let caught = 0
    for (let t = 0; t < trialsPerClass; t += 1) {
      const floor = genFloor(seed + t)
      const rnd = mulberry(seed * 31 + t * 7 + CORRUPTION_CLASSES.indexOf(cls))
      const raw = corrupt(cls, floor, rnd)
      const verdict = gateParsedFloor(raw).verdict
      got[verdict] = (got[verdict] ?? 0) + 1
      if (verdict === EXPECTED[cls]) caught += 1
      if ((cls === 'clean' || cls === 'benign_noise') && verdict === 'VOID') falseVoids += 1
      if (cls === 'clean' || cls === 'benign_noise') benignTrials += 1
    }
    classes[cls] = { trials: trialsPerClass, expected: EXPECTED[cls], got, catchRate: caught / trialsPerClass }
  }
  const body = {
    verifier: 'parseGate@1' as const,
    bench: 'gateBench@1' as const,
    scope:
      'Synthetic floors, procedurally generated from the seed below. Measures the deterministic gate\'s discrimination only — not the vision model. Reproducible: same seed, same numbers.',
    seed,
    trialsPerClass,
    classes,
    falseVoidRate: benignTrials ? falseVoids / benignTrials : 0,
  }
  return { ...body, digest: sha256(canonical(body)) }
}
