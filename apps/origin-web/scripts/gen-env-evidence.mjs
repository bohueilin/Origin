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
  LICENSE_POLICY_VERSION, ROW_SCHEMA_VERSION, DAYTONA_RATE_VERSION,
} from '../server/evalVersions.ts'
import { canonical, sha256, bundleDigest, chainEpisode, buildScoreReceipt, recordedActions, adjudicate } from '@origin/evidence/env-evidence'
import { toolsDigest, policiesDigest, registryDigest } from '@origin/evidence/env-manifest'
import { warehouseToolSchemas, warehouseBundleTools, warehousePolicies } from '../env/warehouse-manifest.mjs'
import { scoreReward } from '../env/reward-module.ts'
import { exploitSuite } from '../env/exploit-suite.ts'
import { buildEpisodeAndReceipt } from '@origin/verifier-core/build-trace'
import { buildRegistry } from '@origin/verifier-core/tool-registry'
import { createMcpAdapter } from '@origin/verifier-core/mcp-adapter'
import { WAREHOUSE_GRANT, actionToCall } from '../env/warehouse-tools.mjs'
import { buildCostLedger, rateDigest } from '@origin/evidence/cost-ledger'

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
// P6 — the pinned cost rate model (rates live here, not in code). rate_digest folds in.
const cost_model = {
  rate_version: DAYTONA_RATE_VERSION,
  token_in_per_m: 0.5,
  token_out_per_m: 1.5,
  sandbox_usd_per_second: 0.0001,
  verifier_usd_per_ms: 0,
  storage_usd_per_byte: 5e-10,
}
const bundle = {
  schema_version: '1.0.0',
  name: 'warehouse-gym',
  created_at: FIXED_TS,
  runtime: { kind: 'in_process', code_ref: `src/warehouse.ts@warehouse-${WAREHOUSE_VERSION}` },
  seed_data: { dataset: sha256(canonical(task)), seed_policy: 'fixed:task.seed' },
  tools,
  tools_digest: toolsDigest(tools),
  registry_digest: registryDigest(tools), // P3 — the scope/rate-limit authz projection
  policies,
  policies_digest: policiesDigest(policies),
  cost_model, // P6 — pinned rate model
  rate_digest: rateDigest(cost_model),
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
  const { episode, receipt } = buildEpisodeAndReceipt({
    idPrefix, task, actions, rollout, oracleLabel, policyName,
    envBundleDigest: bundle.env_bundle_digest,
    verifierVersion: VERIFIER_VERSION, rewardModelVersion: REWARD_MODEL_VERSION,
    licenseLevel: lic.level.id,
    costModel: cost_model, // P6
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

// Tooled: the oracle path routed through the MCP tool registry. Each action is an
// authorized callTool → tool.call/tool.result/action.applied; a rate-denied SECOND
// scan is recorded as evidence but NEVER becomes action.applied (Goodhart guard).
function buildToolGatedTrace() {
  const adapter = createMcpAdapter(buildRegistry(tools), WAREHOUSE_GRANT)
  const steps = [{ event_type: 'episode.started', payload: { task_id: task.id, level: task.level, seed: task.seed, oracle_label: oracle.label } }]
  let callStep = 0
  let appliedIdx = 0
  for (const action of actions) {
    const { tool, args } = actionToCall(action)
    const res = adapter.callTool(tool, args, { step: callStep++ })
    steps.push({ event_type: 'tool.call', step_index: appliedIdx, payload: { tool, args } })
    steps.push({ event_type: 'tool.result', step_index: appliedIdx, payload: { tool, verdict: res.verdict, allow: res.allow, scope: res.scope } })
    if (res.allow) {
      steps.push({ event_type: 'action.applied', step_index: appliedIdx, payload: { action } })
      appliedIdx += 1
    }
    // probe: a second scan is single-shot → deny_rate (recorded, not applied).
    if (action === 'scan') {
      const denied = adapter.callTool('scan', {}, { step: callStep++ })
      steps.push({ event_type: 'tool.call', step_index: appliedIdx, payload: { tool: 'scan', args: {}, probe: 'rate-limit' } })
      steps.push({ event_type: 'tool.result', step_index: appliedIdx, payload: { tool: 'scan', verdict: denied.verdict, allow: denied.allow, scope: denied.scope } })
    }
  }
  const episode = chainEpisode(
    { trace_schema_version: '1.0.0', episode_id: `ep_warehouse-tooled_${task.id}`, env_bundle_digest: bundle.env_bundle_digest, policy_version: `reference-oracle@warehouse-${WAREHOUSE_VERSION}`, verifier_version: VERIFIER_VERSION, seed: task.seed, task },
    steps,
  )
  // score from the RECORDED (applied) actions only — the denied scan is not scored.
  const applied = recordedActions(episode)
  const trollout = scoreReward(task, applied, { policy: 'reference-oracle' })
  const tlic = computeLicenseFromVerdicts([{ passed: trollout.passed, reward: trollout.reward, catastrophic: trollout.falseAccept }])
  const tcost = buildCostLedger({
    sandbox_seconds: applied.length, tokens: { in: 0, out: 0 },
    storage_bytes: Buffer.byteLength(canonical({ task, actions: applied }), 'utf8'),
    verifier_ms: 0, reward: trollout.reward, costModel: cost_model,
  })
  const receipt = buildScoreReceipt({ episode, envBundleDigest: bundle.env_bundle_digest, rollout: trollout, versions: { verifier_version: VERIFIER_VERSION, reward_model_version: REWARD_MODEL_VERSION }, licenseLevel: tlic.level.id, cost: tcost })
  return { episode, receipt, denies: steps.filter((s) => s.event_type === 'tool.result' && !s.payload.allow).length }
}
const tooled = buildToolGatedTrace()

mkdirSync(OUT, { recursive: true })
// The full tool schemas (sidecar): each tools[].schema_digest = sha256(canonical(schema here)).
const toolsSidecar = { schema_version: '1.0.0', name: 'warehouse-gym', tools: toolSchemas }
writeFileSync(resolve(OUT, 'warehouse.tools.schema.json'), JSON.stringify(toolsSidecar, null, 2) + '\n')
writeFileSync(resolve(OUT, 'warehouse.env-bundle.lock.json'), JSON.stringify(bundle, null, 2) + '\n')
writeFileSync(resolve(OUT, 'warehouse-smoke.episode.json'), JSON.stringify(gold.episode, null, 2) + '\n')
writeFileSync(resolve(OUT, 'warehouse-smoke.score-receipt.json'), JSON.stringify(gold.receipt, null, 2) + '\n')
writeFileSync(resolve(OUT, 'warehouse-hack.episode.json'), JSON.stringify(hack.episode, null, 2) + '\n')
writeFileSync(resolve(OUT, 'warehouse-hack.score-receipt.json'), JSON.stringify(hack.receipt, null, 2) + '\n')
writeFileSync(resolve(OUT, 'warehouse-tooled.episode.json'), JSON.stringify(tooled.episode, null, 2) + '\n')
writeFileSync(resolve(OUT, 'warehouse-tooled.score-receipt.json'), JSON.stringify(tooled.receipt, null, 2) + '\n')
// P6 — a committed, digest-valid Adjudication: the RESOLVED-FOR Computation verdict for the gold.
const adjudication = adjudicate({ code: 0, bundle, receipt: gold.receipt })
writeFileSync(resolve(OUT, 'warehouse-smoke.adjudication.json'), JSON.stringify(adjudication, null, 2) + '\n')

console.log('wrote docs/examples/{warehouse.tools.schema,warehouse.env-bundle.lock,warehouse-smoke.*,warehouse-hack.*,warehouse-tooled.*}.json')
console.log(`  env            : ${task.id} (${task.level}) · ${tools.length} tools · ${policies.length} policies · env_bundle_dig ${bundle.env_bundle_digest.slice(0, 16)}…`)
console.log(`  gold           : reward ${gold.receipt.reward} · license ${gold.license.level.id} · is_hack ${gold.receipt.is_hack} · digest ${gold.receipt.receipt_digest.slice(0, 12)}…`)
console.log(`  reward-hacker  : reward ${hack.receipt.reward} · license ${hack.license.level.id} · is_hack ${hack.receipt.is_hack} (${hack.receipt.exploit_cluster}) · category ${hackRollout.category}`)
console.log(`  tooled (MCP)   : reward ${tooled.receipt.reward} · ${tooled.denies} denied tool call(s) recorded, not scored · digest ${tooled.receipt.receipt_digest.slice(0, 12)}…`)
console.log(`  cost (gold)    : total $${gold.receipt.cost.total_usd} · sandbox ${gold.receipt.cost.sandbox_seconds}s · reward/$ ${gold.receipt.cost.reward_per_dollar} · adjudication ${adjudication.outcome}`)
