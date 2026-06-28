import { describe, expect, it } from 'vitest'
import {
  applyEmbodiment,
  buildEnvironmentPlan,
  PHYSICAL_DOMAINS,
  type EnvironmentRequirement,
} from './environmentPlan'
import { bfsOracle, buildWarehouseDemoForTasks, warehouseTasks } from './warehouse'

const baseReq: EnvironmentRequirement = {
  outcome: 'A robot assistant for my dad’s factory that lifts and moves parts safely.',
  domain: 'manufacturing',
  embodiment: 'humanoid',
}

describe('buildEnvironmentPlan', () => {
  it('is deterministic: same requirement -> deep-equal plan and same id', () => {
    const a = buildEnvironmentPlan(baseReq)
    const b = buildEnvironmentPlan({ ...baseReq })
    expect(a).toEqual(b)
    expect(a.id).toBe(b.id)
  })

  it('different requirements produce different plan ids', () => {
    const a = buildEnvironmentPlan(baseReq)
    const b = buildEnvironmentPlan({ ...baseReq, domain: 'hospital' })
    expect(a.id).not.toBe(b.id)
  })

  it('never mutates the shared warehouseTasks', () => {
    const before = JSON.stringify(warehouseTasks)
    buildEnvironmentPlan({ ...baseReq, embodiment: 'arm' })
    expect(JSON.stringify(warehouseTasks)).toBe(before)
  })

  it('domain theming does not change oracle labels (humanoid = reference physics)', () => {
    // Humanoid is identity physics, so every themed task must keep the exact oracle
    // label of its base task across every domain — theming is display-only.
    const baseLabels = warehouseTasks.map((t) => bfsOracle(t).label)
    for (const domain of PHYSICAL_DOMAINS) {
      const plan = buildEnvironmentPlan({ ...baseReq, domain, embodiment: 'humanoid' })
      const planLabels = plan.tasks.map((t) => bfsOracle(t).label)
      expect(planLabels).toEqual(baseLabels)
    }
  })

  it('embodiment constraints re-run BFS and can flip finish -> escalate', () => {
    const humanoid = buildEnvironmentPlan({ ...baseReq, embodiment: 'humanoid' })
    const arm = buildEnvironmentPlan({ ...baseReq, embodiment: 'arm' })

    // The constrained arm must earn fewer autonomous finishes than the reference.
    expect(arm.labelCounts.finish).toBeLessThan(humanoid.labelCounts.finish)

    // At least one specific task flips finish -> escalate (battery/step shortfall),
    // and no finish flips to refuse (refuse only comes from hazard/human-only cells,
    // which embodiment never moves).
    let flips = 0
    for (let i = 0; i < humanoid.tasks.length; i += 1) {
      const before = bfsOracle(humanoid.tasks[i]).label
      const after = bfsOracle(arm.tasks[i]).label
      if (before === 'finish' && after === 'escalate') flips += 1
      if (before === 'finish') expect(after).not.toBe('refuse')
    }
    expect(flips).toBeGreaterThan(0)
  })

  it('applyEmbodiment clamps budgets and clones nested geometry', () => {
    const task = warehouseTasks[0]
    const adjusted = applyEmbodiment(task, 'arm')
    expect(adjusted.battery).toBeGreaterThanOrEqual(2)
    expect(adjusted.maxSteps).toBeGreaterThanOrEqual(4)
    expect(adjusted.obstacles).not.toBe(task.obstacles)
    expect(adjusted.start).not.toBe(task.start)
  })

  it('workflow provenance can select canonical tasks without setting oracle labels', () => {
    const selectedTaskIds = ['wh-l1-01', 'wh-l3-01', 'wh-l2-03']
    const plan = buildEnvironmentPlan(baseReq, {
      domain: 'manufacturing',
      embodiment: 'humanoid',
      selectedTaskIds,
      approvedFactsHash: 'facts_demo',
      inputManifestSummary: '1 workflow video',
      frozenWorkflowSummary: 'move totes safely',
    })

    expect(plan.workflow?.selectedTaskIds).toEqual(selectedTaskIds)
    expect(plan.tasks.map((task) => task.id)).toEqual(selectedTaskIds)
    expect(plan.tasks.map((task) => bfsOracle(task).label)).toEqual(
      selectedTaskIds.map((id) => bfsOracle(warehouseTasks.find((task) => task.id === id)!).label),
    )
  })
})

describe('buildWarehouseDemoForTasks on a generated plan', () => {
  it('produces FAR/FRR baselines for the calibrated oracle and the blind baselines', () => {
    const plan = buildEnvironmentPlan(baseReq)
    const demo = buildWarehouseDemoForTasks(plan.tasks)

    expect(demo.taskCount).toBe(plan.tasks.length)
    const names = demo.baselines.map((b) => b.name)
    expect(names).toContain('calibrated oracle')
    expect(names).toContain('always finish')
    expect(names).toContain('always refuse')

    const oracle = demo.baselines.find((b) => b.name === 'calibrated oracle')!
    expect(oracle.matrix.far).toBe(0)
    expect(oracle.matrix.frr).toBe(0)

    // Blind baselines must be miscalibrated somewhere: always-refuse false-rejects
    // finishable tasks, always-finish false-accepts non-finish tasks.
    const refuse = demo.baselines.find((b) => b.name === 'always refuse')!
    const finish = demo.baselines.find((b) => b.name === 'always finish')!
    expect(refuse.matrix.frr).toBeGreaterThan(0)
    expect(finish.matrix.far).toBeGreaterThan(0)
  })

  it('triptych and reward-hack render for every domain (coverage is defensive)', () => {
    for (const domain of PHYSICAL_DOMAINS) {
      const plan = buildEnvironmentPlan({ ...baseReq, domain })
      const demo = buildWarehouseDemoForTasks(plan.tasks)
      expect(demo.triptych).toHaveLength(3)
      expect(demo.rewardHack.reward).toBe(0)
    }
  })
})
