// Golden digest-stability gate for the packages/ extraction (Week 2 · REVIEW_MASTER T2).
// =============================================================================
// These hex values were captured by running the PRE-EXTRACTION code at
// apps/origin-web/rlkit/env-evidence.mjs (2026-07-07, Node 22) on fixed inputs.
// The extraction to @origin/evidence is byte-preserving for every committed
// digest, so these goldens MUST reproduce forever. If this test fails, the
// evidence core's observable behavior moved — that is a governance event
// (a WORLD/verifier version bump), never a silent edit.
// =============================================================================
import { describe, it, expect } from 'vitest'
import { canonical, sha256, chainEpisode, verifyChain, bundleDigest } from './env-evidence.mjs'

describe('digest stability across the rlkit → @origin/evidence extraction', () => {
  it('canonical + sha256 reproduce the pre-extraction goldens', () => {
    expect(canonical({ b: 1, a: [2, { d: null, c: 'x' }] })).toBe('{"a":[2,{"c":"x","d":null}],"b":1}')
    expect(sha256(canonical({ b: 1, a: [2, { d: null, c: 'x' }] }))).toBe(
      '41f05899d3459a3ecc94ff088afcd290b9ae4f51dc9ddaa35a82a642ddb55070',
    )
    // DET-1 stays fixed: undefined-valued keys are omitted (JSON.stringify semantics).
    expect(canonical({ a: undefined, b: 1 })).toBe('{"b":1}')
  })

  it('chainEpisode reproduces the pre-extraction final_digest + log_digest', () => {
    const header = {
      trace_schema_version: '1.0.0',
      episode_id: 'ep_golden_001',
      env_bundle_digest: 'e'.repeat(64),
      policy_version: 'golden-policy@1',
      verifier_version: 'wh-verifier@9.9.9',
      seed: 1337,
      task: { id: 'golden-task', level: 'L2', seed: 1337, width: 4, height: 3 },
    }
    const steps = [
      { event_type: 'episode.started', payload: { task_id: 'golden-task', level: 'L2', seed: 1337, oracle_label: 'finish' } },
      { event_type: 'action.applied', step_index: 0, payload: { action: 'move:east' } },
      { event_type: 'action.applied', step_index: 1, payload: { action: 'pick' } },
      { event_type: 'reward.computed', payload: { reward: 1, passed: true, category: 'success', outcome: 'delivered', shaped_bonus: 0.25 } },
    ]
    const trace = chainEpisode(header, steps)
    expect(trace.final_digest).toBe('049b448dce05ff28c5d2ae9a6314f6e4ab4bf43955c2daade9abd41b8704e787')
    expect(trace.log_digest).toBe('b78512d42ca538cf8e6ad3907ab49f9aa91f449b5ca140ba7759ffc9ac929b88')
    expect(verifyChain(trace)).toEqual({ ok: true, failures: [] })
  })

  it('bundleDigest still excludes created_at + env_bundle_digest', () => {
    expect(
      bundleDigest({ name: 'golden-env', verifier: { verifier_version: 'v1' }, created_at: 'IGNORED', env_bundle_digest: 'IGNORED' }),
    ).toBe('b9f599f5f17359af44e3ec39db66a148fd8e92790508f67f75b20a795a33a5f6')
  })
})

// DET-2: canonical() must honor toJSON (so Date does not collapse to {} and
// collide) and must fail closed on Map/Set — and, for any JSON-safe value, it
// must reproduce an independent "sort keys deeply, then JSON.stringify" reference.
describe('canonical() — toJSON / Date / Map property gate (DET-2)', () => {
  // Independent reference: deep-sort object keys, honor toJSON, then JSON.stringify.
  const sortDeep = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortDeep)
    if (v && typeof v === 'object') {
      const withToJson = v as { toJSON?: () => unknown }
      if (typeof withToJson.toJSON === 'function') return sortDeep(withToJson.toJSON())
      const o: Record<string, unknown> = {}
      for (const k of Object.keys(v).sort()) o[k] = sortDeep((v as Record<string, unknown>)[k])
      return o
    }
    return v
  }
  const ref = (v: unknown) => JSON.stringify(sortDeep(v))

  it('distinct Dates no longer collide (the confirmed collision bug)', () => {
    const a = canonical({ ts: new Date('2020-01-01T00:00:00.000Z'), reward: 1 })
    const b = canonical({ ts: new Date('2099-12-31T00:00:00.000Z'), reward: 1 })
    expect(a).not.toBe(b)
    expect(sha256(a)).not.toBe(sha256(b))
    // and each matches JSON.stringify's Date handling exactly
    expect(a).toBe(ref({ ts: new Date('2020-01-01T00:00:00.000Z'), reward: 1 }))
    expect(canonical({ ts: new Date('2020-01-01T00:00:00.000Z') })).toBe('{"ts":"2020-01-01T00:00:00.000Z"}')
  })

  it('honors a custom toJSON like JSON.stringify does', () => {
    const obj = { secret: 42, toJSON() { return { shown: 'ok' } } }
    expect(canonical({ wrap: obj })).toBe('{"wrap":{"shown":"ok"}}')
  })

  it('fails closed on Map/Set (no silent {} collision)', () => {
    expect(() => canonical({ grants: new Map([['a', 1]]) })).toThrow(/Map\/Set/)
    expect(() => canonical(new Set([1, 2]))).toThrow(/Map\/Set/)
  })

  it('reproduces the JSON.stringify-with-sorted-keys reference for JSON-safe values', () => {
    const samples: unknown[] = [
      { b: 1, a: 2, nested: { z: [3, 2, 1], y: null } },
      [1, 'two', true, null, { k: 'v', a: 'b' }],
      { ts: new Date('2026-07-13T00:00:00.000Z'), n: 3.5, s: 'σ‑unicode', flag: false },
      { skip: undefined, keep: 0, arr: [undefined, 1] },
      'plain string',
      42,
      { deep: { deeper: { deepest: [{ q: 1, p: 2 }] } } },
    ]
    for (const s of samples) {
      expect(canonical(s)).toBe(ref(s))
      // determinism: canonicalizing twice is byte-identical
      expect(canonical(s)).toBe(canonical(s))
    }
  })
})
