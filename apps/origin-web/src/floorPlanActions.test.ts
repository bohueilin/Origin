import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renameFloorPlan, planStoreFor, RENAME_FAILED_NOTICE, type FloorPlanWriter } from './floorPlanActions'
import { saveFloorPlan, listFloorPlans, deleteFloorPlan, type SavedFloorPlan } from './floorPlanStore'
import type { DescriptiveSiteMap, ProvenanceFact } from './workflowDraft'

const SITE: DescriptiveSiteMap = {
  width: 6,
  height: 5,
  start: { x: 0, y: 0 },
  item: { x: 2, y: 2 },
  drop: { x: 5, y: 4 },
  obstacles: [{ x: 3, y: 1 }],
  hazards: [],
  humanOnly: [],
  robots: [{ x: 0, y: 0 }],
}

function fact(id: string, text: string): ProvenanceFact {
  return { id, text, state: 'ai_proposed', confidence: 'high', sourceItemIds: [] }
}

const PLAN: SavedFloorPlan = {
  id: 'fp-original',
  name: 'Old name',
  savedAt: 1_700_000_000_000,
  domain: 'warehouse',
  embodiment: 'amr',
  siteMap: SITE,
  storyboard: [fact('s1', 'pick the tote')],
  finishRules: [fact('f1', 'tote is on the pallet')],
  escalateRules: [fact('e1', 'aisle blocked')],
  refuseRules: [fact('r1', 'human in the cell')],
}

/** A writer that records what it was asked to do, so a test can assert the
 *  delete never ran. `save` resolves to null to simulate a store that failed. */
function recordingWriter(save: FloorPlanWriter['save']): FloorPlanWriter & { removed: string[] } {
  const removed: string[] = []
  return {
    save,
    remove: async (id: string) => { removed.push(id); return true },
    removed,
  }
}

describe('renameFloorPlan — a failed save must never delete the original', () => {
  it('does NOT delete the original when the save fails', async () => {
    const w = recordingWriter(async () => null)

    const result = await renameFloorPlan(PLAN, 'New name', w)

    expect(w.removed).toEqual([])
    expect(result.status).toBe('failed')
  })

  it('reports a message the UI can show when the save fails', async () => {
    const w = recordingWriter(async () => null)

    const result = await renameFloorPlan(PLAN, 'New name', w)

    expect(result).toEqual({ status: 'failed', message: RENAME_FAILED_NOTICE })
    expect(RENAME_FAILED_NOTICE).toContain('unchanged')
  })

  it('deletes the original only after the save is confirmed', async () => {
    const w = recordingWriter(async (name) => ({ ...PLAN, id: 'fp-new', name }))

    const result = await renameFloorPlan(PLAN, 'New name', w)

    expect(w.removed).toEqual(['fp-original'])
    expect(result).toEqual({ status: 'renamed', plan: { ...PLAN, id: 'fp-new', name: 'New name' } })
  })

  it('saves the trimmed name with the whole snapshot, not a partial one', async () => {
    let seen: { name: string; snapshot: Record<string, unknown> } | null = null
    const w = recordingWriter(async (name, snapshot) => {
      seen = { name, snapshot: snapshot as unknown as Record<string, unknown> }
      return { ...PLAN, id: 'fp-new', name }
    })

    await renameFloorPlan(PLAN, '  New name  ', w)

    expect(seen!.name).toBe('New name')
    expect(seen!.snapshot).toEqual({
      domain: PLAN.domain,
      embodiment: PLAN.embodiment,
      siteMap: PLAN.siteMap,
      storyboard: PLAN.storyboard,
      finishRules: PLAN.finishRules,
      escalateRules: PLAN.escalateRules,
      refuseRules: PLAN.refuseRules,
    })
  })

  it('reports when the new copy was saved but the old copy could not be removed', async () => {
    const result = await renameFloorPlan(PLAN, 'New name', {
      save: async (name) => ({ ...PLAN, id: 'fp-new', name }),
      remove: async () => false,
    })
    expect(result.status).toBe('partial')
    expect('message' in result && result.message).toMatch(/both copies/i)
  })

  it('does nothing at all for a blank or unchanged name', async () => {
    for (const name of ['', '   ', 'Old name', '  Old name  ']) {
      let saved = false
      const w = recordingWriter(async () => { saved = true; return PLAN })

      const result = await renameFloorPlan(PLAN, name, w)

      expect(result.status).toBe('unchanged')
      expect(saved).toBe(false)
      expect(w.removed).toEqual([])
    }
  })
})

describe('planStoreFor — which store the plan controls write to', () => {
  it('is pending while auth is still restoring a session', () => {
    expect(planStoreFor({ ready: false, user: null })).toBe('pending')
    expect(planStoreFor({ ready: false, user: { id: 'u1' } })).toBe('pending')
  })

  it('is the account store once a signed-in session is confirmed', () => {
    expect(planStoreFor({ ready: true, user: { id: 'u1' } })).toBe('account')
  })

  it('is the device store only once auth confirms nobody is signed in', () => {
    expect(planStoreFor({ ready: true, user: null })).toBe('device')
  })
})

// The device store is the other half of the same rename: `saveFloorPlan` used to
// report success even when the localStorage write threw (quota / private mode),
// which let the rename delete the original after storing nothing.
describe('saveFloorPlan — reports a write that did not land', () => {
  const realLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  let full = false

  beforeEach(() => {
    full = false
    const map = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => {
          if (full) throw new Error('QuotaExceededError')
          map.set(k, v)
        },
        removeItem: (k: string) => { map.delete(k) },
      },
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    if (realLocalStorage) Object.defineProperty(globalThis, 'localStorage', realLocalStorage)
    else delete (globalThis as { localStorage?: unknown }).localStorage
  })

  it('returns the stored entry when the write lands', () => {
    const entry = saveFloorPlan('Kept', PLAN)
    expect(entry).not.toBeNull()
    expect(listFloorPlans().map((p) => p.name)).toEqual(['Kept'])
  })

  it('returns null when localStorage refuses the write', () => {
    full = true
    expect(saveFloorPlan('Rejected', PLAN)).toBeNull()
  })

  it('keeps the original plan when a device rename hits a full store', async () => {
    const original = saveFloorPlan('Old name', PLAN)!
    const device: FloorPlanWriter = {
      save: async (name, snapshot, replacingId) => saveFloorPlan(name, snapshot, replacingId),
      remove: async (id) => deleteFloorPlan(id),
    }
    full = true // every write from here on fails — the shape that destroyed the plan

    const result = await renameFloorPlan(original, 'New name', device)

    expect(result.status).toBe('failed')
    expect(listFloorPlans().map((p) => p.name)).toEqual(['Old name'])
  })

  it('retains the renamed plan when both saves occur in the same millisecond', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const original = saveFloorPlan('Old name', PLAN)!
    const result = await renameFloorPlan(original, 'New name', {
      save: async (name, snapshot, replacingId) => saveFloorPlan(name, snapshot, replacingId),
      remove: async (id) => deleteFloorPlan(id),
    })

    expect(result.status).toBe('renamed')
    expect(listFloorPlans().map((p) => p.name)).toEqual(['New name'])
  })
  it('keeps all 24 plans when the newest is renamed at the cap', async () => {
    saveFloorPlan('Oldest', PLAN)!
    for (let i = 1; i < 24; i++) saveFloorPlan(`Other ${i}`, PLAN)
    const result = await renameFloorPlan(listFloorPlans()[0], 'Renamed', {
      save: async (name, snapshot, replacingId) => saveFloorPlan(name, snapshot, replacingId),
      remove: async (id) => deleteFloorPlan(id),
    })
    expect(result.status).toBe('renamed')
    const names = listFloorPlans().map(p => p.name)
    expect(names).toHaveLength(24)
    expect(names).toContain('Oldest')
    expect(names).toContain('Renamed')
  })

  it('reports a failed delete without claiming the plan is gone', () => {
    const original = saveFloorPlan('Kept', PLAN)!
    full = true
    expect(deleteFloorPlan(original.id)).toBe(false)
    expect(listFloorPlans()[0].id).toBe(original.id)
  })

  it('preserves the original when only the new write fails and deletion would succeed', async () => {
    const original = saveFloorPlan('Kept', PLAN)!
    const set = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('transient write failure') }).mockImplementation(set)
    const result = await renameFloorPlan(original, 'Rejected', {
      save: async (name, snapshot, replacingId) => saveFloorPlan(name, snapshot, replacingId),
      remove: async id => deleteFloorPlan(id),
    })
    expect(result.status).toBe('failed')
    expect(listFloorPlans().map(p => p.name)).toEqual(['Kept'])
  })

})
