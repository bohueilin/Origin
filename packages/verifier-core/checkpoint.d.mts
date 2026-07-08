// Type surface for checkpoint.mjs — checkpoint/resume without breaking the hash chain (P7).
// Hand-written declarations; keep in lockstep with checkpoint.mjs.

import type { EpisodeHeader, EpisodeStepInput, EpisodeTrace } from '@origin/evidence/env-evidence'

export class ResumeError extends Error {}

/** Actions extracted from action.applied steps (in order). */
export const actionsFromSteps: <A = unknown>(steps: readonly EpisodeStepInput[]) => A[]

/** A SIDE artifact, never a chain event — resume reconstructs the identical
 *  event sequence through the shared openEpisode fold. */
export interface Checkpoint {
  checkpoint_schema_version: string
  episode_id: string
  env_bundle_digest: string
  /** # events sealed into the chain before the pause. */
  at_seq: number
  /** Chain tip event_hash at at_seq — the resume continuity anchor. */
  prev_hash: string
  recorded_actions_so_far_digest: string
  /** sha256(canonical(state)) — the restored-simulation gate. */
  state_digest: string
  checkpoint_digest: string
}

export function makeCheckpoint(args: {
  header: EpisodeHeader
  prefixSteps: readonly EpisodeStepInput[]
  state: unknown
}): Checkpoint

/** Replays the prefix through the fold, gates on boundary/history/state, then
 *  continues — the resumed final_digest is byte-identical to an uninterrupted run.
 *  Throws ResumeError on any divergent prefix/state. */
export function resumeEpisode(args: {
  header: EpisodeHeader
  prefixSteps: readonly EpisodeStepInput[]
  remainingSteps: readonly EpisodeStepInput[]
  checkpoint: Checkpoint
  restoredState: unknown
}): EpisodeTrace

/** The checkpoint is self-consistent (its digest matches its contents). */
export function verifyCheckpoint(checkpoint: Checkpoint): boolean

/** The checkpoint binds to a real point in THIS episode's chain (anchored, not fabricated). */
export function checkpointBindsEpisode(checkpoint: Checkpoint, episode: EpisodeTrace): boolean
