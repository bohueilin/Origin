import { beforeEach, expect, test, vi } from 'vitest'
import type { FloorPlanSnapshot } from './floorPlanStore'

const store = vi.hoisted(() => ({
  rows: [] as { id: string; name: string; kind: string; snapshot: unknown }[],
  rejectWrite: false,
  rejectDelete: false,
}))
vi.mock('./insforge', () => ({ insforge: { database: { from: () => {
  let operation = 'read'
  let payload: Record<string, unknown> = {}
  const filters: [string, unknown][] = []
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return query },
    insert: (rows: Record<string, unknown>[]) => { operation = 'insert'; payload = rows[0]; return query },
    update: (row: Record<string, unknown>) => { operation = 'update'; payload = row; return query },
    delete: () => { operation = 'delete'; return query },
    then: (resolve: (result: unknown) => void) => {
      const matches = store.rows.filter(row => filters.every(([k, v]) => row[k as keyof typeof row] === v))
      if ((['insert', 'update'].includes(operation) && store.rejectWrite) || (operation === 'delete' && store.rejectDelete)) {
        return resolve({ data: null, error: new Error('write rejected') })
      }
      if (operation === 'delete') store.rows = store.rows.filter(row => !matches.includes(row))
      if (operation === 'update') matches.forEach(row => Object.assign(row, payload))
      if (operation === 'insert') {
        const row = { ...payload, id: 'new' } as typeof store.rows[number]
        store.rows.push(row)
        return resolve({ data: [row], error: null })
      }
      return resolve({ data: matches, error: null })
    },
  }
  return query
} } } }))
import { cloudSaveFloorPlan, cloudDeleteFloorPlan } from './cloudFloorPlans'
const snapshot = { domain: 'warehouse' } as FloorPlanSnapshot
beforeEach(() => {
  store.rows = [{ id: 'original', name: 'My floor', kind: 'template', snapshot: { domain: 'old' } }]
  store.rejectWrite = false
  store.rejectDelete = false
})

test('failed cloud replacement preserves the original even when delete would succeed', async () => {
  store.rejectWrite = true
  expect(await cloudSaveFloorPlan('My floor', snapshot)).toBeNull()
  expect(store.rows).toEqual([{ id: 'original', name: 'My floor', kind: 'template', snapshot: { domain: 'old' } }])
})

test('same-name cloud replacement updates the existing row without deleting it', async () => {
  const saved = await cloudSaveFloorPlan('My floor', snapshot)
  expect(saved?.id).toBe('original')
  expect(store.rows).toEqual([{ id: 'original', name: 'My floor', kind: 'template', snapshot }])
})

test('failed cloud deletion is reported and leaves the plan intact', async () => {
  store.rejectDelete = true
  expect(await cloudDeleteFloorPlan('original')).toBe(false)
  expect(store.rows).toHaveLength(1)
})
