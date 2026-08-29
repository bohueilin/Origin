// Contract for the owner-side credential-store readers.
//
// WHY THIS FILE EXISTS. Every reader here used to end in `if (error || !data) return []`,
// so a failed read and an empty account produced the identical value. The account console
// then rendered "No agent can act on your behalf yet" with 0/0/0 counters, and the audit
// tab rendered "No activity yet." underneath copy promising a tamper-evident record — a
// silent failure that reads as good news. That is the same defect class as the role lookup
// which hid the admin portal for a month (see ../roleStore.test.ts).
//
// The contract these tests pin: a reader answers { ok, rows, error }. `rows` is always an
// array so callers can map it unconditionally, and `ok` says whether an empty `rows` is a
// FACT about the account or a QUESTION we failed to answer. The UI must be able to tell
// those apart; a bare [] cannot.

import { beforeEach, describe, expect, test, vi } from 'vitest'

type Res = { data: unknown; error: { message: string } | null }

const EMPTY: Res = { data: [], error: null }
const responses = new Map<string, Res>()
const tablesTouched: string[] = []

// Minimal stand-in for the SDK's thenable query builder: every chainable method returns
// the same object, and awaiting it yields whatever this table was primed with.
function chain(table: string): Record<string, unknown> {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'limit', 'eq', 'gte', 'insert', 'update']) c[m] = () => c
  c.then = (onOk: (v: Res) => unknown, onErr?: (e: unknown) => unknown) =>
    Promise.resolve(responses.get(table) ?? EMPTY).then(onOk, onErr)
  return c
}

vi.mock('../insforge', () => ({
  insforge: {
    database: { from: (t: string) => { tablesTouched.push(t); return chain(t) } },
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: { message: 'offline' } }) },
  },
}))

const store = await import('./store')

beforeEach(() => { responses.clear(); tablesTouched.length = 0 })

// One row per table, carrying only what the row mapper needs to produce a stable id.
const READERS = [
  { name: 'listGrants', table: 'credential_grants', row: { id: 'g1', provider: 'onepassword', target_service: 'Acme', target_domain: 'api.acme.com', scope: 'api_read' }, run: () => store.listGrants() },
  { name: 'listIntegrations', table: 'integration_connections', row: { id: 'i1', provider: 'onepassword' }, run: () => store.listIntegrations() },
  { name: 'listWallets', table: 'wallet_connections', row: { id: 'w1', wallet_address: '0xabc', network: 'base' }, run: () => store.listWallets() },
  { name: 'listAudit', table: 'audit_events', row: { id: 'a1', actor_type: 'user', event_type: 'grant_created' }, run: () => store.listAudit() },
  { name: 'listApprovalRequests', table: 'credential_approval_requests', row: { id: 'ap1', agent_id: 'bot', scope: 'website_login', target_domain: 'acme.com', action: 'log in' }, run: () => store.listApprovalRequests() },
  { name: 'listWalletActions', table: 'wallet_action_requests', row: { id: 'wa1', agent_id: 'bot', action_type: 'transfer' }, run: () => store.listWalletActions() },
  { name: 'listSessionKeys', table: 'wallet_session_keys', row: { id: 'sk1', agent_id: 'bot' }, run: () => store.listSessionKeys() },
] as const

describe.each(READERS)('$name', ({ table, row, run }) => {
  test('a successful read is ok and carries the mapped rows', async () => {
    responses.set(table, { data: [row], error: null })
    const res = await run()
    expect(res.ok).toBe(true)
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].id).toBe(row.id)
    expect(res.error).toBeUndefined()
  })

  test('a genuinely empty table is ok — emptiness is a fact here', async () => {
    responses.set(table, EMPTY)
    const res = await run()
    expect(res.ok).toBe(true)
    expect(res.rows).toEqual([])
  })

  test('a database error is REPORTED, not flattened into an empty list', async () => {
    responses.set(table, { data: null, error: { message: 'permission denied' } })
    const res = await run()
    expect(res.ok).toBe(false)
    expect(res.rows).toEqual([]) // still safe to map
    expect(res.error).toContain('permission denied')
  })

  test('a missing payload with no error is a non-answer, not an empty account', async () => {
    // A successful select always yields an array. `data: null` means we did not get an
    // answer we understand — reporting it as "you have nothing" would be a lie.
    responses.set(table, { data: null, error: null })
    const res = await run()
    expect(res.ok).toBe(false)
    expect(res.rows).toEqual([])
    expect(res.error).toBeTruthy()
  })
})

describe('without a backend', () => {
  test('a reader says so rather than reporting an empty account', async () => {
    vi.resetModules()
    vi.doMock('../insforge', () => ({ insforge: null }))
    const offline = await import('./store')
    const res = await offline.listGrants()
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
    vi.doUnmock('../insforge')
    vi.resetModules()
  })
})

describe('prepareWalletActionGoverned', () => {
  const draft = { agentId: 'bot', walletConnectionId: 'w1', destination: '0xdead', amount: '0.01', asset: 'ETH', network: 'base' }

  test('refuses when the session-key policy cannot be read', async () => {
    // Fail-closed on the money path. An unreadable policy is NOT "this agent has no
    // policy" — treating it that way would let a draft through with no bound at all,
    // which is precisely the bound the session key exists to impose.
    responses.set('wallet_session_keys', { data: null, error: { message: 'JWT expired' } })
    const res = await store.prepareWalletActionGoverned(draft)
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
    expect(tablesTouched).not.toContain('wallet_action_requests')
  })

  test('still queues a draft when the account genuinely has no session key', async () => {
    responses.set('wallet_session_keys', EMPTY)
    responses.set('wallet_action_requests', { data: [{ id: 'wa9', agent_id: 'bot', action_type: 'transfer' }], error: null })
    const res = await store.prepareWalletActionGoverned(draft)
    expect(res.ok).toBe(true)
    expect(res.request?.id).toBe('wa9')
  })
})
