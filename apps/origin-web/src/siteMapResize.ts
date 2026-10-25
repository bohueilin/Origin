// Pure grid-resize helper for the drawn site map. Kept out of the component file
// so it's unit-testable and doesn't trip react-refresh's component-only-export rule.
//
// A resize clips; it never re-derives. Every fleet keeps its robot type, every
// surviving robot keeps its painted type and every surviving cell keeps its number.
// The editor shows `lost` before it applies a shrink, and offers an undo after.

import { siteFleets, normalizeFleets, type DescriptiveSiteMap } from './workflowDraft'
import type { GridPos } from './warehouse'

export const GRID_MIN = 4
export const GRID_MAX = 12
export const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export type LostKind = 'robot' | 'item' | 'drop' | 'wall' | 'hazard' | 'human'

/** A placed cell a resize would remove. `fleet` is -1 for walls, hazards and human-only cells. */
export interface LostCell {
  kind: LostKind
  x: number
  y: number
  fleet: number
}

/** A scored-lane cell (the oracle's start, item or drop) that a resize moves. */
export interface LaneMove {
  part: 'start' | 'item' | 'drop'
  from: GridPos
  to: GridPos
}

export interface ResizePlan {
  width: number
  height: number
  /** Placed cells outside the new bounds, in reading order (row by row). */
  lost: LostCell[]
  /** Oracle-lane cells the resize moves: the scored result is re-computed on them. */
  lane: LaneMove[]
  /** Refused when it would remove every item or every drop (the floor keeps at least one of each); else null. */
  blocked: { items: boolean; drops: boolean } | null
  /** The resized floor, or null when the resize is refused. */
  next: DescriptiveSiteMap | null
}

const same = (a: GridPos, b: GridPos) => a.x === b.x && a.y === b.y

export function planResize(map: DescriptiveSiteMap, w: number, h: number): ResizePlan {
  const W = clampN(Math.round(w), GRID_MIN, GRID_MAX)
  const H = clampN(Math.round(h), GRID_MIN, GRID_MAX)
  const inBounds = (p: GridPos) => p.x >= 0 && p.y >= 0 && p.x < W && p.y < H
  const corner = (x: number, y: number) => ({ x: clampN(x, 0, W - 1), y: clampN(y, 0, H - 1) })
  const k = (p: GridPos) => `${p.x},${p.y}`

  const source = siteFleets(map)
  const lost: LostCell[] = []
  source.forEach((f, fleet) => {
    for (const p of f.robots) if (!inBounds(p)) lost.push({ kind: 'robot', ...p, fleet })
    for (const p of f.items) if (!inBounds(p)) lost.push({ kind: 'item', ...p, fleet })
    for (const p of f.drops) if (!inBounds(p)) lost.push({ kind: 'drop', ...p, fleet })
  })
  for (const p of map.obstacles) if (!inBounds(p)) lost.push({ kind: 'wall', ...p, fleet: -1 })
  for (const p of map.hazards) if (!inBounds(p)) lost.push({ kind: 'hazard', ...p, fleet: -1 })
  for (const p of map.humanOnly) if (!inBounds(p)) lost.push({ kind: 'human', ...p, fleet: -1 })
  lost.sort((a, b) => a.y - b.y || a.x - b.x)

  // Clip each fleet, carrying its robot type: rebuilding a fleet without its
  // `embodiment` is what turned every fleet back into the workflow default on resize.
  const fleets = source.map((f) => ({
    robots: f.robots.filter(inBounds),
    items: f.items.filter(inBounds),
    drops: f.drops.filter(inBounds),
    embodiment: f.embodiment,
  }))
  const noItem = !fleets.some((f) => f.items.length)
  const noDrop = !fleets.some((f) => f.drops.length)
  if (noItem || noDrop) return { width: W, height: H, lost, lane: [], blocked: { items: noItem, drops: noDrop }, next: null }

  // The scored lane: its item and drop follow the surviving cells; its start moves
  // only if it falls outside, and never onto the item or drop.
  const anchorItem = fleets.flatMap((f) => f.items)[0]
  const anchorDrop = fleets.flatMap((f) => f.drops)[0]
  let start = corner(map.start.x, map.start.y)
  if (k(start) === k(anchorItem) || k(start) === k(anchorDrop)) start = corner(0, H - 1)
  if (k(start) === k(anchorItem) || k(start) === k(anchorDrop)) start = corner(0, 0)

  const base: DescriptiveSiteMap = {
    ...map,
    width: W,
    height: H,
    start,
    obstacles: map.obstacles.filter(inBounds),
    hazards: map.hazards.filter(inBounds),
    humanOnly: map.humanOnly.filter(inBounds),
  }
  const next = normalizeFleets(base, fleets)
  const lane: LaneMove[] = []
  if (!same(map.start, next.start)) lane.push({ part: 'start', from: map.start, to: next.start })
  if (!same(map.item, next.item)) lane.push({ part: 'item', from: map.item, to: next.item })
  if (!same(map.drop, next.drop)) lane.push({ part: 'drop', from: map.drop, to: next.drop })
  return { width: W, height: H, lost, lane, blocked: null, next }
}

/** Resize, or return the floor unchanged when the resize is refused. */
export function resizeSiteMap(map: DescriptiveSiteMap, w: number, h: number): DescriptiveSiteMap {
  return planResize(map, w, h).next ?? map
}
