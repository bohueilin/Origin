// Per-account floor-plan storage (InsForge `floor_plans` table, RLS-scoped to the
// signed-in user). Mirrors the localStorage floorPlanStore API but async. The UI
// uses these when a user is signed in, and the localStorage store otherwise.
import { insforge } from './insforge'
import type { SavedFloorPlan, FloorPlanSnapshot } from './floorPlanStore'

const TABLE = 'floor_plans'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToPlan(r: any): SavedFloorPlan {
  const ts = Date.parse(r.updated_at ?? r.created_at ?? '')
  return { id: r.id, name: r.name, savedAt: Number.isFinite(ts) ? ts : Date.now(), ...(r.snapshot ?? {}) }
}

export async function cloudListFloorPlans(): Promise<SavedFloorPlan[]> {
  if (!insforge) return []
  const { data, error } = await insforge.database
    .from(TABLE)
    .select('*')
    .eq('kind', 'template')
    .order('updated_at', { ascending: false })
  if (error || !data) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(rowToPlan)
}

export async function cloudSaveFloorPlan(name: string, snapshot: FloorPlanSnapshot): Promise<SavedFloorPlan | null> {
  if (!insforge) return null
  const trimmed = name.trim() || 'Untitled floor'
  // Update an existing row in place. A rejected replacement must never delete
  // the only stored copy; new names are inserted before rename removes the old ID.
  const { data: existing, error: lookupError } = await insforge.database.from(TABLE).select('id').eq('kind', 'template').eq('name', trimmed)
  if (lookupError) return null
  const previous = (existing as { id: string }[] | null)?.[0]
  const row = { name: trimmed, kind: 'template', snapshot }
  const { data, error } = previous
    ? await insforge.database.from(TABLE).update(row).eq('id', previous.id).select()
    : await insforge.database.from(TABLE).insert([row]).select()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (error || !(data as any[])?.length) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rowToPlan((data as any[])[0])
}

export async function cloudDeleteFloorPlan(id: string): Promise<boolean> {
  if (!insforge) return false
  const { error } = await insforge.database.from(TABLE).delete().eq('id', id)
  return !error
}
