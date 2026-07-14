import { describe, it, expect } from 'vitest'
import { buildWarehouseScene, simulate } from '../src/simulation/warehouseSim'

// The verified warehouse sim (the physical actor of "one evidence spine, two actors").
// The load-bearing invariants: it is deterministic, no executed step ever collides, and the
// run verdict is Origin's own oracle terminal (finish/escalate/refuse) — never fabricated.

describe('warehouse simulation', () => {
  it('runs deterministically — same seed yields a byte-identical run', () => {
    const a = simulate(buildWarehouseScene({ seed: 20260713, robots: 4 }))
    const b = simulate(buildWarehouseScene({ seed: 20260713, robots: 4 }))
    expect(JSON.stringify(a.digest_input)).toBe(JSON.stringify(b.digest_input))
    expect(a.frames.length).toBe(b.frames.length)
  })

  it('never executes a collision — no two robots share a cell in any frame', () => {
    const r = simulate(buildWarehouseScene({ seed: 20260713, robots: 6 }))
    for (const f of r.frames) {
      const active = f.robots.filter((x) => !x.done)
      const cells = new Set(active.map((x) => `${x.pos.x},${x.pos.y}`))
      expect(cells.size).toBe(active.length) // all distinct => no overlap
    }
    expect(r.score.collisions).toBe(0)
  })

  it('never steps a robot onto the human (people first)', () => {
    const r = simulate(buildWarehouseScene({ seed: 20260713, robots: 6 }))
    for (const f of r.frames) {
      for (const x of f.robots) {
        if (!x.done) expect(x.pos.x === f.human.x && x.pos.y === f.human.y).toBe(false)
      }
    }
  })

  it('the verdict is a real oracle terminal and matches the per-robot labels', () => {
    const r = simulate(buildWarehouseScene({ seed: 20260713, robots: 4 }))
    expect(['finish', 'escalate', 'refuse']).toContain(r.verdict)
    if (r.per_robot.some((p) => p.oracle_label === 'refuse')) expect(r.verdict).toBe('refuse')
    if (r.verdict === 'finish') {
      expect(r.per_robot.every((p) => p.oracle_label === 'finish')).toBe(true)
      expect(r.score.orders_fulfilled).toBe(r.score.orders_total)
    }
  })

  it('produces a signable digest input bound to the scene + verdict', () => {
    const r = simulate(buildWarehouseScene({ seed: 42, robots: 3 }))
    const d = r.digest_input as { kind: string; verdict: string; robots: unknown[] }
    expect(d.kind).toBe('warehouse-sim-run')
    expect(d.verdict).toBe(r.verdict)
    expect(d.robots.length).toBe(3)
  })
})
