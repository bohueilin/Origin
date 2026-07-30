// ----------------------------------------------------------------------------
// floorMargin — how easily does a finish verdict stop being true?
//
// Two exact, honestly-separated robustness numbers for a floor whose oracle
// verdict is 'finish':
//
//   criticalCells (budget-AWARE, single failures): every free cell whose
//     blocking flips the verdict away from finish. Computed by exhaustive
//     sweep — block the cell, re-run the full oracle (budgets included), read
//     the verdict. Exact for k=1, and it sees battery kills: a blockage that
//     leaves the floor connected but pushes every remaining route over budget.
//
//   disconnectionMargin (budget-BLIND): the minimum number of free cells whose
//     removal disconnects start→item or item→drop in the safe-cell graph.
//     Exact min vertex cut via max-flow (vertex splitting, unit capacities).
//     This is an UPPER bound on the true budget-aware margin and is always
//     labeled budget-blind — the two numbers are never blended.
//
// Same verdict semantics as the parse endpoint: siteMapToWarehouseTask + the
// 'amr' embodiment + the porous refuse/escalate split. Deterministic; the
// report carries a canonical-JSON SHA-256 digest.
//
// Isomorphic on purpose (no node imports): the UI computes this in the browser
// on the parsed floor — the chokepoint overlay is client-verified, not
// server-asserted.
// ----------------------------------------------------------------------------

import { bfsOracle, type WarehouseTask, type WarehouseTerminal, type GridPos } from './warehouse'
import { siteMapToWarehouseTask } from './siteEval'
import type { DescriptiveSiteMap } from './workflowDraft'
import { sha256 } from './passport/hash'

export interface FloorMarginReport {
  verdict: WarehouseTerminal
  /** True iff no single blocked cell flips a finish verdict (budget-aware, exact). */
  singleFailureSafe: boolean
  /** Every free cell whose single blocking flips the verdict (empty unless verdict is finish). */
  criticalCells: GridPos[]
  /** Exact min vertex cut over BLOCKABLE FREE cells (anchors are never
   *  cuttable) disconnecting the safe route graph — BUDGET-BLIND upper bound.
   *  0 when not finish; null when no set of free cells can disconnect it at
   *  all (e.g. anchors mutually adjacent). */
  disconnectionMargin: number | null
  /** Free cells swept (transparency about the exhaustiveness claim). */
  sweptCells: number
  scope: string
  digest: string
}

const key = (p: GridPos): string => `${p.x},${p.y}`

const canonical = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map((x) => canonical(x === undefined ? null : x)).join(',')}]`
  const o = v as Record<string, unknown>
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`
}

/** Endpoint-parity verdict: finish, else porous re-run splits refuse/escalate. */
function taskVerdict(task: WarehouseTask): WarehouseTerminal {
  const oracle = bfsOracle(task)
  if (oracle.label === 'finish') return 'finish'
  const porous = bfsOracle({ ...task, hazards: [], humanOnly: [] })
  return porous.label === 'finish' ? 'refuse' : 'escalate'
}

// ---- exact min vertex cut via max-flow (Dinic-lite on unit vertex capacities) ----
//
// Grid graph over SAFE cells (not wall/hazard/human-only). Every cuttable cell
// splits into in→out with capacity 1; adjacency edges have capacity ∞
// (represented as a large int). Max-flow source(out)→sink(in) = min number of
// cuttable cells whose removal disconnects the pair (Menger).
//
// ALL THREE anchors are uncuttable on EVERY leg — the adversarial review
// demonstrated the old per-leg version counting the third anchor (e.g. the
// drop, sitting on a start→item bottleneck) as a capacity-1 cut cell,
// understating the margin below its own "free cells" definition. `uncuttable`
// carries the full anchor set. A flow ≥ INF means no set of free cells can
// disconnect the pair (e.g. the terminals are adjacent) — reported as null by
// the caller, never as a number.
function minVertexCut(task: WarehouseTask, from: GridPos, to: GridPos, uncuttable: ReadonlySet<string>): number {
  const solid = new Set([...task.obstacles, ...task.hazards, ...task.humanOnly].map(key))
  if (solid.has(key(from)) || solid.has(key(to))) return 0
  const idOf = new Map<string, number>()
  const cells: GridPos[] = []
  for (let y = 0; y < task.height; y += 1)
    for (let x = 0; x < task.width; x += 1) {
      const k = `${x},${y}`
      if (solid.has(k)) continue
      idOf.set(k, cells.length)
      cells.push({ x, y })
    }
  if (!idOf.has(key(from)) || !idOf.has(key(to))) return 0
  const N = cells.length
  const IN = (i: number): number => i * 2
  const OUT = (i: number): number => i * 2 + 1
  const INF = 1 << 28

  // adjacency: to/cap/rev arrays (classic max-flow structure)
  const graphTo: number[][] = Array.from({ length: N * 2 }, () => [])
  const graphCap: number[][] = Array.from({ length: N * 2 }, () => [])
  const graphRev: number[][] = Array.from({ length: N * 2 }, () => [])
  const addEdge = (u: number, v: number, cap: number): void => {
    graphTo[u].push(v)
    graphCap[u].push(cap)
    graphRev[u].push(graphTo[v].length)
    graphTo[v].push(u)
    graphCap[v].push(0)
    graphRev[v].push(graphTo[u].length - 1)
  }

  const fromId = idOf.get(key(from)) as number
  const toId = idOf.get(key(to)) as number
  for (let i = 0; i < N; i += 1) {
    const isUncuttable = i === fromId || i === toId || uncuttable.has(key(cells[i]))
    addEdge(IN(i), OUT(i), isUncuttable ? INF : 1)
    const c = cells[i]
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nk = `${c.x + dx},${c.y + dy}`
      const j = idOf.get(nk)
      if (j !== undefined) addEdge(OUT(i), IN(j), INF)
    }
  }

  const S = OUT(fromId)
  const T = IN(toId)
  let flow = 0
  // BFS level + DFS blocking flow (Dinic). Cut values here are tiny (≤ grid
  // degree ≈ 4), so this terminates in a handful of phases.
  const level = new Int32Array(N * 2)
  const iter = new Int32Array(N * 2)
  for (;;) {
    level.fill(-1)
    level[S] = 0
    const q = [S]
    for (let h = 0; h < q.length; h += 1) {
      const u = q[h]
      for (let e = 0; e < graphTo[u].length; e += 1) {
        if (graphCap[u][e] > 0 && level[graphTo[u][e]] < 0) {
          level[graphTo[u][e]] = level[u] + 1
          q.push(graphTo[u][e])
        }
      }
    }
    if (level[T] < 0) break
    iter.fill(0)
    const dfs = (u: number, f: number): number => {
      if (u === T) return f
      for (; iter[u] < graphTo[u].length; iter[u] += 1) {
        const e = iter[u]
        const v = graphTo[u][e]
        if (graphCap[u][e] > 0 && level[v] === level[u] + 1) {
          const d = dfs(v, Math.min(f, graphCap[u][e]))
          if (d > 0) {
            graphCap[u][e] -= d
            graphCap[v][graphRev[u][e]] += d
            return d
          }
        }
      }
      return 0
    }
    for (;;) {
      const f = dfs(S, INF)
      if (f <= 0) break
      flow += f
      // A route running entirely over uncuttable cells (e.g. adjacent
      // terminals) legitimately carries INF: no free-cell cut exists.
      if (flow >= INF) return INF
    }
  }
  return flow
}

export interface FloorMarginOptions {
  /** Test hook: pin the task battery instead of the size-derived default. */
  batteryOverride?: number
}

export function analyzeFloorMargin(map: DescriptiveSiteMap, opts: FloorMarginOptions = {}): FloorMarginReport {
  let task = siteMapToWarehouseTask(map, 'amr')
  if (opts.batteryOverride !== undefined) {
    task = { ...task, battery: opts.batteryOverride, maxSteps: opts.batteryOverride + 16 }
  }
  const verdict = taskVerdict(task)

  const anchors = new Set([key(task.start), key(task.item), key(task.drop)])
  const solid = new Set([...task.obstacles, ...task.hazards, ...task.humanOnly].map(key))
  const free: GridPos[] = []
  for (let y = 0; y < task.height; y += 1)
    for (let x = 0; x < task.width; x += 1) {
      const k = `${x},${y}`
      if (!anchors.has(k) && !solid.has(k)) free.push({ x, y })
    }

  let criticalCells: GridPos[] = []
  let disconnectionMargin: number | null = 0
  if (verdict === 'finish') {
    // Exhaustive budget-aware single-failure sweep.
    criticalCells = free.filter((c) => {
      const blocked: WarehouseTask = { ...task, obstacles: [...task.obstacles, { ...c }] }
      return taskVerdict(blocked) !== 'finish'
    })
    // Budget-blind exact disconnection margin over FREE cells: the weaker leg
    // bounds the route. All three anchors are uncuttable on both legs. A leg no
    // free-cell set can sever contributes ∞; both ∞ → null (not disconnectable).
    const INF_CUT = 1 << 28
    const cut = Math.min(
      minVertexCut(task, task.start, task.item, anchors),
      minVertexCut(task, task.item, task.drop, anchors),
    )
    disconnectionMargin = cut >= INF_CUT ? null : cut
  }

  const body = {
    verdict,
    singleFailureSafe: verdict === 'finish' && criticalCells.length === 0,
    criticalCells,
    disconnectionMargin,
    sweptCells: verdict === 'finish' ? free.length : 0,
    scope:
      'Under this verifier\'s model only: static 4-connected grid, declared budgets, amr embodiment. criticalCells is exact for single blocked cells (budget-aware); disconnectionMargin is the exact budget-BLIND min vertex cut — an upper bound, never the margin itself.',
  }
  return { ...body, digest: sha256(canonical(body)) }
}
