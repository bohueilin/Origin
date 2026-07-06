// Origin Training Evidence — env:verify (the training analog of proof:verify).
// =============================================================================
// Re-derives a ScoreReceipt from a recorded EpisodeTrace + pinned EnvironmentBundle
// + pinned verifier, and confirms nothing drifted or was tampered with.
//
//   node scripts/env-verify.mjs [episode.json] [score-receipt.json] [--bundle lock.json] [--mode score|full]
//
// Defaults to the committed docs/examples/* trio. Exit codes:
//   0 verified · 2 chain tamper · 3 reward/receipt mismatch · 4 verifier/bundle drift.
// =============================================================================

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyWarehouseRollout } from '../src/warehouse.ts'
import { computeLicenseFromVerdicts } from '../src/license.ts'
import { verifyEpisode } from '../rlkit/env-evidence.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const EX = resolve(HERE, '../docs/examples')
const argv = process.argv.slice(2)
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null }
const positional = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--bundle' && argv[i - 1] !== '--mode')

const episodePath = positional[0] || resolve(EX, 'warehouse-smoke.episode.json')
const receiptPath = positional[1] || resolve(EX, 'warehouse-smoke.score-receipt.json')
const bundlePath = flag('--bundle') || resolve(EX, 'warehouse.env-bundle.lock.json')
const mode = flag('--mode') || 'score'

const load = (p) => JSON.parse(readFileSync(p, 'utf8'))
const episode = load(episodePath)
const receipt = load(receiptPath)
const bundle = load(bundlePath)

if (mode === 'full') {
  console.log('mode=full requires generation pinning (re-rollout from a snapshot) — not available in P0.')
  console.log('score mode is the guarantee: the recorded actions are authoritative. Running score mode.\n')
}

// The pinned verifier + license policy, injected so the core stays verifier-agnostic.
const scoreFn = (task, actions) => verifyWarehouseRollout(task, actions, 'env-verify')
const licenseFn = (verdicts) => computeLicenseFromVerdicts(verdicts).level.id

const { code, checks } = verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn })
for (const [status, msg] of checks) console.log(`${status}  ${msg}`)

console.log(
  code === 0
    ? `\nVERIFIED — the score is reproducible under verifier ${receipt.verifier_version} ` +
        `(reward ${receipt.reward}, digest ${receipt.receipt_digest.slice(0, 12)}…). ` +
        `This is reproducibility under this verifier, not a claim the score is "correct".`
    : `\nFAILED (exit ${code}) — ` +
        { 2: 'episode chain tampered.', 3: 'reward / receipt mismatch → reward-definition review.', 4: 'verifier / bundle drift → re-generate + review.' }[code],
)
process.exit(code)
