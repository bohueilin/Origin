import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initialWarehouseState, applyWarehouseAction } from '../src/warehouse.ts'
import { computeLicenseFromVerdicts } from '../src/license.ts'
import { chainEpisode, verifyEpisode } from './env-evidence.mjs'
import { makeCheckpoint, resumeEpisode, ResumeError, verifyCheckpoint, checkpointBindsEpisode, actionsFromSteps } from './checkpoint.mjs'
import { scoreReward } from './reward-module.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const load = (p: string) => JSON.parse(readFileSync(resolve(HERE, '../docs/examples', p), 'utf8'))
const scoreFn = (t, a) => scoreReward(t, a, { policy: 'test' })
const licenseFn = (v) => computeLicenseFromVerdicts(v).level.id

// reconstruct header + steps + the checkpoint fixtures from the committed gold episode.
function fixtures() {
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
  const fullSteps = episode.events
    .filter((e) => e.event_type !== 'episode.sealed')
    .map((e) => ({ event_type: e.event_type, step_index: e.step_index ?? undefined, payload: e.payload ?? undefined }))
  const actions = actionsFromSteps(fullSteps)
  const k = Math.floor(actions.length / 2)
  const prefixSteps = fullSteps.slice(0, 1 + k)
  const remainingSteps = fullSteps.slice(1 + k)
  let state = initialWarehouseState(episode.task)
  for (const a of actions.slice(0, k)) state = applyWarehouseAction(episode.task, state, a)
  const checkpoint = makeCheckpoint({ header, prefixSteps, state })
  return { episode, header, fullSteps, prefixSteps, remainingSteps, state, checkpoint, k }
}

describe('checkpoint / resume (P7) — survive interruption, reproduce the digest', () => {
  it('resume produces the byte-identical episode as an uninterrupted run', () => {
    const { header, fullSteps, prefixSteps, remainingSteps, state, checkpoint } = fixtures()
    const uninterrupted = chainEpisode(header, fullSteps)
    const resumed = resumeEpisode({ header, prefixSteps, remainingSteps, checkpoint, restoredState: state })
    expect(resumed.final_digest).toBe(uninterrupted.final_digest)
    expect(resumed.log_digest).toBe(uninterrupted.log_digest)
    expect(resumed.events).toEqual(uninterrupted.events)
  })

  it('the checkpoint is a SIDE artifact — never present in events[]', () => {
    const { header, prefixSteps, remainingSteps, state, checkpoint } = fixtures()
    const resumed = resumeEpisode({ header, prefixSteps, remainingSteps, checkpoint, restoredState: state })
    expect(resumed.events.some((e) => e.event_type.includes('checkpoint'))).toBe(false)
  })

  it('a resumed episode still verifies against the committed receipt (exit 0)', () => {
    const { header, prefixSteps, remainingSteps, state, checkpoint } = fixtures()
    const resumed = resumeEpisode({ header, prefixSteps, remainingSteps, checkpoint, restoredState: state })
    const bundle = load('warehouse.env-bundle.lock.json')
    const receipt = load('warehouse-smoke.score-receipt.json')
    expect(verifyEpisode({ episode: resumed, receipt, bundle, scoreFn, licenseFn }).code).toBe(0)
  })

  it('a tampered state_digest throws (the restored state diverged)', () => {
    const { header, prefixSteps, remainingSteps, state, checkpoint } = fixtures()
    const bad = { ...checkpoint, state_digest: 'a'.repeat(64) }
    expect(() => resumeEpisode({ header, prefixSteps, remainingSteps, checkpoint: bad, restoredState: state })).toThrow(ResumeError)
  })

  it('a reordered prefix throws (boundary/history gate)', () => {
    const { header, prefixSteps, remainingSteps, state, checkpoint } = fixtures()
    const swapped = [...prefixSteps]
    ;[swapped[1], swapped[2]] = [swapped[2], swapped[1]] // reorder two applied actions
    expect(() => resumeEpisode({ header, prefixSteps: swapped, remainingSteps, checkpoint, restoredState: state })).toThrow(ResumeError)
  })

  it('a wrong prev_hash throws (boundary gate)', () => {
    const { header, prefixSteps, remainingSteps, state, checkpoint } = fixtures()
    const bad = { ...checkpoint, prev_hash: 'b'.repeat(64) }
    expect(() => resumeEpisode({ header, prefixSteps, remainingSteps, checkpoint: bad, restoredState: state })).toThrow(ResumeError)
  })

  it('verifyCheckpoint catches a tampered checkpoint; the committed one binds the gold episode', () => {
    const { checkpoint, episode } = fixtures()
    expect(verifyCheckpoint(checkpoint)).toBe(true)
    expect(verifyCheckpoint({ ...checkpoint, at_seq: 999 })).toBe(false)
    const committed = load('warehouse-resumed.checkpoint.json')
    expect(checkpointBindsEpisode(committed, episode)).toBe(true)
    expect(checkpointBindsEpisode({ ...committed, prev_hash: 'c'.repeat(64) }, episode)).toBe(false)
  })
})
