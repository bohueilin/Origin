import { describe, it, expect } from 'vitest'
import { warehouseTasks, bfsOracle, oraclePolicy } from '../src/warehouse.ts'
import { createWarehouseEnvCore } from './origin-env-core.mjs'

const task = warehouseTasks.find((t) => bfsOracle(t).label === 'finish') ?? warehouseTasks[0]

describe('OriginEnvCore (P2) — reset/step/state kernel', () => {
  it('reset returns an initial observation, allowed actions, and is not done', () => {
    const core = createWarehouseEnvCore({ task })
    const r = core.reset()
    expect(r.done).toBe(false)
    expect(r.allowedActions).toContain('finish')
    expect(r.observation.position).toEqual(task.start)
    expect(r.observation.steps).toBe(0)
  })

  it('step advances an IMMUTABLE state (the input state is never mutated)', () => {
    const core = createWarehouseEnvCore({ task })
    const { state } = core.reset()
    const before = JSON.stringify(state)
    const r = core.step(state, 'observe')
    expect(JSON.stringify(state)).toBe(before) // input untouched
    expect(r.state).not.toBe(state)
    expect(r.observation.observed).toBe(true)
    expect(r.observation.steps).toBe(1)
  })

  it('state()/peek does NOT advance the simulation', () => {
    const core = createWarehouseEnvCore({ task })
    const { state } = core.reset()
    const a = core.peek(state)
    const b = core.peek(state)
    expect(a.observation.steps).toBe(0)
    expect(b.observation.steps).toBe(0)
    expect(a).toEqual(b)
  })

  it('driving the oracle path reaches the finish terminal and is done', () => {
    const core = createWarehouseEnvCore({ task })
    let { state } = core.reset()
    let last
    for (const action of oraclePolicy(task)) {
      last = core.step(state, action)
      state = last.state
      if (last.done) break
    }
    expect(last.terminal).toBe('finish')
    expect(last.done).toBe(true)
  })
})
