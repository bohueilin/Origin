// Pure grid-resize helper for the drawn site map. Kept out of the component file
// so it's unit-testable and doesn't trip react-refresh's component-only-export rule.

import { siteFleets, normalizeFleets, type DescriptiveSiteMap } from './workflowDraft'

export const GRID_MIN = 4
export const GRID_MAX = 12
export const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// Resize the grid, keeping EVERY layer valid — including the authoritative fleets.
// Cells outside the new bounds are dropped; at least one item + one drop always
// survive (the oracle anchors); the scored start stays distinct from them.
export function resizeSiteMap(map: DescriptiveSiteMap, w: number, h: number): DescriptiveSiteMap {
  const W = clampN(Math.round(w), GRID_MIN, GRID_MAX)
  const H = clampN(Math.round(h), GRID_MIN, GRID_MAX)
  const inBounds = (p: { x: number; y: number }) => p.x >= 0 && p.y >= 0 && p.x < W && p.y < H
  const clampPos = (p: { x: number; y: number }) => ({ x: clampN(p.x, 0, W - 1), y: clampN(p.y, 0, H - 1) })
  const corner = (x: number, y: number) => ({ x: clampN(x, 0, W - 1), y: clampN(y, 0, H - 1) })
  const k = (p: { x: number; y: number }) => `${p.x},${p.y}`

  // Filter every fleet's robots / items / drops to in-bounds cells.
  const fleets = siteFleets(map).map((f) => ({
    robots: f.robots.filter(inBounds),
    items: f.items.filter(inBounds),
    drops: f.drops.filter(inBounds),
  }))
  if (!fleets.length) fleets.push({ robots: [], items: [], drops: [] })
  // Guarantee the oracle anchors survive: seed a default item / drop into fleet 0
  // if a resize wiped them out.
  if (!fleets.some((f) => f.items.length)) fleets[0].items.push(corner(Math.floor(W / 2), Math.floor(H / 2)))
  if (!fleets.some((f) => f.drops.length)) fleets[0].drops.push(corner(W - 1, 0))

  // The scored lane start stays distinct from the item/drop anchors.
  const anchorItem = fleets.flatMap((f) => f.items)[0]
  const anchorDrop = fleets.flatMap((f) => f.drops)[0]
  let start = clampPos(map.start)
  if (k(start) === k(anchorItem) || k(start) === k(anchorDrop)) start = corner(0, H - 1)
  if (k(start) === k(anchorItem) || k(start) === k(anchorDrop)) start = corner(0, 0)

  // A cell can't be both a fleet element and a wall/hazard/human-only cell — strip
  // any global that collides with a fleet cell (covers seeded anchors landing on one).
  const fleetCells = new Set(fleets.flatMap((f) => [...f.robots, ...f.items, ...f.drops]).map(k))
  const stripGlobals = (list: readonly { x: number; y: number }[]) =>
    list.filter((p) => inBounds(p) && !fleetCells.has(k(p)))
  const base: DescriptiveSiteMap = {
    ...map,
    width: W,
    height: H,
    start,
    obstacles: stripGlobals(map.obstacles),
    hazards: stripGlobals(map.hazards),
    humanOnly: stripGlobals(map.humanOnly),
  }
  return normalizeFleets(base, fleets)
}
