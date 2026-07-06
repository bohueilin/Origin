// Origin Training Evidence — generate the P0 example artifacts.
// =============================================================================
// Emits, from the REAL pinned verifier, a digest-valid trio:
//   docs/examples/warehouse.env-bundle.lock.json   (EnvironmentBundle)
//   docs/examples/warehouse-smoke.episode.json      (EpisodeTrace, hash-chained)
//   docs/examples/warehouse-smoke.score-receipt.json (ScoreReceipt)
// The recorded actions are the oracle's optimal path (a passing rollout), scored
// by verifyWarehouseRollout — so the receipt reproduces by construction under
// `npm run env:verify`.
//
//   node scripts/gen-env-evidence.mjs
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bfsOracle, verifyWarehouseRollout, warehouseTasks, WAREHOUSE_VERSION } from '../src/warehouse.ts'
import { computeLicenseFromVerdicts } from '../src/license.ts'
import {
  ENVIRONMENT_NAME, SCENARIO_REGISTRY_VERSION, VERIFIER_VERSION, REWARD_MODEL_VERSION,
  LICENSE_POLICY_VERSION, ROW_SCHEMA_VERSION,
} from '../server/evalVersions.ts'
import { canonical, sha256, bundleDigest, chainEpisode, buildScoreReceipt } from '../rlkit/env-evidence.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../docs/examples')
const FIXED_TS = '2026-07-05T00:00:00.000Z' // deterministic; NOT part of any digest

// 1 — pick a deterministic, finishable task; record the oracle's optimal path.
const task = warehouseTasks.find((t) => bfsOracle(t).label === 'finish') ?? warehouseTasks[0]
const oracle = bfsOracle(task)
const actions = [...oracle.optimalPath]
const rollout = verifyWarehouseRollout(task, actions, 'reference-oracle')
const license = computeLicenseFromVerdicts([
  { passed: rollout.passed, reward: rollout.reward, catastrophic: rollout.falseAccept },
])

// 2 — EnvironmentBundle. Digests are bare sha256 hex (OCI-style `sha256:` prefix
//     is added at the OCI/ORAS boundary in P1). reward_spec = hash of the verifier
//     source → "reward as code, code as artifact".
const verifierSrc = readFileSync(resolve(HERE, '../src/warehouse.ts'), 'utf8')
const bundle = {
  schema_version: '1.0.0',
  name: 'warehouse-gym',
  created_at: FIXED_TS,
  runtime: { kind: 'in_process', code_ref: `src/warehouse.ts@warehouse-${WAREHOUSE_VERSION}` },
  seed_data: { dataset: sha256(canonical(task)), seed_policy: 'fixed:task.seed' },
  tools: [],
  policies: [],
  verifier: {
    verifier_version: VERIFIER_VERSION,
    reward_model_version: REWARD_MODEL_VERSION,
    oracle: `bfsOracle@warehouse-${WAREHOUSE_VERSION}`,
    reward_spec: sha256(verifierSrc),
  },
  environment_name: ENVIRONMENT_NAME,
  scenario_registry_version: SCENARIO_REGISTRY_VERSION,
  license_policy_version: LICENSE_POLICY_VERSION,
  row_schema_version: ROW_SCHEMA_VERSION,
  reproducibility: {
    score: 'deterministic-from-recorded-actions',
    generation: 'best-effort',
    recorded_actions_are_authoritative: true,
    canonicalization: 'stableStringify-v1; keys sorted; exclude {created_at, env_bundle_digest}',
  },
}
bundle.env_bundle_digest = bundleDigest(bundle)

// 3 — EpisodeTrace (hash-chained). One event per applied action, then reward +
//     verdict, then the sealing event.
const episodeId = `ep_warehouse-smoke_${task.id}`
const steps = [
  { event_type: 'episode.started', payload: { task_id: task.id, level: task.level, seed: task.seed, oracle_label: oracle.label } },
  ...actions.map((action, i) => ({ event_type: 'action.applied', step_index: i, payload: { action } })),
  { event_type: 'reward.computed', payload: { reward: rollout.reward, passed: rollout.passed, category: rollout.category, outcome: rollout.outcome, shaped_bonus: rollout.shapedBonus } },
  { event_type: 'verdict.emitted', payload: { license_level: license.level.id, false_accept: rollout.falseAccept, false_reject: rollout.falseReject } },
]
const episode = chainEpisode(
  {
    trace_schema_version: '1.0.0',
    episode_id: episodeId,
    env_bundle_digest: bundle.env_bundle_digest,
    policy_version: `reference-oracle@warehouse-${WAREHOUSE_VERSION}`,
    verifier_version: VERIFIER_VERSION,
    seed: task.seed,
    task, // embedded so re-scoring is self-contained; committed by seed_data.dataset in the bundle
  },
  steps,
)

// 4 — ScoreReceipt (the product object).
const receipt = buildScoreReceipt({
  episode,
  envBundleDigest: bundle.env_bundle_digest,
  rollout,
  versions: { verifier_version: VERIFIER_VERSION, reward_model_version: REWARD_MODEL_VERSION },
  licenseLevel: license.level.id,
})

mkdirSync(OUT, { recursive: true })
writeFileSync(resolve(OUT, 'warehouse.env-bundle.lock.json'), JSON.stringify(bundle, null, 2) + '\n')
writeFileSync(resolve(OUT, 'warehouse-smoke.episode.json'), JSON.stringify(episode, null, 2) + '\n')
writeFileSync(resolve(OUT, 'warehouse-smoke.score-receipt.json'), JSON.stringify(receipt, null, 2) + '\n')

console.log('wrote docs/examples/{warehouse.env-bundle.lock,warehouse-smoke.episode,warehouse-smoke.score-receipt}.json')
console.log(`  task           : ${task.id} (${task.level}, oracle=${oracle.label})`)
console.log(`  actions        : ${actions.length}`)
console.log(`  reward         : ${rollout.reward} · license ${license.level.id} · category ${rollout.category}`)
console.log(`  env_bundle_dig : ${bundle.env_bundle_digest.slice(0, 16)}…`)
console.log(`  episode digest : ${episode.final_digest.slice(0, 16)}…`)
console.log(`  receipt digest : ${receipt.receipt_digest.slice(0, 16)}…`)
