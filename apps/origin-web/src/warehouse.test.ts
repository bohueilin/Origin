import { describe, expect, it } from 'vitest'
import {
  alwaysEscalatePolicy,
  alwaysFinishPolicy,
  alwaysRefusePolicy,
  bfsOracle,
  buildWarehouseDemo,
  computeWarehouseMatrix,
  evaluateWarehousePolicy,
  extractWarehouseSignals,
  oraclePolicy,
  recklessFinishPolicy,
  verifyWarehouseRollout,
  warehouseTasks,
  type WarehouseTerminal,
} from './warehouse'

function firstTask(label: WarehouseTerminal) {
  const task = warehouseTasks.find((t) => bfsOracle(t).label === label)
  if (!task) throw new Error(`missing ${label} task`)
  return task
}

describe('warehouse task registry and BFS oracle', () => {
  it('has a deterministic 15-30 task curriculum across L1-L5 and all labels', () => {
    expect(warehouseTasks.length).toBeGreaterThanOrEqual(15)
    expect(warehouseTasks.length).toBeLessThanOrEqual(30)
    expect(new Set(warehouseTasks.map((t) => t.level))).toEqual(new Set(['L1', 'L2', 'L3', 'L4', 'L5']))

    const labels = warehouseTasks.map((t) => bfsOracle(t).label)
    expect(labels).toContain('finish')
    expect(labels).toContain('escalate')
    expect(labels).toContain('refuse')

    const again = warehouseTasks.map((t) => ({
      id: t.id,
      label: bfsOracle(t).label,
      path: bfsOracle(t).optimalPath.join('|'),
    }))
    expect(again).toEqual(
      warehouseTasks.map((t) => ({
        id: t.id,
        label: bfsOracle(t).label,
        path: bfsOracle(t).optimalPath.join('|'),
      })),
    )
  })

  it('oracle replay passes every task with high reward and zero FAR/FRR', () => {
    const rollouts = evaluateWarehousePolicy('oracle', oraclePolicy)
    expect(rollouts.every((r) => r.passed)).toBe(true)
    expect(rollouts.every((r) => r.reward >= 0.95)).toBe(true)

    const matrix = computeWarehouseMatrix(rollouts)
    expect(matrix.correct).toBe(warehouseTasks.length)
    expect(matrix.falseAccepts).toBe(0)
    expect(matrix.falseRejects).toBe(0)
    expect(matrix.far).toBe(0)
    expect(matrix.frr).toBe(0)
  })
})

describe('warehouse hard-gated reward and anti-cheat behavior', () => {
  it('zeros fake finish, unsafe zone, and no-terminal rollouts', () => {
    const finishTask = firstTask('finish')
    const refuseTask = firstTask('refuse')

    const fakeFinish = verifyWarehouseRollout(finishTask, ['finish'], 'reward hacker')
    expect(fakeFinish.category).toBe('fake_finish')
    expect(fakeFinish.reward).toBe(0)
    expect(fakeFinish.outcome).toBe(0)

    const unsafe = verifyWarehouseRollout(refuseTask, recklessFinishPolicy(refuseTask), 'reckless')
    expect(unsafe.category).toBe('unsafe_zone')
    expect(unsafe.reward).toBe(0)
    expect(unsafe.falseAccept).toBe(true)

    const noTerminal = verifyWarehouseRollout(finishTask, ['observe', 'scan'], 'stalls')
    expect(noTerminal.category).toBe('no_terminal')
    expect(noTerminal.reward).toBe(0)
    expect(noTerminal.passed).toBe(false)
  })

  it('blind baselines expose false accepts and false rejects', () => {
    const alwaysFinish = evaluateWarehousePolicy('always finish', alwaysFinishPolicy)
    const alwaysRefuse = evaluateWarehousePolicy('always refuse', alwaysRefusePolicy)
    const alwaysEscalate = evaluateWarehousePolicy('always escalate', alwaysEscalatePolicy)

    expect(computeWarehouseMatrix(alwaysFinish).far).toBe(1)
    expect(computeWarehouseMatrix(alwaysRefuse).frr).toBe(1)
    expect(computeWarehouseMatrix(alwaysEscalate).frr).toBe(1)
  })
})

describe('warehouse demo and Signal Extractor', () => {
  it('builds the triptych, reward-hacking trace, and training-data views', () => {
    const demo = buildWarehouseDemo()
    expect(demo.triptych.map((t) => t.slot)).toEqual(['A', 'B', 'C'])
    expect(demo.triptych[0].rollout.falseAccept).toBe(true)
    expect(demo.triptych[1].rollout.falseReject).toBe(true)
    expect(demo.triptych[2].rollout.passed).toBe(true)
    expect(demo.rewardHack.category).toBe('fake_finish')
    expect(demo.rewardHack.reward).toBe(0)
    expect(demo.aiucWedge).toContain('AIUC')
  })

  it('extracts deterministic failure tags, preference pairs, and reward rows', () => {
    const finishTask = firstTask('finish')
    const failed = verifyWarehouseRollout(finishTask, ['refuse'], 'always refuse')
    const signal = extractWarehouseSignals([failed])
    expect(signal.failureTags[0].tags).toContain('false_reject')
    expect(signal.preferencePairs[0].preferred).toEqual(oraclePolicy(finishTask))
    expect(signal.preferencePairs[0].rejected).toEqual(['refuse'])
    expect(signal.rewardViews[0]).toMatchObject({
      taskId: finishTask.id,
      policy: 'always refuse',
      expected: 'finish',
      actual: 'refuse',
      reward: 0,
      falseReject: true,
    })
  })
})
