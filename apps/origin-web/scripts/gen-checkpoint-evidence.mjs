// Origin Training Evidence — env:checkpoint (generate + prove a resumable episode).
// =============================================================================
// Reconstructs the committed gold episode, checkpoints it mid-rollout, and proves the
// interrupted-then-resumed episode hashes to the IDENTICAL final_digest. Writes the
// digest-valid Checkpoint side-artifact.
//
//   node scripts/gen-checkpoint-evidence.mjs
// Exit: 0 resume reproduces the uninterrupted digest · 1 otherwise.
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initialWarehouseState, applyWarehouseAction } from '../src/warehouse.ts'
import { chainEpisode } from '@origin/evidence/env-evidence'
import { makeCheckpoint, resumeEpisode, actionsFromSteps, checkpointBindsEpisode } from '@origin/verifier-core/checkpoint'

const HERE = dirname(fileURLToPath(import.meta.url))
const EX = resolve(HERE, '../docs/examples')
const load = (p) => JSON.parse(readFileSync(resolve(EX, p), 'utf8'))

const episode = load('warehouse-smoke.episode.json')
const header = {
  trace_schema_version: episode.trace_schema_version,
  episode_id: episode.episode_id,
  env_bundle_digest: episode.env_bundle_digest,
  policy_version: episode.policy_version,
  verifier_version: episode.verifier_version,
  seed: episode.seed,
  task: episode.task,
}
// reconstruct the input steps (drop the sealing event).
const fullSteps = episode.events
  .filter((e) => e.event_type !== 'episode.sealed')
  .map((e) => ({ event_type: e.event_type, step_index: e.step_index ?? undefined, payload: e.payload ?? undefined }))

// uninterrupted reference.
const uninterrupted = chainEpisode(header, fullSteps)

// interrupt after k applied actions (mid-rollout). prefix = started + first k actions.
const actions = actionsFromSteps(fullSteps)
const k = Math.floor(actions.length / 2)
const prefixSteps = fullSteps.slice(0, 1 + k)
const remainingSteps = fullSteps.slice(1 + k)

// the restored simulation state after replaying the first k actions.
let state = initialWarehouseState(episode.task)
for (const a of actions.slice(0, k)) state = applyWarehouseAction(episode.task, state, a)

const checkpoint = makeCheckpoint({ header, prefixSteps, state })
const resumed = resumeEpisode({ header, prefixSteps, remainingSteps, checkpoint, restoredState: state })

const same =
  resumed.final_digest === uninterrupted.final_digest &&
  resumed.log_digest === uninterrupted.log_digest &&
  uninterrupted.final_digest === episode.final_digest &&
  checkpointBindsEpisode(checkpoint, episode) &&
  !resumed.events.some((e) => e.event_type === 'episode.checkpoint') // checkpoint is a SIDE artifact

writeFileSync(resolve(EX, 'warehouse-resumed.checkpoint.json'), JSON.stringify(checkpoint, null, 2) + '\n')

console.log(`checkpoint @ seq ${checkpoint.at_seq} (after ${k}/${actions.length} actions) · state ${checkpoint.state_digest.slice(0, 12)}…`)
console.log(`uninterrupted final_digest : ${uninterrupted.final_digest.slice(0, 16)}…`)
console.log(`resumed       final_digest : ${resumed.final_digest.slice(0, 16)}…`)
console.log(same ? 'PASS — resume reproduces the byte-identical episode; checkpoint is a side-artifact.' : 'FAIL — resume diverged.')
process.exit(same ? 0 : 1)
