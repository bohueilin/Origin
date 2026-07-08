// Origin Training Evidence — checkpoint / resume (P7: survive interruption)
// =============================================================================
// A long-horizon rollout can be interrupted and resumed WITHOUT breaking the hash
// chain: an interrupted-then-resumed episode hashes to the byte-identical final_digest
// as an uninterrupted run for the same recorded actions.
//
// The trick: a Checkpoint is a SIDE artifact, NEVER a chain event. Putting it in
// events[] would perturb every downstream event_hash. Instead resume RECONSTRUCTS the
// identical event sequence through the shared openEpisode fold (@origin/evidence),
// gated on three checks lifted from chronos restore_forkpoint:
//   • boundary — the replayed prefix tip == checkpoint.prev_hash (+ at_seq)
//   • history  — recordedActionsDigest(prefix actions) == checkpoint digest
//   • state    — sha256(canonical(restored state)) == checkpoint.state_digest
// Because the prefix is identical and the fold is pure, the resumed final_digest is
// byte-identical, so verifyEpisode still exits 0. The checkpoint cannot let the policy
// rewrite history (the gates reject any divergent prefix/state).
// =============================================================================

import { canonical, sha256, openEpisode, recordedActionsDigest } from '@origin/evidence/env-evidence'

export class ResumeError extends Error {}

export const actionsFromSteps = (steps) =>
  steps.filter((s) => s.event_type === 'action.applied').map((s) => s.payload.action)

// Build a Checkpoint from the header + the prefix steps sealed so far + the live state.
export function makeCheckpoint({ header, prefixSteps, state }) {
  const b = openEpisode(header)
  for (const s of prefixSteps) b.appendStep(s)
  const cp = {
    checkpoint_schema_version: '1.0.0',
    episode_id: header.episode_id,
    env_bundle_digest: header.env_bundle_digest,
    at_seq: b.length, // # events sealed into the chain before the pause
    prev_hash: b.tip, // chain tip event_hash at at_seq — the resume continuity anchor
    recorded_actions_so_far_digest: recordedActionsDigest(actionsFromSteps(prefixSteps)),
    state_digest: sha256(canonical(state)), // the restored-simulation gate
  }
  cp.checkpoint_digest = sha256(canonical(cp))
  return cp
}

// Resume: replay the prefix through the fold, gate on the checkpoint, then continue.
export function resumeEpisode({ header, prefixSteps, remainingSteps, checkpoint, restoredState }) {
  const b = openEpisode(header)
  for (const s of prefixSteps) b.appendStep(s)

  // boundary gate — the replayed prefix must end exactly at the checkpoint tip.
  if (b.length !== checkpoint.at_seq) throw new ResumeError(`boundary: at_seq ${b.length} != ${checkpoint.at_seq}`)
  if (b.tip !== checkpoint.prev_hash) throw new ResumeError('boundary: replayed prefix tip != checkpoint.prev_hash')
  // history gate — the applied actions so far must match the checkpoint.
  if (recordedActionsDigest(actionsFromSteps(prefixSteps)) !== checkpoint.recorded_actions_so_far_digest)
    throw new ResumeError('history: recorded_actions_so_far_digest mismatch (prefix diverged)')
  // state gate — the restored simulation state must match the checkpoint.
  if (sha256(canonical(restoredState)) !== checkpoint.state_digest)
    throw new ResumeError('state: state_digest mismatch (restored state diverged)')

  for (const s of remainingSteps) b.appendStep(s)
  return b.seal()
}

// The checkpoint is self-consistent (its digest matches its contents).
export function verifyCheckpoint(checkpoint) {
  const { checkpoint_digest, ...rest } = checkpoint
  return sha256(canonical(rest)) === checkpoint_digest
}

// The checkpoint binds to a real point in THIS episode's chain (prev_hash == the event
// hash at at_seq). Proves the checkpoint is anchored, not fabricated.
export function checkpointBindsEpisode(checkpoint, episode) {
  if (!verifyCheckpoint(checkpoint)) return false
  if (checkpoint.episode_id !== episode.episode_id) return false
  if (checkpoint.env_bundle_digest !== episode.env_bundle_digest) return false
  const anchor = (episode.events || [])[checkpoint.at_seq - 1]
  return Boolean(anchor) && anchor.event_hash === checkpoint.prev_hash
}
