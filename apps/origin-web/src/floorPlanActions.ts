// Saved-floor-plan actions that are too important to leave inline in the editor:
// the store choice (account vs device) and the rename, which is a save followed by
// a delete and therefore the one place a store failure can destroy a user's work.
//
// These are pure/injected on purpose — `src/floorPlanActions.test.ts` exercises them
// against a real localStorage stub and a recording writer, with no React involved.
import type { FloorPlanSnapshot, SavedFloorPlan } from './floorPlanStore'

/** The two writes a rename needs. The caller supplies either the account-backed
 *  (`cloudSaveFloorPlan` / `cloudDeleteFloorPlan`) or device-backed pair.
 *  `save` resolves to null when the store did NOT persist the plan. */
export interface FloorPlanWriter {
  save: (name: string, snapshot: FloorPlanSnapshot, replacingId?: string) => Promise<SavedFloorPlan | null>
  remove: (id: string) => Promise<boolean>
}

export type RenameResult =
  | { status: 'renamed'; plan: SavedFloorPlan }
  | { status: 'partial'; plan: SavedFloorPlan; message: string }
  /** Nothing to do — blank name, or the same name it already had. */
  | { status: 'unchanged' }
  /** The save did not land. The original is untouched; show `message`. */
  | { status: 'failed'; message: string }

export const RENAME_FAILED_NOTICE = 'Couldn’t rename — your plan is unchanged.'
export const SAVE_FAILED_NOTICE = 'Couldn’t save — nothing was stored. Try again.'

/** The editable slice of a saved plan (drops id / name / savedAt). */
export function snapshotOf(plan: SavedFloorPlan): FloorPlanSnapshot {
  return {
    domain: plan.domain,
    embodiment: plan.embodiment,
    siteMap: plan.siteMap,
    storyboard: plan.storyboard,
    finishRules: plan.finishRules,
    escalateRules: plan.escalateRules,
    refuseRules: plan.refuseRules,
  }
}

/**
 * Rename = persist the replacement, then drop the old row if its ID changed (a same-name overwrite is
 * handled by both stores).
 *
 * THE DELETE IS GATED ON A CONFIRMED SAVE. It used to be unconditional: when the save
 * failed — an offline/RLS-rejected account write, or a localStorage quota rejection —
 * the original was deleted anyway and the plan was gone, with nothing shown to the
 * user. A store that cannot confirm the new copy leaves the old one exactly where it is.
 */
export async function renameFloorPlan(
  plan: SavedFloorPlan,
  rawName: string,
  writer: FloorPlanWriter,
): Promise<RenameResult> {
  const name = rawName.trim()
  if (!name || name === plan.name) return { status: 'unchanged' }
  const saved = await writer.save(name, snapshotOf(plan), plan.id)
  if (!saved) return { status: 'failed', message: RENAME_FAILED_NOTICE }
  if (saved.id !== plan.id && !(await writer.remove(plan.id))) {
    return { status: 'partial', plan: saved, message: 'The new name was saved, but the old plan could not be removed. Both copies remain.' }
  }
  return { status: 'renamed', plan: saved }
}

/** Which store the plan controls read and write. */
export type PlanStore = 'account' | 'device' | 'pending'

/**
 * `pending` is the state that was missing: while auth is still restoring a session,
 * `user` is null but that is not yet an answer. Treating it as signed-out wrote a
 * signed-in user's plan to device localStorage, where their account never sees it.
 */
export function planStoreFor(auth: { ready: boolean; user: object | null }): PlanStore {
  if (!auth.ready) return 'pending'
  return auth.user ? 'account' : 'device'
}
