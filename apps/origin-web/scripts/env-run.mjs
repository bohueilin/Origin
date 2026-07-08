// Origin Training Evidence — env:run (provider-agnostic rollout across tiers).
// =============================================================================
// Runs the SAME oracle rollout through both the in-process executor and FakeDaytona
// and proves the receipt_digest is identical — the reproducibility receipt does not
// depend on the execution tier. Daytona (fake) provides isolation + snapshot/reset;
// Origin adds the receipt on top: env_bundle_digest pins WHAT ran, env:verify proves
// WHAT it scored, the sandbox proves it ran isolated.
//
//   node scripts/env-run.mjs [--tier in-process|fake-daytona|both]
// Exit: 0 · 4 if the two tiers disagree (should never happen).
// =============================================================================

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { warehouseTasks, bfsOracle, oraclePolicy } from '../src/warehouse.ts'
import { InProcessExecutor, FakeDaytona } from '../env/executor.mjs'
import { runEpisode } from '../env/run-episode.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }
const tier = flag('--tier', 'both')

const bundle = JSON.parse(readFileSync(resolve(HERE, '../docs/examples/warehouse.env-bundle.lock.json'), 'utf8'))
const task = warehouseTasks.find((t) => bfsOracle(t).label === 'finish') ?? warehouseTasks[0]
const actions = oraclePolicy(task)

const run = (executor) => runEpisode(executor, { bundle, task, actions, idPrefix: 'run', policyName: 'oracle' })

const results = []
if (tier === 'in-process' || tier === 'both') results.push(run(InProcessExecutor()))
if (tier === 'fake-daytona' || tier === 'both') results.push(run(FakeDaytona()))

for (const r of results) {
  console.log(`tier=${String(r.tier).padEnd(12)} sandbox_seconds=${r.meter.sandbox_seconds} reward=${r.receipt.reward} receipt=${r.receipt.receipt_digest.slice(0, 16)}…`)
}

let code = 0
if (results.length === 2) {
  const same = results[0].receipt.receipt_digest === results[1].receipt.receipt_digest && results[0].episode.final_digest === results[1].episode.final_digest
  console.log(same
    ? '\nPASS — both tiers produce the byte-identical receipt (the receipt is provider-agnostic).'
    : '\nFAIL — the tiers disagree (exit 4). Execution tier must never change the score.')
  code = same ? 0 : 4
}
process.exit(code)
