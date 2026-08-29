// Contract for the adminStore readers that used to answer with a bare array (or null).
//
// WHY THIS FILE EXISTS. `listMyTickets` ended in `if (error || !data) return []`, so a
// failed read rendered as "No tickets yet." directly under copy promising "Your tickets
// are private to your account" — the user is told their account is empty when in fact we
// never managed to look. The two admin template readers had the same shape: an unreadable
// template list showed as "No templates.", and a template that failed to open simply did
// nothing at all.
//
// Same defect class as ./roleStore.test.ts and ./credentials/store.test.ts: a silent
// failure that renders as good news. The fix is to make "empty" and "unknown" different
// values, so the UI can show an error with a Retry instead of a calm empty state.

import { beforeEach, describe, expect, test, vi } from 'vitest'

type Res = { data: unknown; error: { message: string } | null }

const EMPTY: Res = { data: [], error: null }
const tableResponses = new Map<string, Res>()
const rpcResponses = new Map<string, Res>()

function chain(table: string): Record<string, unknown> {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'limit', 'eq', 'insert', 'update']) c[m] = () => c
  c.then = (onOk: (v: Res) => unknown, onErr?: (e: unknown) => unknown) =>
    Promise.resolve(tableResponses.get(table) ?? EMPTY).then(onOk, onErr)
  return c
}

vi.mock('./insforge', () => ({
  insforge: {
    database: {
      from: (t: string) => chain(t),
      rpc: (name: string) => Promise.resolve(rpcResponses.get(name) ?? EMPTY),
    },
  },
}))

const admin = await import('./adminStore')

beforeEach(() => { tableResponses.clear(); rpcResponses.clear() })

describe('listMyTickets', () => {
  test('a successful read is ok and carries the tickets', async () => {
    tableResponses.set('support_tickets', { data: [{ id: 't1', subject: 'Help' }], error: null })
    const res = await admin.listMyTickets()
    expect(res.ok).toBe(true)
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].id).toBe('t1')
  })

  test('an account with no tickets is ok — that emptiness is true', async () => {
    tableResponses.set('support_tickets', EMPTY)
    const res = await admin.listMyTickets()
    expect(res).toEqual({ ok: true, rows: [] })
  })

  test('a failed read is REPORTED, so "No tickets yet" is never a lie', async () => {
    tableResponses.set('support_tickets', { data: null, error: { message: 'JWT expired' } })
    const res = await admin.listMyTickets()
    expect(res.ok).toBe(false)
    expect(res.rows).toEqual([])
    expect(res.error).toContain('JWT expired')
  })

  test('a missing payload with no error is a non-answer', async () => {
    tableResponses.set('support_tickets', { data: null, error: null })
    const res = await admin.listMyTickets()
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })
})

describe('adminListUserTemplates', () => {
  test('a successful read is ok and carries the templates', async () => {
    rpcResponses.set('admin_list_user_templates', { data: [{ id: 'tpl1', name: 'Bay 3' }], error: null })
    const res = await admin.adminListUserTemplates('u1')
    expect(res.ok).toBe(true)
    expect(res.rows[0].name).toBe('Bay 3')
  })

  test('a refused or failed RPC is REPORTED, not shown as "No templates."', async () => {
    rpcResponses.set('admin_list_user_templates', { data: null, error: { message: 'not staff' } })
    const res = await admin.adminListUserTemplates('u1')
    expect(res.ok).toBe(false)
    expect(res.rows).toEqual([])
    expect(res.error).toContain('not staff')
  })
})

describe('adminViewTemplate', () => {
  test('a found template is ok and carries the row', async () => {
    rpcResponses.set('admin_view_template', { data: [{ id: 'tpl1', user_id: 'u1', name: 'Bay 3', snapshot: {} }], error: null })
    const res = await admin.adminViewTemplate('tpl1')
    expect(res.ok).toBe(true)
    expect(res.row?.name).toBe('Bay 3')
  })

  test('a template that genuinely is not there is ok with a null row', async () => {
    rpcResponses.set('admin_view_template', EMPTY)
    const res = await admin.adminViewTemplate('gone')
    expect(res).toEqual({ ok: true, row: null })
  })

  test('a failed open is REPORTED, not silently nothing on screen', async () => {
    rpcResponses.set('admin_view_template', { data: null, error: { message: 'permission denied' } })
    const res = await admin.adminViewTemplate('tpl1')
    expect(res.ok).toBe(false)
    expect(res.row).toBeNull()
    expect(res.error).toContain('permission denied')
  })
})
