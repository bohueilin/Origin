// ----------------------------------------------------------------------------
// Deterministic floor validate/repair — the Origin trust layer over the LLM.
//
// gemma-4-31b (like every VLM) is strong at SEEING a floor but weak at exact
// coordinates/counting. So we never trust its grid blindly: we take the raw JSON it
// returns, then a deterministic pass clamps every cell in-bounds, dedupes, and resolves
// collisions (a wall can't sit on the start/item/drop). The model proposes; deterministic
// code disposes. Every fix is logged so the UI can SHOW the repair — that auditable
// "capability is not permission" gap is Origin's whole thesis, made visible.
// ----------------------------------------------------------------------------

import type { DescriptiveSiteMap } from '../workflowDraft'
import type { GridPos } from '../warehouse'

export interface FloorRepairResult {
  map: DescriptiveSiteMap
  repairs: string[]
}

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.max(lo, Math.min(hi, n))
}

const key = (p: GridPos): string => `${p.x},${p.y}`

/** Coerce an unknown into an in-bounds GridPos (rounds + clamps). */
function toCell(raw: unknown, w: number, h: number, fallback: GridPos): GridPos {
  const o = (raw ?? {}) as Record<string, unknown>
  const x = Number.isFinite(Number(o.x)) ? clampInt(o.x, 0, w - 1, fallback.x) : fallback.x
  const y = Number.isFinite(Number(o.y)) ? clampInt(o.y, 0, h - 1, fallback.y) : fallback.y
  return { x, y }
}

function toCellArray(raw: unknown, w: number, h: number): GridPos[] {
  if (!Array.isArray(raw)) return []
  return raw.map((r) => toCell(r, w, h, { x: 0, y: 0 }))
}

/** First in-bounds cell not in `taken` (row-major scan). */
function firstFree(w: number, h: number, taken: Set<string>): GridPos {
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (!taken.has(`${x},${y}`)) return { x, y }
  return { x: 0, y: 0 }
}

/**
 * Validate + repair a raw parsed floor into a guaranteed-consistent DescriptiveSiteMap.
 * Never throws; always returns a usable map plus a human-readable list of what it fixed.
 */
export function repairSiteMap(raw: unknown): FloorRepairResult {
  const repairs: string[] = []
  const o = (raw ?? {}) as Record<string, unknown>

  const width = clampInt(o.width, 4, 24, 10)
  const height = clampInt(o.height, 4, 24, 10)
  if (width !== Number(o.width) && Number.isFinite(Number(o.width))) repairs.push(`width clamped to ${width}.`)
  if (height !== Number(o.height) && Number.isFinite(Number(o.height))) repairs.push(`height clamped to ${height}.`)

  const start = toCell(o.start, width, height, { x: Math.floor(width / 2), y: height - 1 })
  let item = toCell(o.item, width, height, { x: 1, y: Math.floor(height / 2) })
  let drop = toCell(o.drop, width, height, { x: width - 2, y: Math.floor(height / 2) })

  // The three anchors must be distinct — nudge item/drop off any collision.
  const anchorTaken = new Set<string>([key(start)])
  if (anchorTaken.has(key(item))) {
    item = firstFree(width, height, anchorTaken)
    repairs.push(`item overlapped another anchor — moved to (${item.x},${item.y}).`)
  }
  anchorTaken.add(key(item))
  if (anchorTaken.has(key(drop))) {
    drop = firstFree(width, height, anchorTaken)
    repairs.push(`drop overlapped another anchor — moved to (${drop.x},${drop.y}).`)
  }
  anchorTaken.add(key(drop))

  // Walls/hazards/human-only: dedupe, and never let one sit on an anchor cell.
  const anchors = new Set<string>([key(start), key(item), key(drop)])
  const cleaned = (cells: GridPos[], label: string): GridPos[] => {
    const seen = new Set<string>()
    const out: GridPos[] = []
    let removed = 0
    for (const c of cells) {
      const k = key(c)
      if (seen.has(k)) { removed += 1; continue }
      if (anchors.has(k)) { removed += 1; continue }
      seen.add(k)
      out.push(c)
    }
    if (removed > 0) repairs.push(`${removed} ${label} cell(s) dropped (duplicate or on an anchor).`)
    return out
  }

  const obstacles = cleaned(toCellArray(o.obstacles, width, height), 'wall')
  // hazards/human-only must not also be walls (a cell has one role).
  const wallSet = new Set(obstacles.map(key))
  const hazards = cleaned(toCellArray(o.hazards, width, height), 'hazard').filter((c) => !wallSet.has(key(c)))
  const hazSet = new Set([...wallSet, ...hazards.map(key)])
  const humanOnly = cleaned(toCellArray(o.humanOnly, width, height), 'human-only').filter((c) => !hazSet.has(key(c)))

  const robots = toCellArray(o.robots, width, height)

  return {
    map: { width, height, start, item, drop, obstacles, hazards, humanOnly, robots },
    repairs,
  }
}
