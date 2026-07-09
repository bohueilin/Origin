import { describe, expect, it } from 'vitest'
import { warehouseTasks, bfsOracle, type GridPos, type WarehouseTask } from './warehouse'

// Metamorphic / generative hardening of the deterministic BFS oracle — the moat
// on the digital-warehouse side. The example suite (warehouse.test.ts) pins the
// oracle's verdicts on the curated tasks; this suite proves the INVARIANTS hold
// under generated perturbations of those tasks:
//
//   * the oracle is a pure, idempotent function of the task;
//   * reachability is monotone — adding an obstacle can only lengthen or break a
//     route, never create one (so a 'finish' can never be manufactured by adding
//     walls, and a policy 'refuse' can never be lifted by adding walls).
//
// Perturbing the KNOWN-VALID tasks (rather than synthesizing grids) keeps every
// generated case well-formed while still covering hundreds of (task, cell) pairs.

const reserved = (t: WarehouseTask): GridPos[] => [
  t.start, t.item, t.drop, ...t.obstacles, ...t.hazards, ...t.humanOnly,
]
const eq = (a: GridPos, b: GridPos) => a.x === b.x && a.y === b.y

/** Every free cell — a valid place to drop one extra obstacle. */
function freeCells(t: WarehouseTask): GridPos[] {
  const taken = reserved(t)
  const out: GridPos[] = []
  for (let y = 0; y < t.height; y++)
    for (let x = 0; x < t.width; x++)
      if (!taken.some((p) => eq(p, { x, y }))) out.push({ x, y })
  return out
}

const withObstacle = (t: WarehouseTask, cell: GridPos): WarehouseTask => ({
  ...t,
  obstacles: [...t.obstacles, cell],
})

describe('bfsOracle — determinism', () => {
  it('is idempotent: two calls on the same task give an identical verdict', () => {
    for (const task of warehouseTasks) {
      const a = bfsOracle(task)
      const b = bfsOracle(task)
      expect(a).toEqual(b)
    }
  })
})

describe('bfsOracle — reachability is monotone under added obstacles', () => {
  it('adding one obstacle never creates a route (finish path only grows or breaks)', () => {
    let checked = 0
    for (const task of warehouseTasks) {
      const base = bfsOracle(task)
      for (const cell of freeCells(task)) {
        const after = bfsOracle(withObstacle(task, cell))
        checked++
        if (after.label === 'finish') {
          // a finish after adding a wall requires the base to have already been a
          // finish, and the route can only be as long or longer (never shorter).
          expect(base.label).toBe('finish')
          expect(after.pathLength).toBeGreaterThanOrEqual(base.pathLength)
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('a policy refusal can never be lifted by adding obstacles', () => {
    for (const task of warehouseTasks) {
      if (bfsOracle(task).label !== 'refuse') continue
      for (const cell of freeCells(task)) {
        // hard refusal is policy-driven (hazard / human-only), so more walls can
        // never turn it into a finish.
        expect(bfsOracle(withObstacle(task, cell)).label).not.toBe('finish')
      }
    }
  })
})
