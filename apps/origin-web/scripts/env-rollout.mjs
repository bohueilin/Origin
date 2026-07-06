// Origin Training Evidence — env:rollout (drive a policy through the OpenEnv core).
// =============================================================================
// Runs a named policy through the in-process OriginEnvCore (reset/step) via the
// Executor seam, seals the EpisodeTrace + ScoreReceipt, and verifies it end-to-end.
//
//   node scripts/env-rollout.mjs [--policy oracle|alwaysFinish|alwaysRefuse|reckless] [--tier in-process|fake-daytona]
// Exit: 0 verified · non-zero on a verify failure.
// =============================================================================

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  warehouseTasks, bfsOracle, oraclePolicy, alwaysFinishPolicy, alwaysRefusePolicy, recklessFinishPolicy,
} from '../src/warehouse.ts'
import { computeLicenseFromVerdicts } from '../src/license.ts'
import { verifyEpisode } from '../rlkit/env-evidence.mjs'
import { makeExecutor } from '../rlkit/executor.mjs'
import { runEpisode } from '../rlkit/run-episode.mjs'
import { scoreReward } from '../rlkit/reward-module.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }

const bundle = JSON.parse(readFileSync(resolve(HERE, '../docs/examples/warehouse.env-bundle.lock.json'), 'utf8'))
const policyName = flag('--policy', 'oracle')
const tier = flag('--tier', 'in-process')

const task = warehouseTasks.find((t) => bfsOracle(t).label === 'finish') ?? warehouseTasks[0]
const POLICIES = {
  oracle: () => oraclePolicy(task),
  alwaysFinish: () => alwaysFinishPolicy(),
  alwaysRefuse: () => alwaysRefusePolicy(),
  reckless: () => recklessFinishPolicy(task),
}
if (!POLICIES[policyName]) { console.error(`unknown --policy ${policyName} (oracle|alwaysFinish|alwaysRefuse|reckless)`); process.exit(64) }

const actions = POLICIES[policyName]()
const executor = makeExecutor(tier)
const { episode, receipt, meter } = runEpisode(executor, { bundle, task, actions, idPrefix: 'rollout', policyName })

const scoreFn = (t, a) => scoreReward(t, a, { policy: 'env-rollout' })
const licenseFn = (v) => computeLicenseFromVerdicts(v).level.id
const { code } = verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn })

console.log(`policy=${policyName} tier=${tier} · steps=${meter.sandbox_seconds} · reward=${receipt.reward} · license=${receipt.license_level} · is_hack=${receipt.is_hack} (${receipt.exploit_cluster})`)
console.log(`episode ${episode.final_digest.slice(0, 12)}… · receipt ${receipt.receipt_digest.slice(0, 12)}… · verify ${code === 0 ? 'PASS (exit 0)' : `FAIL (exit ${code})`}`)
process.exit(code)
