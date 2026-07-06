// Origin Training Evidence — env:promote (environment promotion lifecycle).
// =============================================================================
// Runs the seven promotion gates on the committed warehouse bundle + tasks and, if all
// pass with a valid human approval, emits an EnvironmentPromotionReceipt.
//
//   node scripts/env-promote.mjs [--from validation] [--to production] [--write]
// Exit: 0 promoted · 5 tampered digest / gate failed · 6 illegal transition · 7 no approval.
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { warehouseTasks, oraclePolicy } from '../src/warehouse.ts'
import { VERIFIER_VERSION } from '../server/evalVersions.ts'
import { scoreReward } from '../rlkit/reward-module.ts'
import { goldSuite, exploitSuite } from '../rlkit/exploit-suite.ts'
import { promoteEnvironment, EnvStatus } from '../rlkit/env-promotion.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const EX = resolve(HERE, '../docs/examples')
const load = (p) => JSON.parse(readFileSync(resolve(EX, p), 'utf8'))
const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }
const has = (n) => argv.includes(n)

const bundle = load('warehouse.env-bundle.lock.json')
const schema = JSON.parse(readFileSync(resolve(HERE, '../docs/schemas/env-bundle.schema.json'), 'utf8'))
const from = flag('--from', EnvStatus.VALIDATION)
const to = flag('--to', EnvStatus.PRODUCTION)

// A valid human approval packet (passport idiom). --no-approval drops it to demo exit 7.
const approval = has('--no-approval') ? null : { approver: 'origin-ops', capability: 'env.promote', valid: true }

const { code, receipt, reason, gate_results } = promoteEnvironment({
  bundle,
  from,
  to,
  tasks: [...warehouseTasks],
  scoreFn: (t, a) => scoreReward(t, a, { policy: 'env-promote' }),
  oracleFn: (t) => oraclePolicy(t),
  goldSuite: goldSuite(),
  exploitSuite: exploitSuite(),
  schema,
  approval,
  versions: { verifier_version: VERIFIER_VERSION },
  rollbackTarget: null, // first promotion of this env
})

for (const g of gate_results ?? []) console.log(`${g.ok ? 'PASS' : 'FAIL'}  ${g.id.padEnd(22)} ${g.detail}`)

if (code === 0) {
  if (has('--write')) writeFileSync(resolve(EX, 'warehouse.env-promotion-receipt.json'), JSON.stringify(receipt, null, 2) + '\n')
  console.log(`\nPROMOTED — env ${receipt.env_bundle_digest.slice(0, 12)}… ${from} → ${to} (frozen=${receipt.frozen}) · receipt ${receipt.receipt_digest.slice(0, 12)}…`)
  console.log('EnvStatus lives on the receipt, NOT in env_bundle_digest — promotion does not change the env content identity.')
} else {
  console.log(`\nBLOCKED (exit ${code}) — ${reason}. No promotion receipt emitted.`)
}
process.exit(code)
