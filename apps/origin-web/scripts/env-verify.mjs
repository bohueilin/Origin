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
import { computeLicenseFromVerdicts } from '../src/license.ts'
import { verifyEpisode, adjudicate } from '../rlkit/env-evidence.mjs'
import { warehouseToolsDigest, warehousePoliciesDigest } from '../rlkit/warehouse-manifest.mjs'
import { scoreReward } from '../rlkit/reward-module.ts'
import { checkpointBindsEpisode } from '../rlkit/checkpoint.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const EX = resolve(HERE, '../docs/examples')
const argv = process.argv.slice(2)
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null }
const has = (name) => argv.includes(name)
const VALUE_FLAGS = new Set(['--bundle', '--mode', '--checkpoint']) // flags that consume the next arg
const positional = argv.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(argv[i - 1]))

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

// The pinned verifier + reward module + license policy, injected so the core stays
// verifier-agnostic. scoreReward (no judge) = the deterministic core + reward-hack
// classification, so the recomputed receipt carries is_hack/raw/patched and reproduces.
const scoreFn = (task, actions) => scoreReward(task, actions, { policy: 'env-verify' })
const licenseFn = (verdicts) => computeLicenseFromVerdicts(verdicts).level.id

const { code, checks } = verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn })
for (const [status, msg] of checks) console.log(`${status}  ${msg}`)

// P1 — manifest-vs-code drift: re-derive the tool surface + policy set from the LIVE
// warehouse code and compare to what the bundle pinned. This catches the case the
// env_bundle_digest alone cannot: the environment code changed but the bundle wasn't
// regenerated (the pinned manifest is stale relative to what would actually run).
let driftCode = code
if (code === 0 && bundle.tools_digest != null) {
  const liveTools = warehouseToolsDigest()
  const livePolicies = warehousePoliciesDigest()
  if (liveTools !== bundle.tools_digest) {
    console.log('FAIL  tool surface drifted — the live warehouse tools do not match the pinned tools_digest')
    driftCode = 4
  } else if (livePolicies !== bundle.policies_digest) {
    console.log('FAIL  policy set drifted — the live safety/license policies do not match the pinned policies_digest')
    driftCode = 4
  } else {
    console.log('PASS  tools + policies re-derive from the live environment code (no manifest drift)')
  }
}

console.log(
  driftCode === 0
    ? `\nVERIFIED — the score is reproducible under verifier ${receipt.verifier_version} ` +
        `(reward ${receipt.reward}, digest ${receipt.receipt_digest.slice(0, 12)}…). ` +
        `This is reproducibility under this verifier, not a claim the score is "correct".`
    : `\nFAILED (exit ${driftCode}) — ` +
        { 2: 'episode chain tampered.', 3: 'reward / receipt mismatch → reward-definition review.', 4: 'verifier / bundle / manifest drift → re-generate + review.' }[driftCode],
)

// P7 — --checkpoint: verify a Checkpoint side-artifact binds to a real point in this
// episode's chain (self-consistent digest + prev_hash == the event hash at at_seq).
// ADD-only: a bad checkpoint surfaces as exit 3, never relaxing the main codes.
const checkpointPath = flag('--checkpoint')
if (checkpointPath) {
  const cp = load(checkpointPath)
  const bound = checkpointBindsEpisode(cp, episode)
  console.log(bound
    ? `PASS  checkpoint binds this episode @ seq ${cp.at_seq} (resume-safe; a side-artifact, not a chain event)`
    : 'FAIL  checkpoint does not bind this episode (self-digest / prev_hash / at_seq mismatch)')
  if (!bound && driftCode === 0) driftCode = 3
}

// P6 — --dispute: emit a signed Adjudication for the Computation dispute class only.
if (has('--dispute')) {
  const adj = adjudicate({ code: driftCode, bundle, receipt })
  console.log('\n— dispute adjudication (Computation class only) —')
  console.log(`  outcome        : ${adj.outcome} (exit ${adj.exit_code})`)
  console.log(`  receipt_digest : ${adj.receipt_digest?.slice(0, 16)}…`)
  console.log(`  adjudication   : ${adj.adjudication_digest.slice(0, 16)}…`)
  console.log(`  settles        : ${adj.settles} — NOT Definition (right reward?) or Governance (approved?).`)
}
process.exit(driftCode)
