// Contract for the role reader.
//
// WHY THIS FILE EXISTS. getMyRole() returned a bare Role and collapsed every failure
// path — RPC error, network blip, 401, malformed payload — into 'user'. The caller
// cannot distinguish "you are a regular user" from "we could not find out", so the
// Admin tab silently disappears for a super_admin and the UI confidently shows a
// downgraded account with no error anywhere. That is not a hypothetical: the module's
// own history is a session where exactly this masked a missing database schema for a
// month.
//
// Fail-closed on PERMISSION is right — never grant staff on an uncertain answer. Being
// silent about the uncertainty is the defect. These tests pin both halves.

import { describe, expect, test, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('./insforge', () => ({ insforge: { database: { rpc: (...a: unknown[]) => rpc(...a) } } }))

const { getMyRole, isStaff } = await import('./roleStore')

beforeEach(() => { rpc.mockReset() })

describe('getMyRole', () => {
  test('reports a confirmed staff role', async () => {
    rpc.mockResolvedValue({ data: 'super_admin', error: null })
    await expect(getMyRole()).resolves.toEqual({ ok: true, role: 'super_admin' })
  })

  test('accepts the scalar wrapped as a row or an array', async () => {
    // PostgREST-style clients hand back a scalar RPC result in several shapes
    // depending on the call path; all of them mean the same thing.
    rpc.mockResolvedValue({ data: [{ ensure_my_role: 'admin' }], error: null })
    await expect(getMyRole()).resolves.toEqual({ ok: true, role: 'admin' })

    rpc.mockResolvedValue({ data: ['admin'], error: null })
    await expect(getMyRole()).resolves.toEqual({ ok: true, role: 'admin' })
  })

  test('a confirmed plain user is ok — not an error', async () => {
    rpc.mockResolvedValue({ data: 'user', error: null })
    await expect(getMyRole()).resolves.toEqual({ ok: true, role: 'user' })
  })

  test('an RPC error is REPORTED, not silently downgraded to user', async () => {
    // The whole point: ok:false is distinguishable from a real 'user' verdict, so the
    // UI can say "couldn't confirm your role" instead of quietly hiding the Admin tab.
    rpc.mockResolvedValue({ data: null, error: { message: 'JWT expired' } })
    const res = await getMyRole()
    expect(res.ok).toBe(false)
    expect(res.role).toBe('user') // still fail-closed on permission
    expect(res).toHaveProperty('error', 'JWT expired')
  })

  test('a thrown network failure is reported the same way', async () => {
    rpc.mockRejectedValue(new Error('network down'))
    const res = await getMyRole()
    expect(res.ok).toBe(false)
    expect(res.role).toBe('user')
  })

  test('an unrecognised role value is not trusted', async () => {
    // A server that answers 'owner' or 'root' must not be treated as staff.
    rpc.mockResolvedValue({ data: 'root', error: null })
    const res = await getMyRole()
    expect(res.role).toBe('user')
    expect(isStaff(res.role)).toBe(false)
  })
})

describe('isStaff', () => {
  test('only admin and super_admin are staff', () => {
    expect(isStaff('super_admin')).toBe(true)
    expect(isStaff('admin')).toBe(true)
    expect(isStaff('user')).toBe(false)
  })
})
