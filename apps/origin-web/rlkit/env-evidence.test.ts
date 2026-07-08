import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bfsOracle, warehouseTasks, WAREHOUSE_VERSION } from '../src/warehouse.ts'
import { computeLicenseFromVerdicts } from '../src/license.ts'
import { VERIFIER_VERSION, REWARD_MODEL_VERSION } from '../server/evalVersions.ts'
import { bundleDigest, chainEpisode, openEpisode, buildScoreReceipt, verifyEpisode, canonical, sha256 } from './env-evidence.mjs'
import { scoreReward } from './reward-module.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const scoreFn = (task, actions) => scoreReward(task, actions, { policy: 'test' })
const licenseFn = (v) => computeLicenseFromVerdicts(v).level.id

// Build a bundle + episode + receipt in memory from the REAL pinned verifier.
function buildTrio() {
  const task = warehouseTasks.find((t) => bfsOracle(t).label === 'finish') ?? warehouseTasks[0]
  const actions = [...bfsOracle(task).optimalPath]
  const rollout = scoreReward(task, actions, { policy: 'ref' })
  const level = computeLicenseFromVerdicts([
    { passed: rollout.passed, reward: rollout.reward, catastrophic: rollout.falseAccept },
  ]).level.id

  const bundle = {
    schema_version: '1.0.0',
    name: 'warehouse-gym',
    runtime: { kind: 'in_process', code_ref: `src/warehouse.ts@warehouse-${WAREHOUSE_VERSION}` },
    seed_data: { dataset: 'x', seed_policy: 'fixed:task.seed' },
    verifier: {
      verifier_version: VERIFIER_VERSION,
      reward_model_version: REWARD_MODEL_VERSION,
      oracle: `bfsOracle@warehouse-${WAREHOUSE_VERSION}`,
      reward_spec: 'y',
    },
    scenario_registry_version: '1.0.0',
    license_policy_version: '1.0.0',
    row_schema_version: '1.0.0',
    reproducibility: { score: 'deterministic-from-recorded-actions', generation: 'best-effort', recorded_actions_are_authoritative: true },
  }
  bundle.env_bundle_digest = bundleDigest(bundle)

  const episode = chainEpisode(
    {
      trace_schema_version: '1.0.0',
      episode_id: 'ep_test',
      env_bundle_digest: bundle.env_bundle_digest,
      policy_version: 'ref',
      verifier_version: VERIFIER_VERSION,
      seed: task.seed,
      task,
    },
    [
      { event_type: 'episode.started', payload: { task_id: task.id } },
      ...actions.map((action, i) => ({ event_type: 'action.applied', step_index: i, payload: { action } })),
      { event_type: 'reward.computed', payload: { reward: rollout.reward } },
    ],
  )
  const receipt = buildScoreReceipt({
    episode,
    envBundleDigest: bundle.env_bundle_digest,
    rollout,
    versions: { verifier_version: VERIFIER_VERSION, reward_model_version: REWARD_MODEL_VERSION },
    licenseLevel: level,
  })
  return { bundle, episode, receipt }
}

describe('env:verify — reproducible score receipts', () => {
  it('a clean, untampered receipt verifies (exit 0)', () => {
    const { bundle, episode, receipt } = buildTrio()
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(0)
  })

  it('tampering an event breaks the chain (exit 2)', () => {
    const { bundle, episode, receipt } = buildTrio()
    const ev = episode.events.find((e) => e.event_type === 'action.applied')
    ev.payload.action = 'refuse' // event_hash no longer recomputes
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(2)
  })

  it('tampering the receipt reward is caught (exit 3)', () => {
    const { bundle, episode, receipt } = buildTrio()
    receipt.reward = receipt.reward === 1 ? 0.5 : 1
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(3)
  })

  it('tampering the receipt digest is caught (exit 3)', () => {
    const { bundle, episode, receipt } = buildTrio()
    receipt.receipt_digest = 'f'.repeat(64)
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(3)
  })

  it('bumping the pinned verifier version is drift (exit 4)', () => {
    const { bundle, episode, receipt } = buildTrio()
    bundle.verifier.verifier_version = '2.0.0' // also changes env_bundle_digest → drift
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(4)
  })

  it('re-scoring the recorded actions is bit-identical across runs', () => {
    const { episode } = buildTrio()
    const a = scoreFn(episode.task, episode.events.filter((e) => e.event_type === 'action.applied').map((e) => e.payload.action))
    const b = scoreFn(episode.task, episode.events.filter((e) => e.event_type === 'action.applied').map((e) => e.payload.action))
    expect(a.reward).toBe(b.reward)
    expect(a.category).toBe(b.category)
  })
})

describe('committed example artifacts', () => {
  const load = (p) => JSON.parse(readFileSync(resolve(HERE, '../docs/examples', p), 'utf8'))

  it('the committed bundle + episode + receipt reproduce (exit 0)', () => {
    const bundle = load('warehouse.env-bundle.lock.json')
    const episode = load('warehouse-smoke.episode.json')
    const receipt = load('warehouse-smoke.score-receipt.json')
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(0)
  })

  it('the committed bundle satisfies the JSON Schema (required fields + digest recomputes)', () => {
    const schema = JSON.parse(readFileSync(resolve(HERE, '../docs/schemas/env-bundle.schema.json'), 'utf8'))
    const bundle = load('warehouse.env-bundle.lock.json')
    for (const key of schema.required) expect(bundle, `missing required: ${key}`).toHaveProperty(key)
    expect(bundle.env_bundle_digest).toMatch(/^[0-9a-f]{64}$/)
    expect(bundleDigest(bundle)).toBe(bundle.env_bundle_digest) // content identity holds
  })
})

// ── Step 0: the chainEpisode → openEpisode/appendStep/seal refactor must not move a
//    single byte. These are the characterization guard for the shared hashing fold.
describe('openEpisode fold — byte-identical to chainEpisode + the committed episode', () => {
  const load = (p: string) => JSON.parse(readFileSync(resolve(HERE, '../docs/examples', p), 'utf8'))
  // reconstruct the input steps from a recorded episode (drop the sealing event).
  // `ep` is JSON-loaded (any), so the inline callbacks type as any exactly like the
  // committed-artifact tests above — no explicit annotations needed.
  const stepsOf = (ep) =>
    ep.events
      .filter((e) => e.event_type !== 'episode.sealed')
      .map((e) => ({ event_type: e.event_type, step_index: e.step_index ?? undefined, payload: e.payload ?? undefined }))
  const headerOf = (ep) => ({
    trace_schema_version: ep.trace_schema_version,
    episode_id: ep.episode_id,
    env_bundle_digest: ep.env_bundle_digest,
    policy_version: ep.policy_version,
    verifier_version: ep.verifier_version,
    seed: ep.seed,
    task: ep.task,
  })

  it('chainEpisode reproduces the committed episode byte-for-byte', () => {
    const committed = load('warehouse-smoke.episode.json')
    const rebuilt = chainEpisode(headerOf(committed), stepsOf(committed))
    expect(rebuilt.final_digest).toBe(committed.final_digest)
    expect(rebuilt.log_digest).toBe(committed.log_digest)
    expect(rebuilt.event_count).toBe(committed.event_count)
    expect(rebuilt.events).toEqual(committed.events)
  })

  it('the openEpisode builder equals the chainEpisode one-shot for the same steps', () => {
    const committed = load('warehouse-smoke.episode.json')
    const header = headerOf(committed)
    const steps = stepsOf(committed)
    const b = openEpisode(header)
    for (const s of steps) b.appendStep(s)
    expect(b.seal()).toEqual(chainEpisode(header, steps))
  })

  it('the builder exposes a usable tip + length and refuses append-after-seal', () => {
    const b = openEpisode({ episode_id: 'ep_x' })
    expect(b.length).toBe(0)
    const e1 = b.appendStep({ event_type: 'episode.started', payload: { a: 1 } })
    expect(b.length).toBe(1)
    expect(b.tip).toBe(e1.event_hash) // tip == last appended event_hash (the resume anchor, P7)
    b.seal()
    expect(b.sealed).toBe(true)
    expect(() => b.appendStep({ event_type: 'action.applied' })).toThrow()
    expect(() => b.seal()).toThrow()
  })
})

// DET-1 fix — canonical() must emit VALID JSON with JSON.stringify semantics for
// undefined: an undefined-valued object key is OMITTED; an undefined array element
// serializes to null. The old fall-through emitted the literal token `undefined`
// (not JSON, not round-trippable, unreproducible by any independent JSON impl).
// Everything JSON-safe must serialize byte-identically to before — committed
// digests must not move (the pinned-digest guards at the bottom enforce that).
describe('canonical() — JSON.stringify semantics, valid JSON always', () => {
  // deep-sort keys, then let JSON.stringify do the serialization — an independent
  // reference for "sorted-key JSON.stringify" (corpus keys are non-integer-like so
  // the rebuilt object's key order is exactly the sorted order).
  const sortDeep = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sortDeep)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v as Record<string, unknown>)
              .sort()
              .map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]),
          )
        : v
  const ref = (v: unknown) => JSON.stringify(sortDeep(v))

  it('is byte-identical to JSON.stringify-with-sorted-keys on JSON-safe inputs', () => {
    const corpus: unknown[] = [
      { b: 1, a: [2, { d: null, c: 'x' }] },
      { z: 'é€😀', a: ' \\"quote', nested: { deep: { deeper: [true, false, null] } } },
      [1, 'two', [3, [4, { e: 5 }]], null, true],
      { num: 0.1, neg: -3.14, big: 9007199254740991, exp: 1e21, tiny: 1e-7, zero: 0 },
      {},
      [],
      'plain string',
      42,
      null,
      true,
      { 'key with space': [{ ü: 'ß' }, '世界'], empty_obj: {}, empty_arr: [] },
    ]
    for (const x of corpus) {
      expect(canonical(x)).toBe(ref(x)) // byte-identical serialization
      expect(canonical(JSON.parse(canonical(x)))).toBe(canonical(x)) // round-trip fixpoint
    }
  })

  it('omits undefined-valued object keys, exactly like JSON.stringify', () => {
    expect(canonical({ a: undefined, b: 1 })).toBe('{"b":1}')
    expect(canonical({ a: undefined, b: 1 })).toBe(JSON.stringify({ a: undefined, b: 1 }))
    expect(canonical({ a: undefined })).toBe('{}')
    // functions + symbols are omitted from objects too (JSON.stringify parity)
    expect(canonical({ f() {}, s: Symbol('x'), b: 1 })).toBe('{"b":1}')
  })

  it('serializes undefined array elements (and holes/functions/symbols) as null', () => {
    expect(canonical([1, undefined, 2])).toBe('[1,null,2]')
    expect(canonical([1, undefined, 2])).toBe(JSON.stringify([1, undefined, 2]))
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [1, , 3]
    expect(canonical(sparse)).toBe(JSON.stringify(sparse)) // '[1,null,3]'
    expect(canonical([() => 1, Symbol('x')])).toBe('[null,null]')
  })

  it('always emits parseable JSON for object/array inputs carrying undefined', () => {
    const out = canonical({ a: [{ u: undefined, k: 1 }, undefined], b: undefined })
    expect(out).toBe('{"a":[{"k":1},null]}')
    expect(() => JSON.parse(out)).not.toThrow()
  })

  it('REGRESSION GUARD — pinned digests captured before the DET-1 fix are unchanged', () => {
    // Captured by running the PRE-fix code (2026-07-07). If canonical() ever moves a
    // byte for JSON-safe input, these digests move and this test fails the build.
    expect(sha256(canonical({ b: 1, a: [2, { d: null, c: 'x' }] }))).toBe(
      '41f05899d3459a3ecc94ff088afcd290b9ae4f51dc9ddaa35a82a642ddb55070',
    )
    const t = chainEpisode(
      {
        trace_schema_version: '1.0.0',
        episode_id: 'ep_iso',
        env_bundle_digest: 'd'.repeat(64),
        policy_version: 'p1',
        verifier_version: 'v1',
        seed: 7,
        task: { goal: 'g' },
      },
      [
        { event_type: 'action.applied', step_index: 0, payload: { action: 'N' } },
        { event_type: 'action.applied', step_index: 1, payload: { action: 'finish' } },
      ],
    )
    expect(t.final_digest).toBe('a718a27715d782e7d925a79da68fef302ba7f8c9bc90b8247d85043573b52ad2')
    expect(t.log_digest).toBe('612fdb42abc2a1b4e8ee376400b2f8da3d7e1adbe58631a0dd4b1756f25c1b9c')
  })
})
