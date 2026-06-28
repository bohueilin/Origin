// Deterministic multi-robot pickup-and-delivery planner for the proving-ground
// animation. Standard MAPD recipe (Ma et al., "Lifelong MAPF for Online Pickup
// and Delivery"; Token Passing / TPTS):
//
//   1. Task allocation — balanced, completion-time greedy: each item goes to the
//      robot that can finish it soonest given its current workload. A free robot
//      (low accumulated cost) wins the next item, so robots SHARE the work — no
//      robot sits idle while another hauls everything.
//   2. Single-load trips — a robot carries ONE item per trip: go to the item
//      (pick), carry it to the drop (deliver), then return for the next. It does
//      NOT scoop up three items at once.
//   3. Collision-free motion — space-time A*/BFS with a reservation table under
//      prioritized planning (R1 highest). Robots avoid each other in time and
//      space (vertex + swap conflicts) and WAIT when needed.
//
// Fully deterministic (no random, no Date): same map in → same motion out. The
// deterministic ORACLE still scores a single agent for the license (siteEval.ts);
// this is the honest animation of the operator's multi-robot deployment intent.

import type { GridPos } from './warehouse'

export interface MultiAgentInput {
  width: number
  height: number
  blocked: readonly GridPos[] // walls
  unsafe: readonly GridPos[] // hazards + human-only (robots route around)
  robots: readonly GridPos[] // robot starts, R1..RK
  items: readonly GridPos[] // pickup cells
  drops: readonly GridPos[] // drop-off points D1..Dn (≥1)
  // Optional explicit fleet membership (parallel to robots/items/drops). When
  // provided, a robot serves ONLY items in its own fleet and delivers to the
  // nearest drop within its fleet. When omitted, fleet = nearest drop per robot
  // (legacy single-fleet behaviour where each drop is its own fleet).
  robotFleet?: readonly number[]
  itemFleet?: readonly number[]
  dropFleet?: readonly number[]
}

export interface RobotPlan {
  index: number
  start: GridPos
  fleet: number // fleet group index (drives colour) this robot belongs to
  itemCount: number // items assigned to this robot
  timeline: GridPos[] // position at each tick (with waits); padded to plan.ticks
  carryingAt: boolean[] // whether the robot is carrying an item at each tick
  reachable: boolean
}

export interface MultiAgentPlan {
  robots: RobotPlan[]
  ticks: number
  itemPickTick: number[] // global tick each input item is picked (Infinity if never)
  unassignedItems: number
  // True when every robot was routed under the reservation table (no two robots
  // share a cell or swap at any tick). False if a leg used the reservation-free
  // deadlock escape hatch — then the animation is NOT guaranteed collision-free.
  fullyDeconflicted: boolean
}

const k2 = (x: number, y: number) => `${x},${y}`
const manhattan = (a: GridPos, b: GridPos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
const DELTAS: GridPos[] = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: -1, y: 0 }]

interface Reservations {
  vertex: Set<string> // "x,y,t" occupied
  edge: Set<string> // "x1,y1>x2,y2,t" a robot traverses this edge at time t
}
const vKey = (x: number, y: number, t: number) => `${x},${y},${t}`
const eKey = (x1: number, y1: number, x2: number, y2: number, t: number) =>
  `${x1},${y1}>${x2},${y2},${t}`

/** Space-time BFS from `from` (at t0) to `to`, avoiding blocked cells and any
 *  vertex/edge reserved by higher-priority robots. Waiting is allowed. Returns
 *  the cell at each tick t0..arrival (inclusive), or null if unreachable in horizon. */
function spaceTimePath(
  from: GridPos,
  to: GridPos,
  t0: number,
  W: number,
  H: number,
  blocked: Set<string>,
  res: Reservations,
  horizon: number,
): GridPos[] | null {
  const seen = new Set<string>([vKey(from.x, from.y, t0)])
  const queue: { x: number; y: number; t: number; path: GridPos[] }[] = [
    { x: from.x, y: from.y, t: t0, path: [{ x: from.x, y: from.y }] },
  ]
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const c = queue[cursor]
    if (c.x === to.x && c.y === to.y) return c.path
    if (c.t - t0 >= horizon) continue
    // candidate moves: wait, then the 4 directions
    const opts: GridPos[] = [{ x: 0, y: 0 }, ...DELTAS]
    for (const d of opts) {
      const nx = c.x + d.x
      const ny = c.y + d.y
      const nt = c.t + 1
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      if (blocked.has(k2(nx, ny))) continue
      if (res.vertex.has(vKey(nx, ny, nt))) continue // vertex conflict
      if (res.edge.has(eKey(nx, ny, c.x, c.y, c.t))) continue // head-on swap
      const sk = vKey(nx, ny, nt)
      if (seen.has(sk)) continue
      seen.add(sk)
      queue.push({ x: nx, y: ny, t: nt, path: [...c.path, { x: nx, y: ny }] })
    }
  }
  return null
}

export function planMultiAgent(input: MultiAgentInput): MultiAgentPlan {
  const W = input.width
  const H = input.height
  const robots = input.robots
  const drops = input.drops.length ? input.drops : [{ x: 0, y: 0 }]
  // Robots route around walls AND unsafe cells (hazards / human-only).
  const blocked = new Set<string>([...input.blocked, ...input.unsafe].map((p) => k2(p.x, p.y)))
  const horizon = (W + H) * 2 + 4

  // Fleet membership. Explicit when provided (a fleet may own several drops);
  // otherwise each drop is its own fleet and a robot joins its nearest one
  // (legacy behaviour). Tie-break by lower index → deterministic.
  const nearestDropIndex = (p: GridPos) => {
    let best = 0
    let bestD = Infinity
    drops.forEach((d, di) => {
      const dist = manhattan(p, d)
      if (dist < bestD) {
        bestD = dist
        best = di
      }
    })
    return best
  }
  const dropFleet = input.dropFleet ?? drops.map((_, i) => i)
  const fleetOf =
    input.robotFleet ?? robots.map((r) => dropFleet[nearestDropIndex(r)] ?? 0)
  const itemFleetOf =
    input.itemFleet ?? input.items.map((it) => dropFleet[nearestDropIndex(it)] ?? 0)

  // The drop a robot in fleet F should use from position `from` — the nearest
  // drop that belongs to F (fall back to the global nearest if F has none).
  const dropFor = (ri: number, from: GridPos): GridPos => {
    const f = fleetOf[ri]
    let best: GridPos | null = null
    let bestD = Infinity
    drops.forEach((d, di) => {
      if (dropFleet[di] !== f) return
      const dist = manhattan(from, d)
      if (dist < bestD) {
        bestD = dist
        best = d
      }
    })
    return best ?? drops[nearestDropIndex(from)]
  }

  // 1. Balanced, completion-time-greedy task allocation (Token-Passing style),
  //    constrained to fleet: a robot may only take items in its OWN fleet, and
  //    carries each to the nearest drop within that fleet.
  const queues: number[][] = robots.map(() => [])
  const routeEnd: GridPos[] = robots.map((r) => ({ x: r.x, y: r.y }))
  const routeCost: number[] = robots.map(() => 0)
  const remaining = input.items.map((_, i) => i)
  let unassigned = 0
  while (remaining.length) {
    let bestR = -1
    let bestItem = -1
    let best = Infinity
    for (let ri = 0; ri < robots.length; ri += 1) {
      for (const it of remaining) {
        if (itemFleetOf[it] !== fleetOf[ri]) continue // fleet-restricted
        const itemPos = input.items[it]
        const cost =
          routeCost[ri] + manhattan(routeEnd[ri], itemPos) + manhattan(itemPos, dropFor(ri, itemPos))
        if (cost < best) {
          best = cost
          bestR = ri
          bestItem = it
        }
      }
    }
    if (bestR < 0) {
      unassigned = remaining.length // remaining items have no robot in their fleet
      break
    }
    queues[bestR].push(bestItem)
    routeCost[bestR] = best
    routeEnd[bestR] = { ...dropFor(bestR, input.items[bestItem]) }
    remaining.splice(remaining.indexOf(bestItem), 1)
  }

  // 2 + 3. Plan each robot in priority order with single-load trips, reserving
  //        its space-time path so lower-priority robots avoid it.
  const res: Reservations = { vertex: new Set(), edge: new Set() }
  const itemPickTick = input.items.map(() => Infinity)
  const rawTimelines: GridPos[][] = []
  const rawCarrying: boolean[][] = []
  const reachableFlags: boolean[] = []
  // Tracks whether any leg had to fall back to a reservation-free path (the
  // deadlock-avoidance escape hatch). If so, the plan is NOT guaranteed fully
  // collision-free, and the UI must say so rather than overclaim.
  let usedFallback = false

  const emptyRes: Reservations = { vertex: new Set(), edge: new Set() }
  robots.forEach((start, ri) => {
    const timeline: GridPos[] = [{ x: start.x, y: start.y }]
    const carrying: boolean[] = [false]
    let pos: GridPos = { x: start.x, y: start.y }
    let t = 0
    let reachable = true
    let didWork = false

    // Plan a leg, preferring the reservation-aware path; fall back to the plain
    // shortest path if reservations make it momentarily unsolvable (keeps a robot
    // from ever freezing — a pragmatic stand-in for full deadlock recovery).
    const planLeg = (from: GridPos, to: GridPos) => {
      const aware = spaceTimePath(from, to, t, W, H, blocked, res, horizon)
      if (aware) return aware
      const fallback = spaceTimePath(from, to, t, W, H, blocked, emptyRes, horizon)
      if (fallback) usedFallback = true // reservation-free escape hatch was needed
      return fallback
    }
    const appendLeg = (legPath: GridPos[], carry: boolean) => {
      for (let s = 1; s < legPath.length; s += 1) {
        timeline.push(legPath[s])
        carrying.push(carry)
      }
      t += legPath.length - 1
      pos = legPath[legPath.length - 1]
    }

    for (const itemIdx of queues[ri]) {
      const item = input.items[itemIdx]
      const toItem = planLeg(pos, item) // drive to the item, empty-handed
      if (!toItem) { reachable = false; break }
      appendLeg(toItem, false)
      didWork = true
      if (itemPickTick[itemIdx] === Infinity) itemPickTick[itemIdx] = t
      const toDrop = planLeg(pos, dropFor(ri, pos)) // carry it to the nearest drop in THIS fleet
      if (!toDrop) { reachable = false; break }
      appendLeg(toDrop, true)
    }

    // Return to the robot's parking spot (its start) so it never camps on the
    // shared drop and never blocks another robot's delivery (well-formed MAPD).
    if (didWork && (pos.x !== start.x || pos.y !== start.y)) {
      const home = planLeg(pos, start)
      if (home) appendLeg(home, false)
    }

    // Reserve this robot's whole space-time path (vertex + edges) for the rest.
    for (let i = 0; i < timeline.length; i += 1) {
      res.vertex.add(vKey(timeline[i].x, timeline[i].y, i))
      if (i + 1 < timeline.length) {
        res.edge.add(eKey(timeline[i].x, timeline[i].y, timeline[i + 1].x, timeline[i + 1].y, i))
      }
    }
    // Park at the FINAL cell (= home), reserved going forward. Homes are unique
    // per robot, so this never blocks the shared drop.
    const last = timeline[timeline.length - 1]
    for (let tt = timeline.length; tt < timeline.length + horizon + 4; tt += 1) {
      res.vertex.add(vKey(last.x, last.y, tt))
    }

    rawTimelines.push(timeline)
    rawCarrying.push(carrying)
    reachableFlags.push(reachable)
  })

  const ticks = Math.max(...rawTimelines.map((t) => t.length), 1)
  const plans: RobotPlan[] = robots.map((start, ri) => {
    const tl = rawTimelines[ri]
    const cy = rawCarrying[ri]
    const last = tl[tl.length - 1]
    const lastCarry = cy[cy.length - 1]
    const timeline = [...tl]
    const carryingAt = [...cy]
    while (timeline.length < ticks) {
      timeline.push(last)
      carryingAt.push(lastCarry)
    }
    return {
      index: ri,
      start: { x: start.x, y: start.y },
      fleet: fleetOf[ri],
      itemCount: queues[ri].length,
      timeline,
      carryingAt,
      reachable: reachableFlags[ri],
    }
  })

  return { robots: plans, ticks, itemPickTick, unassignedItems: unassigned, fullyDeconflicted: !usedFallback }
}
