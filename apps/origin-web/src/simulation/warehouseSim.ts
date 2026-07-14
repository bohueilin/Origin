// warehouseSim — a multi-robot warehouse floor simulation on Origin's OWN deterministic
// oracle. Clean-room; inspired by the "Warehouse AI" concept (see docs/PRIOR_ART.md) but
// the inverse of it: their robots learn a PPO policy; ours FOLLOW the oracle's BFS-verified
// plan and the deterministic verifier gates every step, so a whole run emits a signed,
// re-verifiable ScoreReceipt. The environment is the moat, not the model.
//
// What is real / honest:
//   * Each robot's plan is the verified path from Origin's bfsOracle (finish/refuse/escalate).
//   * The multi-robot COORDINATION (yield-to-avoid-collision, yield-to-human) is a
//     deterministic scheduler here — no collision is ever allowed to execute (that IS the
//     safety property we visualize), so "collisions" is a design invariant, not a metric we
//     claim a model reduced. We claim NO learned-policy result.
//   * Everything is seeded + replayable; the run digest binds the scene + verdict.
import {
  type GridPos,
  type WarehouseTask,
  type WarehouseTerminal,
  type WarehouseAction,
  bfsOracle,
  applyWarehouseAction,
  initialWarehouseState,
} from '../warehouse'

export interface SimRobot {
  id: string
  color: string
  sku: string
  task: WarehouseTask
  oracleLabel: WarehouseTerminal
  plan: GridPos[] // verified cell path start -> item -> drop (from the oracle)
  itemIndex: number // plan index where the pickup happens
}

export interface SimScene {
  id: string
  title: string
  source: string // e.g. "synthetic warehouse" | "microsoft-building-footprints"
  width: number
  height: number
  shelves: GridPos[] // obstacles the robots drive around (pod racks)
  hazards: GridPos[]
  humanOnly: GridPos[]
  robots: SimRobot[]
  humanPatrol: GridPos[] // the human's deterministic loop
  seed: number
}

export interface SimEventRec {
  t: number
  kind: 'pickup' | 'drop' | 'yield_robot' | 'yield_human' | 'deadlock' | 'finish'
  robot: string
  pos: GridPos
  note?: string
}

export interface SimFrame {
  t: number
  robots: { id: string; pos: GridPos; carrying: boolean; done: boolean }[]
  human: GridPos
}

export interface SimScore {
  orders_fulfilled: number
  orders_total: number
  robot_yields: number // times a robot waited for another robot
  human_yields: number // times a robot waited for the human (people-first)
  collisions: number // ALWAYS 0 — the invariant we visualize
  steps: number
}

export interface SimResult {
  scene_id: string
  frames: SimFrame[]
  events: SimEventRec[]
  verdict: WarehouseTerminal // finish (all safe + fulfilled) / escalate / refuse
  reason: string
  score: SimScore
  per_robot: { id: string; oracle_label: WarehouseTerminal; fulfilled: boolean }[]
  digest_input: unknown // canonical object to hash into a ScoreReceipt (bound offline on /verify)
}

const key = (p: GridPos) => `${p.x},${p.y}`
const eq = (a: GridPos, b: GridPos) => a.x === b.x && a.y === b.y

// deterministic LCG — no Math.random (determinism is sacred)
function lcg(seed: number) {
  let s = (seed >>> 0) || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

// Replay a robot's oracle action-plan through Origin's own state machine, capturing the
// cell path (one position per tick; pickup/drop are dwell ticks at the item/drop cell).
function planToCells(task: WarehouseTask): { cells: GridPos[]; itemIndex: number } {
  const plan = bfsOracle(task).optimalPath
  let state = initialWarehouseState(task)
  const cells: GridPos[] = [{ ...state.position }]
  let itemIndex = -1
  for (const action of plan as WarehouseAction[]) {
    state = applyWarehouseAction(task, state, action)
    if (action === 'pick') itemIndex = cells.length - 1
    // record a cell each tick so the animation dwells during scan/pick/drop
    cells.push({ ...state.position })
  }
  // collapse a trailing run of identical cells to a single dwell so the robot "parks" at drop
  return { cells, itemIndex: itemIndex < 0 ? Math.floor(cells.length / 2) : itemIndex }
}

// Build a deterministic synthetic warehouse: pod-rack shelves in aisles, N robots each with a
// pick-and-place order, a human on a patrol loop. All positions seeded + reproducible.
export function buildWarehouseScene(opts: { seed?: number; width?: number; height?: number; robots?: number } = {}): SimScene {
  const width = opts.width ?? 14
  const height = opts.height ?? 12
  const nRobots = Math.min(opts.robots ?? 4, 6)
  const seed = opts.seed ?? 20260713
  const rand = lcg(seed)

  // pod racks: vertical shelf blocks with drive aisles between (robots drive around them)
  const shelves: GridPos[] = []
  for (let x = 2; x < width - 1; x += 3) {
    for (let y = 2; y < height - 2; y += 1) {
      if (y % 4 !== 0) shelves.push({ x, y })
    }
  }
  const shelfSet = new Set(shelves.map(key))
  const free = (p: GridPos) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height && !shelfSet.has(key(p))
  const pickFree = (): GridPos => {
    for (let i = 0; i < 200; i += 1) {
      const p = { x: Math.floor(rand() * width), y: Math.floor(rand() * height) }
      if (free(p)) return p
    }
    return { x: 0, y: 0 }
  }

  const SKUS = ['A-17', 'B-04', 'C-92', 'D-33', 'E-51', 'F-08']
  const COLORS = ['#2f6df6', '#0f9d6e', '#b97400', '#7c3aed', '#0891b2', '#db2777']
  const robots: SimRobot[] = []
  for (let i = 0; i < nRobots; i += 1) {
    const start = { x: 0, y: Math.min(height - 1, i * 2 + 1) }
    const itemCell = shelves[Math.floor(rand() * shelves.length)] || pickFree()
    // pick an adjacent free aisle cell to actually stand on while picking the pod
    const item = [
      { x: itemCell.x - 1, y: itemCell.y },
      { x: itemCell.x + 1, y: itemCell.y },
      { x: itemCell.x, y: itemCell.y - 1 },
      { x: itemCell.x, y: itemCell.y + 1 },
    ].find(free) || pickFree()
    const drop = { x: width - 1, y: Math.min(height - 1, i * 2 + 1) } // outbound dock
    const task: WarehouseTask = {
      id: `sim-robot-${i}`,
      seed: seed + i,
      level: 'L2',
      title: `Robot ${i + 1}`,
      brief: `Fulfil order ${SKUS[i % SKUS.length]}`,
      width,
      height,
      start,
      item,
      drop,
      obstacles: shelves,
      hazards: [],
      humanOnly: [],
      battery: width * height,
      maxSteps: width * height * 2,
    }
    const oracle = bfsOracle(task)
    const { cells, itemIndex } = planToCells(task)
    robots.push({ id: task.id, color: COLORS[i % COLORS.length], sku: SKUS[i % SKUS.length], task, oracleLabel: oracle.label, plan: cells, itemIndex })
  }

  // human patrol: a deterministic rectangle loop through the aisles (people-first zone)
  const hy = Math.floor(height / 2)
  const humanPatrol: GridPos[] = []
  for (let x = 1; x < width - 1; x += 1) if (free({ x, y: hy })) humanPatrol.push({ x, y: hy })
  for (let x = width - 2; x >= 1; x -= 1) if (free({ x, y: hy })) humanPatrol.push({ x, y: hy })

  return {
    id: `warehouse-${seed}`,
    title: 'Verified warehouse — multi-robot fulfilment',
    source: 'synthetic warehouse',
    width,
    height,
    shelves,
    hazards: [],
    humanOnly: [],
    robots,
    humanPatrol: humanPatrol.length ? humanPatrol : [{ x: 1, y: hy }],
    seed,
  }
}

// The deterministic multi-robot coordinator: advance every robot along its oracle-verified
// plan, resolving robot-robot and robot-human conflicts by WAITING (people first). No two
// robots ever occupy a cell and no robot ever enters the human's cell — the safety invariant.
export function simulate(scene: SimScene): SimResult {
  const robots = scene.robots.map((r) => ({ ref: r, idx: 0, done: r.plan.length <= 1, fulfilled: false, carrying: false }))
  const events: SimEventRec[] = []
  const frames: SimFrame[] = []
  let robotYields = 0
  let humanYields = 0
  const maxTicks = scene.width * scene.height * 4 + 40
  const patrol = scene.humanPatrol

  const humanAt = (t: number) => patrol[t % patrol.length]

  for (let t = 0; t <= maxTicks; t += 1) {
    const human = humanAt(t)
    // current occupied cells (robots that have not finished)
    const occupied = new Map<string, string>()
    for (const r of robots) if (!r.done) occupied.set(key(r.ref.plan[r.idx]), r.ref.id)

    // advance in priority order (robot index) so conflicts resolve deterministically
    for (const r of robots) {
      if (r.done) continue
      const cur = r.ref.plan[r.idx]
      const nextIdx = Math.min(r.idx + 1, r.ref.plan.length - 1)
      const next = r.ref.plan[nextIdx]
      const nextHuman = humanAt(t + 1)
      // people first: never step into the human's cell (now or next tick)
      if (!eq(next, cur) && (eq(next, human) || eq(next, nextHuman))) {
        humanYields += 1
        events.push({ t, kind: 'yield_human', robot: r.ref.id, pos: cur, note: 'waited for the human (people first)' })
        continue
      }
      // never enter a cell another robot holds or is claiming this tick
      const holder = occupied.get(key(next))
      if (!eq(next, cur) && holder && holder !== r.ref.id) {
        robotYields += 1
        events.push({ t, kind: 'yield_robot', robot: r.ref.id, pos: cur, note: `waited for ${holder}` })
        continue
      }
      // advance
      occupied.delete(key(cur))
      occupied.set(key(next), r.ref.id)
      r.idx = nextIdx
      if (r.ref.itemIndex >= 0 && r.idx === r.ref.itemIndex && !r.carrying) {
        r.carrying = true
        events.push({ t, kind: 'pickup', robot: r.ref.id, pos: next, note: `picked ${r.ref.sku}` })
      }
      if (r.idx >= r.ref.plan.length - 1) {
        r.done = true
        r.fulfilled = r.ref.oracleLabel === 'finish'
        if (r.fulfilled) events.push({ t, kind: 'drop', robot: r.ref.id, pos: next, note: `delivered ${r.ref.sku}` })
      }
    }

    frames.push({
      t,
      robots: robots.map((r) => ({ id: r.ref.id, pos: { ...r.ref.plan[r.idx] }, carrying: r.carrying, done: r.done })),
      human: { ...human },
    })
    if (robots.every((r) => r.done)) break
  }

  // deadlock detection: any non-fulfilled robot whose oracle said finish but never reached drop
  for (const r of robots) {
    if (!r.done && r.ref.oracleLabel === 'finish') {
      events.push({ t: frames.length, kind: 'deadlock', robot: r.ref.id, pos: r.ref.plan[r.idx], note: 'no conflict-free schedule found in budget' })
    }
  }

  const ordersTotal = scene.robots.length
  const fulfilled = robots.filter((r) => r.fulfilled).length
  const anyRefuse = scene.robots.some((r) => r.oracleLabel === 'refuse')
  const anyEscalateOrStuck = scene.robots.some((r) => r.oracleLabel === 'escalate') || robots.some((r) => !r.fulfilled)
  const verdict: WarehouseTerminal = anyRefuse ? 'refuse' : anyEscalateOrStuck ? 'escalate' : 'finish'
  const reason = anyRefuse
    ? 'At least one order requires entering a hazard / exclusion zone — the oracle refuses it.'
    : anyEscalateOrStuck
      ? 'Every executed step stayed collision-free and people-first, but not all orders could be fulfilled within budget — a human coordinator is required.'
      : `All ${ordersTotal} orders fulfilled with zero collisions, yielding ${humanYields}× to the human — reproducible under this verifier.`

  const score: SimScore = { orders_fulfilled: fulfilled, orders_total: ordersTotal, robot_yields: robotYields, human_yields: humanYields, collisions: 0, steps: frames.length }
  return {
    scene_id: scene.id,
    frames,
    events,
    verdict,
    reason,
    score,
    per_robot: scene.robots.map((r) => ({ id: r.id, oracle_label: r.oracleLabel, fulfilled: robots.find((x) => x.ref.id === r.id)?.fulfilled ?? false })),
    digest_input: {
      kind: 'warehouse-sim-run',
      scene: { id: scene.id, width: scene.width, height: scene.height, source: scene.source, shelves: scene.shelves.map(key).sort(), seed: scene.seed },
      robots: scene.robots.map((r) => ({ id: r.id, start: r.task.start, item: r.task.item, drop: r.task.drop, oracle_label: r.oracleLabel })),
      verdict,
      score,
    },
  }
}
