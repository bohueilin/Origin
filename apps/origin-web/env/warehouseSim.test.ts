import { describe, it, expect } from 'vitest'
import { buildWarehouseScene, simulate, countCollisionEvents, type SimFrame } from '../src/simulation/warehouseSim'

// The verified warehouse sim (an Origin Labs experiment). The load-bearing properties: it is
// deterministic, no two robots still on their routes share a cell, collision events are
// counted from the frames (a counted event demotes the run to escalate), and the run verdict
// is Origin's own oracle terminal (finish/escalate/refuse) — never fabricated.

// An independent recount of collision events, written apart from countCollisionEvents: for
// each pair of movers (every robot by id, then the human marker), walk the pair's positions
// and count the ticks at which it starts touching (one cell, or swapped cells since the
// previous frame). A pair that stays touching counts once until it separates.
function recount(frames: SimFrame[]): number {
  const ids = [...frames[0].robots.map((x) => x.id), 'human']
  const track = (id: string) => frames.map((f) => (id === 'human' ? f.human : f.robots.find((x) => x.id === id)!.pos))
  const same = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x === b.x && a.y === b.y
  let n = 0
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = track(ids[i])
      const b = track(ids[j])
      let together = false
      for (let t = 0; t < frames.length; t += 1) {
        const touch = same(a[t], b[t]) || (t > 0 && same(a[t], b[t - 1]) && same(b[t], a[t - 1]))
        if (touch && !together) n += 1
        together = touch
      }
    }
  }
  return n
}

describe('warehouse simulation', () => {
  it('runs deterministically — same seed yields a byte-identical run', () => {
    const a = simulate(buildWarehouseScene({ seed: 20260713, robots: 4 }))
    const b = simulate(buildWarehouseScene({ seed: 20260713, robots: 4 }))
    expect(JSON.stringify(a.digest_input)).toBe(JSON.stringify(b.digest_input))
    expect(a.frames.length).toBe(b.frames.length)
  })

  it('no two robots still on their routes share a cell, and the collision count matches an independent recount', () => {
    const r = simulate(buildWarehouseScene({ seed: 20260713, robots: 6 }))
    for (const f of r.frames) {
      const active = f.robots.filter((x) => !x.done)
      const cells = new Set(active.map((x) => `${x.pos.x},${x.pos.y}`))
      expect(cells.size).toBe(active.length) // all distinct => no overlap
    }
    expect(r.score.collisions).toBe(recount(r.frames))
  })

  it('recount fixture: the default run (seed 20260713, 4 robots) counts exactly one event, a robot and the human marker swapping cells at t=11 to 12', () => {
    const r = simulate(buildWarehouseScene({ seed: 20260713, robots: 4 }))
    expect(r.score.collisions).toBe(1)
    expect(recount(r.frames)).toBe(1)
    expect(r.frames[12].t).toBe(12)
    const robot = (t: number) => r.frames[t].robots.find((x) => x.id === 'sim-robot-3')!.pos
    expect([robot(11), r.frames[11].human]).toEqual([{ x: 6, y: 6 }, { x: 7, y: 6 }])
    expect([robot(12), r.frames[12].human]).toEqual([{ x: 7, y: 6 }, { x: 6, y: 6 }])
    expect(countCollisionEvents(r.frames.slice(0, 12))).toBe(0)
    expect(countCollisionEvents(r.frames.slice(0, 13))).toBe(1)
  })

  it('parked-robot fixture: a moving robot entering a finished robot\'s parked cell counts (seed 20260713, 6 robots, t=23)', () => {
    const r = simulate(buildWarehouseScene({ seed: 20260713, robots: 6 }))
    expect(r.frames[23].t).toBe(23)
    const at = (t: number, id: string) => r.frames[t].robots.find((x) => x.id === id)!
    expect(at(22, 'sim-robot-4')).toMatchObject({ pos: { x: 13, y: 9 }, done: true })
    expect(at(22, 'sim-robot-5').pos).not.toEqual({ x: 13, y: 9 })
    expect(at(23, 'sim-robot-4')).toMatchObject({ pos: { x: 13, y: 9 }, done: true })
    expect(at(23, 'sim-robot-5')).toMatchObject({ pos: { x: 13, y: 9 }, done: false })
    expect(countCollisionEvents(r.frames.slice(0, 23)) + 1).toBe(countCollisionEvents(r.frames.slice(0, 24)))
    expect(r.score.collisions).toBe(recount(r.frames))
  })

  it('the count matches the recount on a busy six-robot run, where the human marker walks through waiting robots', () => {
    const r = simulate(buildWarehouseScene({ seed: 5114, robots: 6 }))
    expect(r.score.collisions).toBeGreaterThan(10)
    expect(r.score.collisions).toBe(recount(r.frames))
    expect(r.verdict).toBe('escalate')
  })

  it('counts the onset only: a pair that stays together counts once, and again after it separates', () => {
    const frame = (t: number, x: number): SimFrame => ({ t, robots: [{ id: 'r', pos: { x: 1, y: 1 }, carrying: false, done: true }], human: { x, y: 1 } })
    expect(countCollisionEvents([frame(0, 1), frame(1, 1), frame(2, 1)])).toBe(1)
    expect(countCollisionEvents([frame(0, 1), frame(1, 1), frame(2, 2), frame(3, 1)])).toBe(2)
  })

  it('hand-made frames: robot-robot swaps and several robots meeting in one tick count per pair', () => {
    // Each step lists the robots' cells; the human marker stays apart at (9,9).
    const run = (...steps: [number, number][][]): SimFrame[] => steps.map((cells, t) => ({
      t,
      robots: cells.map(([x, y], i) => ({ id: `r${i}`, pos: { x, y }, carrying: false, done: false })),
      human: { x: 9, y: 9 },
    }))
    const cases: [string, SimFrame[], number][] = [
      ['two robots swap cells', run([[0, 0], [1, 0]], [[1, 0], [0, 0]]), 1],
      ['three robots enter one cell', run([[0, 0], [2, 0], [1, 1]], [[1, 0], [1, 0], [1, 0]]), 3],
      ['A and B swap while C enters A\'s new cell', run([[0, 0], [1, 0], [2, 0]], [[1, 0], [0, 0], [1, 0]]), 2],
      ['a swap, then a swap back', run([[0, 0], [1, 0]], [[1, 0], [0, 0]], [[0, 0], [1, 0]]), 1],
    ]
    for (const [name, frames, events] of cases) {
      expect(countCollisionEvents(frames), name).toBe(events)
      expect(recount(frames), name).toBe(events)
    }
  })

  it('a counted collision event demotes the run to escalate; a run with none and every order delivered finishes', () => {
    const r = simulate(buildWarehouseScene({ seed: 20260713, robots: 4 }))
    expect(r.score.orders_fulfilled).toBe(r.score.orders_total)
    expect(r.verdict).toBe('escalate')
    expect(r.reason).toBe('1 collision event counted between robots or with the human marker. A human coordinator is required.')
    const clean = simulate(buildWarehouseScene({ seed: 42, robots: 3 }))
    expect(clean.score.collisions).toBe(0)
    expect(clean.score.orders_fulfilled).toBe(clean.score.orders_total)
    expect(clean.verdict).toBe('finish')
  })

  it('a run that leaves orders undelivered with no collision event counted escalates (seed 9, 2 robots)', () => {
    const r = simulate(buildWarehouseScene({ seed: 9, robots: 2 }))
    expect(r.score.collisions).toBe(0)
    expect(r.score.orders_fulfilled).toBeLessThan(r.score.orders_total)
    expect(r.verdict).toBe('escalate')
    expect(r.reason).toBe('Not every order was delivered: the coordinator could not schedule every route, or the oracle escalated an order. A human coordinator is required.')
  })

  it('never steps a robot onto the human marker', () => {
    // A robot that moved since the previous frame is never on the human marker's cell. The
    // marker itself does not yield, so it can walk onto a waiting robot (seed 5114, 6 robots).
    for (const [seed, robots] of [[20260713, 4], [20260713, 6], [5114, 6], [42, 3], [1, 5]]) {
      const { frames } = simulate(buildWarehouseScene({ seed, robots }))
      for (let t = 1; t < frames.length; t += 1) {
        frames[t].robots.forEach((x, i) => {
          const was = frames[t - 1].robots[i].pos
          if (x.pos.x !== was.x || x.pos.y !== was.y) expect(x.pos, `seed ${seed}, ${robots} robots, ${x.id}, t=${t}`).not.toEqual(frames[t].human)
        })
      }
    }
  })

  it('the verdict is a real oracle terminal and matches the per-robot labels', () => {
    // Seed 20260713 with 4 robots escalates on a counted event; seed 42 with 3 robots finishes.
    const runs = [simulate(buildWarehouseScene({ seed: 20260713, robots: 4 })), simulate(buildWarehouseScene({ seed: 42, robots: 3 }))]
    expect(runs.map((r) => r.verdict)).toEqual(['escalate', 'finish'])
    for (const r of runs) {
      expect(['finish', 'escalate', 'refuse']).toContain(r.verdict)
      // A counted collision event is checked first and escalates, so a refuse label sets the
      // verdict only when no collision event is counted.
      if (r.score.collisions === 0 && r.per_robot.some((p) => p.oracle_label === 'refuse')) expect(r.verdict).toBe('refuse')
      if (r.verdict === 'finish') {
        expect(r.per_robot.every((p) => p.oracle_label === 'finish')).toBe(true)
        expect(r.score.orders_fulfilled).toBe(r.score.orders_total)
      }
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
