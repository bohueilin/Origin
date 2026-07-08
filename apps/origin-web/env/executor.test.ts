import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { warehouseTasks, bfsOracle, oraclePolicy } from '../src/warehouse.ts'
import { computeLicenseFromVerdicts } from '../src/license.ts'
import { verifyEpisode } from '@origin/evidence/env-evidence'
import { InProcessExecutor, FakeDaytona, makeExecutor } from './executor.mjs'
import { runEpisode } from './run-episode.mjs'
import { scoreReward } from './reward-module.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const load = (p: string) => JSON.parse(readFileSync(resolve(HERE, '../docs/examples', p), 'utf8'))
const bundle = load('warehouse.env-bundle.lock.json')
const task = warehouseTasks.find((t) => bfsOracle(t).label === 'finish') ?? warehouseTasks[0]
const actions = oraclePolicy(task)
const scoreFn = (t, a) => scoreReward(t, a, { policy: 'test' })
const licenseFn = (v) => computeLicenseFromVerdicts(v).level.id

describe('Executor (P4) — provider-agnostic execution seam', () => {
  it('prepare() refuses a bundle whose env_bundle_digest does not recompute', () => {
    const tampered = { ...bundle, env_bundle_digest: 'f'.repeat(64) }
    expect(() => InProcessExecutor().prepare(tampered)).toThrow(/digest mismatch/)
    expect(() => FakeDaytona().prepare(tampered)).toThrow(/digest mismatch/)
  })

  it('a runEpisode rollout seals a trace that verifies (exit 0)', () => {
    const { episode, receipt, meter } = runEpisode(InProcessExecutor(), { bundle, task, actions, idPrefix: 'run', policyName: 'oracle' })
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(0)
    expect(meter.sandbox_seconds).toBe(actions.length) // deterministic synthetic clock = applied steps
  })

  it('two forks of the same handle+seed are bit-identical (deterministic isolation)', () => {
    const a = runEpisode(InProcessExecutor(), { bundle, task, actions, idPrefix: 'run', policyName: 'oracle' })
    const b = runEpisode(InProcessExecutor(), { bundle, task, actions, idPrefix: 'run', policyName: 'oracle' })
    expect(a.episode.final_digest).toBe(b.episode.final_digest)
    expect(a.receipt.receipt_digest).toBe(b.receipt.receipt_digest)
  })

  it('FakeDaytona and InProcess produce the byte-identical receipt (tier does not move the score)', () => {
    const inproc = runEpisode(InProcessExecutor(), { bundle, task, actions, idPrefix: 'run', policyName: 'oracle' })
    const daytona = runEpisode(FakeDaytona(), { bundle, task, actions, idPrefix: 'run', policyName: 'oracle' })
    expect(daytona.receipt.receipt_digest).toBe(inproc.receipt.receipt_digest)
    expect(daytona.episode.final_digest).toBe(inproc.episode.final_digest)
    expect(daytona.tier).toBe('daytona')
    expect(inproc.tier).toBe('in_process')
  })

  it('state() reads without advancing the session', () => {
    const ex = makeExecutor('fake-daytona')
    const handle = ex.prepare(bundle)
    const session = ex.forkRollout(handle, { task })
    ex.step(session, 'observe')
    const s1 = ex.state(session)
    const s2 = ex.state(session)
    expect(session.steps).toBe(1) // two state() reads did NOT advance
    expect(s1.observation.steps).toBe(1)
    expect(s2).toEqual(s1)
  })

  it('reset() restores a session to the golden snapshot (a deterministic episode boundary)', () => {
    const ex = FakeDaytona()
    const handle = ex.prepare(bundle)
    const session = ex.forkRollout(handle, { task })
    for (const a of actions) ex.step(session, a)
    expect(session.steps).toBe(actions.length)
    ex.reset(session)
    expect(session.steps).toBe(0)
    expect(ex.state(session).observation.position).toEqual(task.start)
  })

  it('an executor-driven rollout reproduces the COMMITTED gold digests (gen ≡ executor)', () => {
    const committed = load('warehouse-smoke.score-receipt.json')
    const committedEp = load('warehouse-smoke.episode.json')
    const { episode, receipt } = runEpisode(InProcessExecutor(), {
      bundle, task, actions, idPrefix: 'warehouse-smoke', policyName: 'reference-oracle@warehouse-2026-06-20.1',
    })
    expect(episode.final_digest).toBe(committedEp.final_digest)
    expect(receipt.receipt_digest).toBe(committed.receipt_digest)
  })
})
