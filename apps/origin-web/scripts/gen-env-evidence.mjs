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
import { bfsOracle, warehouseTasks, WAREHOUSE_VERSION } from '../src/warehouse.ts'
import { computeLicenseFromVerdicts } from '../src/license.ts'
import {
  ENVIRONMENT_NAME, SCENARIO_REGISTRY_VERSION, VERIFIER_VERSION, REWARD_MODEL_VERSION,
  LICENSE_POLICY_VERSION, ROW_SCHEMA_VERSION,
} from '../server/evalVersions.ts'
import { canonical, sha256, bundleDigest, chainEpisode, buildScoreReceipt } from '../rlkit/env-evidence.mjs'
import { toolsDigest, policiesDigest } from '../rlkit/env-manifest.mjs'
import { warehouseToolSchemas, warehouseBundleTools, warehousePolicies } from '../rlkit/warehouse-manifest.mjs'
import { scoreReward } from '../rlkit/reward-module.ts'
import { exploitSuite } from '../rlkit/exploit-suite.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../docs/examples')
const FIXED_TS = '2026-07-05T00:00:00.000Z' // deterministic; NOT part of any digest

// 1 — pick a deterministic, finishable task; record the oracle's optimal path.
const task = warehouseTasks.find((t) => bfsOracle(t).label === 'finish') ?? warehouseTasks[0]
const oracle = bfsOracle(task)
const actions = [...oracle.optimalPath]
const rollout = scoreReward(task, actions, { policy: 'reference-oracle' }) // is_hack=false, reward=1
const license = computeLicenseFromVerdicts([
  { passed: rollout.passed, reward: rollout.reward, catastrophic: rollout.falseAccept },
])

// 2 — EnvironmentBundle. Digests are bare sha256 hex (OCI-style `sha256:` prefix
//     is added at the OCI/ORAS boundary in P1). reward_spec = hash of the verifier
//     source → "reward as code, code as artifact".
const verifierSrc = readFileSync(resolve(HERE, '../src/warehouse.ts'), 'utf8')
// P1 — content-address the env surface: tool schemas + safety/license policies.
const toolSchemas = warehouseToolSchemas() // full schemas → written to the sidecar
const tools = warehouseBundleTools() // {name, schema_digest, version} → into the bundle
const policies = warehousePolicies() // {id, kind, statement, source_ref, source_digest, digest}
const bundle = {
  schema_version: '1.0.0',
  name: 'warehouse-gym',
  created_at: FIXED_TS,
  runtime: { kind: 'in_process', code_ref: `src/warehouse.ts@warehouse-${WAREHOUSE_VERSION}` },
  seed_data: { dataset: sha256(canonical(task)), seed_policy: 'fixed:task.seed' },
  tools,
  tools_digest: toolsDigest(tools),
  policies,
  policies_digest: policiesDigest(policies),
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

// 3+4 — build an EpisodeTrace (hash-chained) + its ScoreReceipt for a given rollout.
//        Both trios share the SAME bundle (the environment is identical); only the
//        recorded actions + the scored outcome differ. The reward.computed event stays
//        gate-shaped (reward/passed/category); is_hack rides the receipt (evidence).
function buildTrace({ idPrefix, task, actions, rollout, oracleLabel, policyName }) {
  const lic = computeLicenseFromVerdicts([
    { passed: rollout.passed, reward: rollout.reward, catastrophic: rollout.falseAccept },
  ])
  const steps = [
    { event_type: 'episode.started', payload: { task_id: task.id, level: task.level, seed: task.seed, oracle_label: oracleLabel } },
    ...actions.map((action, i) => ({ event_type: 'action.applied', step_index: i, payload: { action } })),
    { event_type: 'reward.computed', payload: { reward: rollout.reward, passed: rollout.passed, category: rollout.category, outcome: rollout.outcome, shaped_bonus: rollout.shapedBonus } },
    { event_type: 'verdict.emitted', payload: { license_level: lic.level.id, false_accept: rollout.falseAccept, false_reject: rollout.falseReject } },
  ]
  const episode = chainEpisode(
    {
      trace_schema_version: '1.0.0',
      episode_id: `ep_${idPrefix}_${task.id}`,
      env_bundle_digest: bundle.env_bundle_digest,
      policy_version: policyName,
      verifier_version: VERIFIER_VERSION,
      seed: task.seed,
      task, // embedded so re-scoring is self-contained; committed by seed_data.dataset in the bundle
    },
    steps,
  )
  const receipt = buildScoreReceipt({
    episode,
    envBundleDigest: bundle.env_bundle_digest,
    rollout,
    versions: { verifier_version: VERIFIER_VERSION, reward_model_version: REWARD_MODEL_VERSION },
    licenseLevel: lic.level.id,
  })
  return { episode, receipt, license: lic }
}

// Gold: the oracle's optimal path (a passing rollout).
const gold = buildTrace({
  idPrefix: 'warehouse-smoke', task, actions, rollout, oracleLabel: oracle.label,
  policyName: `reference-oracle@warehouse-${WAREHOUSE_VERSION}`,
})

// Reward-hacker: claim 'finish' without doing the work → fake_finish (is_hack, reward 0).
const hackCase = exploitSuite().find((e) => e.cluster === 'hardcode_outputs')
const hackRollout = scoreReward(hackCase.task, hackCase.actions, { policy: 'reward-hacker' })
const hack = buildTrace({
  idPrefix: 'warehouse-hack', task: hackCase.task, actions: hackCase.actions, rollout: hackRollout,
  oracleLabel: bfsOracle(hackCase.task).label, policyName: 'reward-hacker@blind-finish',
})

mkdirSync(OUT, { recursive: true })
// The full tool schemas (sidecar): each tools[].schema_digest = sha256(canonical(schema here)).
const toolsSidecar = { schema_version: '1.0.0', name: 'warehouse-gym', tools: toolSchemas }
writeFileSync(resolve(OUT, 'warehouse.tools.schema.json'), JSON.stringify(toolsSidecar, null, 2) + '\n')
writeFileSync(resolve(OUT, 'warehouse.env-bundle.lock.json'), JSON.stringify(bundle, null, 2) + '\n')
writeFileSync(resolve(OUT, 'warehouse-smoke.episode.json'), JSON.stringify(gold.episode, null, 2) + '\n')
writeFileSync(resolve(OUT, 'warehouse-smoke.score-receipt.json'), JSON.stringify(gold.receipt, null, 2) + '\n')
writeFileSync(resolve(OUT, 'warehouse-hack.episode.json'), JSON.stringify(hack.episode, null, 2) + '\n')
writeFileSync(resolve(OUT, 'warehouse-hack.score-receipt.json'), JSON.stringify(hack.receipt, null, 2) + '\n')

console.log('wrote docs/examples/{warehouse.tools.schema,warehouse.env-bundle.lock,warehouse-smoke.{episode,score-receipt},warehouse-hack.{episode,score-receipt}}.json')
console.log(`  env            : ${task.id} (${task.level}) · ${tools.length} tools · ${policies.length} policies · env_bundle_dig ${bundle.env_bundle_digest.slice(0, 16)}…`)
console.log(`  gold           : reward ${gold.receipt.reward} · license ${gold.license.level.id} · is_hack ${gold.receipt.is_hack} · digest ${gold.receipt.receipt_digest.slice(0, 12)}…`)
console.log(`  reward-hacker  : reward ${hack.receipt.reward} · license ${hack.license.level.id} · is_hack ${hack.receipt.is_hack} (${hack.receipt.exploit_cluster}) · category ${hackRollout.category}`)
