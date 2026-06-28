// Saved floor plans — a user's named site layouts they can re-load later.
// Backed by localStorage today; the shape is account-ready, so swapping in a
// per-user API later is a drop-in (replace the read/write helpers).

import type { WorkflowUnderstanding } from './workflowDraft'

/** The slice of a workflow a saved plan captures (everything the user edits). */
export type FloorPlanSnapshot = Pick<
  WorkflowUnderstanding,
  'domain' | 'embodiment' | 'siteMap' | 'storyboard' | 'finishRules' | 'escalateRules' | 'refuseRules'
>

/** A saved plan = a named, timestamped snapshot. */
export interface SavedFloorPlan extends FloorPlanSnapshot {
  id: string
  name: string
  savedAt: number
}

const KEY = 'origin.floorplans.v1'
// Pre-rebrand key (Cortex). Read once and migrate forward so saved plans survive the rename.
const LEGACY_KEY = 'cortex.floorplans.v1'
const MAX_PLANS = 24

export function listFloorPlans(): SavedFloorPlan[] {
  try {
    if (typeof localStorage === 'undefined') return []
    let raw = localStorage.getItem(KEY)
    if (!raw) {
      // One-time migration from the legacy (Cortex) key.
      const legacy = localStorage.getItem(LEGACY_KEY)
      if (legacy) {
        localStorage.setItem(KEY, legacy)
        localStorage.removeItem(LEGACY_KEY)
        raw = legacy
      }
    }
    if (!raw) return []
    const arr: unknown = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as SavedFloorPlan[]) : []
  } catch {
    return []
  }
}

function write(plans: SavedFloorPlan[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(plans))
  } catch {
    /* private mode / quota — saving is best-effort */
  }
}

/** Save (or overwrite a same-named plan). Returns the stored entry. */
export function saveFloorPlan(name: string, snapshot: FloorPlanSnapshot): SavedFloorPlan {
  const trimmed = name.trim() || 'Untitled floor'
  const plans = listFloorPlans()
  const entry: SavedFloorPlan = {
    ...snapshot,
    id: `fp-${Date.now().toString(36)}`,
    name: trimmed,
    savedAt: Date.now(),
  }
  const others = plans.filter((p) => p.name.toLowerCase() !== trimmed.toLowerCase())
  write([entry, ...others].slice(0, MAX_PLANS))
  return entry
}

export function deleteFloorPlan(id: string): void {
  write(listFloorPlans().filter((p) => p.id !== id))
}
