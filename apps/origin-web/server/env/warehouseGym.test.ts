import { describe, expect, it } from 'vitest'
import { bfsOracle, oraclePolicy, verifyWarehouseRollout, warehouseTasks } from '../../src/warehouse.ts'
import { applyEmbodiment } from '../../src/environmentPlan.ts'
import { computeAuditDigest } from '../evidence/digest.ts'
import {
  buildWarehouseAuditRow,
  resetWarehouseEpisode,
  runWarehouseReferenceEpisode,
  stepWarehouseEpisode,
  type WarehouseGymConfig,
} from './warehouseGym.ts'

const cfg: WarehouseGymConfig = { insforge: {}, episodeSecret: 'warehouse-test-secret' }

describe('warehouse gym reset/step', () => {
  it('runs an oracle multi-step rollout through signed episode state', async () => {
    const task = warehouseTasks.find((t) => t.id === 'wh-l1-01')!
    const reset = resetWarehouseEpisode({ taskId: task.id, runId: 'warehouse_oracle', agentId: 'oracle' }, cfg)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return
    expect(reset.allowedActions).toContain('scan')
    expect(reset.allowedActions).toContain('finish')
    expect(reset.observation).not.toHaveProperty('oracle')
    expect(reset.observation.grid.hazards).toEqual([])

    let episodeId = reset.episodeId
    let last: Awaited<ReturnType<typeof stepWarehouseEpisode>> | null = null
    for (const action of oraclePolicy(task)) {
      last = await stepWarehouseEpisode({ episodeId, action }, cfg)
      expect(last.ok).toBe(true)
      if (!last.ok) return
      episodeId = last.episodeId
    }

    expect(last?.ok && last.done).toBe(true)
    if (!last?.ok) return
    expect(last.reward).toBe(1)
    expect(last.info.passed).toBe(true)
    expect(last.info.expected).toBe('finish')
    expect(last.info.actual).toBe('finish')
    expect(last.persisted).toBe(false)
  })

  it('hard-gates a fake finish to zero reward', async () => {
    const reset = resetWarehouseEpisode({ taskId: 'wh-l1-01', runId: 'warehouse_fake_finish' }, cfg)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return

    const step = await stepWarehouseEpisode({ episodeId: reset.episodeId, action: 'finish' }, cfg)
    expect(step.ok).toBe(true)
    if (!step.ok) return
    expect(step.done).toBe(true)
    expect(step.reward).toBe(0)
    expect(step.info.category).toBe('fake_finish')
    expect(step.info.passed).toBe(false)
  })

  it('rejects tampered episode ids and unknown actions', async () => {
    const badToken = await stepWarehouseEpisode({ episodeId: 'tampered.token', action: 'scan' }, cfg)
    expect(badToken.ok).toBe(false)
    if (badToken.ok) return
    expect(badToken.code).toBe('bad_request')

    const reset = resetWarehouseEpisode({ taskId: 'wh-l1-01' }, cfg)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return
    const badAction = await stepWarehouseEpisode({ episodeId: reset.episodeId, action: 'dance' }, cfg)
    expect(badAction.ok).toBe(false)
    if (badAction.ok) return
    expect(badAction.code).toBe('bad_request')
  })
})

describe('warehouse gym embodiment (server-trusted)', () => {
  it('re-runs the oracle under a constrained embodiment (finish -> escalate)', async () => {
    const base = warehouseTasks.find((t) => t.id === 'wh-l1-01')!
    expect(bfsOracle(base).label).toBe('finish')
    const arm = applyEmbodiment(base, 'arm')
    expect(bfsOracle(arm).label).toBe('escalate')

    const reset = resetWarehouseEpisode({ taskId: base.id, embodiment: 'arm', runId: 'wh_arm' }, cfg)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return
    // The reduced battery is reflected server-side, not taken from the client.
    expect(reset.observation.batteryRemaining).toBe(arm.battery)
    expect(reset.observation.batteryRemaining).toBeLessThan(base.battery)

    let episodeId = reset.episodeId
    let last: Awaited<ReturnType<typeof stepWarehouseEpisode>> | null = null
    for (const action of oraclePolicy(arm)) {
      last = await stepWarehouseEpisode({ episodeId, action }, cfg)
      expect(last.ok).toBe(true)
      if (!last.ok) return
      episodeId = last.episodeId
    }
    expect(last?.ok && last.done).toBe(true)
    if (!last?.ok) return
    expect(last.info.expected).toBe('escalate')
    expect(last.info.actual).toBe('escalate')
    expect(last.info.passed).toBe(true)
  })

  it('defaults to humanoid identity physics for a bare reset (backward-compatible)', () => {
    const base = warehouseTasks.find((t) => t.id === 'wh-l1-01')!
    const reset = resetWarehouseEpisode({ taskId: base.id }, cfg)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return
    expect(reset.observation.batteryRemaining).toBe(base.battery)
  })
})

describe('warehouse audit row enrichment', () => {
  it('carries plan/embodiment/domain metadata and stays digest-valid', () => {
    const base = warehouseTasks.find((t) => t.id === 'wh-l2-01')!
    const task = applyEmbodiment(base, 'carrier')
    const rollout = verifyWarehouseRollout(task, oraclePolicy(task), 'warehouse-oracle-reference')
    const row = buildWarehouseAuditRow(
      {
        runId: 'run_1',
        agentId: 'warehouse-oracle-reference',
        traceId: 'whref-1',
        baseTaskId: base.id,
        task,
        embodiment: 'carrier',
        domain: 'hospital',
        planId: 'plan_abc',
        requirementSummary: 'hospital supply pilot',
        approvedFactsHash: 'facts_abc',
        inputManifestSummary: '1 workflow video',
        frozenWorkflowSummary: 'deliver supplies safely',
        provenance: 'mock',
      },
      rollout,
    )
    const snap = row.scenario_snapshot as {
      baseTaskId: string
      embodiment: string
      domain: string
      plan: { planId: string; approvedFactsHash: string } | null
    }
    expect(snap.baseTaskId).toBe(base.id)
    expect(snap.embodiment).toBe('carrier')
    expect(snap.domain).toBe('hospital')
    expect(snap.plan?.planId).toBe('plan_abc')
    expect(snap.plan?.approvedFactsHash).toBe('facts_abc')
    expect(row.scenario_id).toBe('warehouse:wh-l2-01')
    expect(row.actual_policy_source).toBe('mock')
    // The digest covers scenario_snapshot, so recomputation must match exactly.
    expect(computeAuditDigest(row)).toBe(row.audit_row_digest)
  })
})

describe('warehouse deterministic reference episode', () => {
  it('runs the oracle and returns a passing terminal result', async () => {
    const res = await runWarehouseReferenceEpisode(
      { taskId: 'wh-l1-01', domain: 'manufacturing', embodiment: 'humanoid', planId: 'plan_x' },
      cfg,
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.done).toBe(true)
    expect(res.agentId).toBe('warehouse-oracle-reference')
    expect(res.info.expected).toBe('finish')
    expect(res.info.passed).toBe(true)
    expect(res.reward).toBe(1)
    expect(res.persisted).toBe(false) // no InsForge in tests -> local_only
  })

  it('rejects an unknown task', async () => {
    const res = await runWarehouseReferenceEpisode({ taskId: 'nope' }, cfg)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe('bad_request')
  })
})
