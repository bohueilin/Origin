import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bfsOracle, verifyWarehouseRollout, warehouseTasks, WAREHOUSE_VERSION } from '../src/warehouse.ts'
import { computeLicenseFromVerdicts } from '../src/license.ts'
import { VERIFIER_VERSION, REWARD_MODEL_VERSION } from '../server/evalVersions.ts'
import { bundleDigest, chainEpisode, buildScoreReceipt, verifyEpisode } from './env-evidence.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const scoreFn = (task, actions) => verifyWarehouseRollout(task, actions, 'test')
const licenseFn = (v) => computeLicenseFromVerdicts(v).level.id

// Build a bundle + episode + receipt in memory from the REAL pinned verifier.
function buildTrio() {
  const task = warehouseTasks.find((t) => bfsOracle(t).label === 'finish') ?? warehouseTasks[0]
  const actions = [...bfsOracle(task).optimalPath]
  const rollout = verifyWarehouseRollout(task, actions, 'ref')
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
