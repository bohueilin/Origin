// Contract for POST /api/lead.
//
// WHY THIS FILE EXISTS. Until now the handler forwarded a lead to a webhook or to
// Resend and returned `{ delivered: true }` — with nothing written to the database.
// A live self-test proved it: the request succeeded, the email went out, and the
// admin queue stayed empty. "Delivered" meant "someone got an email", which is not
// the same as "the request is in the system", and an emailed lead is not a queue
// you can work. These tests pin the stronger contract:
//
//   1. Every valid lead is PERSISTED, and persistence is independent of delivery.
//   2. A failing/absent notification channel must never lose the row.
//   3. A failing database must never 500 the visitor's form.
//   4. The response reports the two outcomes SEPARATELY, so the site can stop
//      claiming success it did not achieve.
//
// Written before the implementation; expected to fail against the current handler.

import { describe, expect, test, vi, afterEach } from 'vitest'
import { onRequestPost } from './lead.ts'

interface Env {
  LEAD_WEBHOOK_URL?: string
  RESEND_API_KEY?: string
  LEAD_TO_EMAIL?: string
  LEAD_FROM_EMAIL?: string
  INSFORGE_BASE_URL?: string
  INSFORGE_API_KEY?: string
}

const DB_ENV: Env = { INSFORGE_BASE_URL: 'https://proj.insforge.app', INSFORGE_API_KEY: 'ins_test_key' }

const VALID = {
  name: 'Dana Reeve',
  email: 'dana@acme.example',
  company: 'Acme Robotics',
  blocker: 'Security review keeps bouncing our agent.',
  intent: 'review',
  cta_source: 'hero',
  page_path: '/',
}

function post(body: unknown, env: Env): Promise<Response> {
  const request = new Request('https://origin-physical-ai.pages.dev/api/lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return onRequestPost({ request, env })
}

/** Every fetch call the handler made whose URL points at the InsForge data API. */
function dbCalls(spy: ReturnType<typeof vi.fn>): Array<{ url: string; init: RequestInit }> {
  return spy.mock.calls
    .map(([url, init]) => ({ url: String(url), init: (init ?? {}) as RequestInit }))
    .filter((c) => c.url.includes('/api/database/records/'))
}

afterEach(() => { vi.unstubAllGlobals() })

describe('POST /api/lead — persistence', () => {
  test('writes the lead to the leads table even with no notification channel configured', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify([{ id: 'row-1' }]), { status: 201 }))
    vi.stubGlobal('fetch', fetchSpy)

    const res = await post(VALID, DB_ENV)
    const body = (await res.json()) as { ok: boolean; stored: boolean; delivered: boolean }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.stored).toBe(true)
    // No webhook and no Resend key: nothing was emailed, and the response must say so
    // rather than reporting a success it did not achieve.
    expect(body.delivered).toBe(false)

    const calls = dbCalls(fetchSpy)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://proj.insforge.app/api/database/records/leads')
    expect(calls[0].init.method).toBe('POST')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer ins_test_key')

    // The data API takes an ARRAY body, and reserved columns must not be sent.
    const rows = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>[]
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: 'Dana Reeve',
      email: 'dana@acme.example',
      company: 'Acme Robotics',
      blocker: 'Security review keeps bouncing our agent.',
      intent: 'review',
      cta_source: 'hero',
      page_path: '/',
    })
    expect(rows[0]).not.toHaveProperty('id')
    expect(rows[0]).not.toHaveProperty('created_at')
    expect(rows[0]).not.toHaveProperty('status')
  })

  test('persists the lead even when the notification channel fails', async () => {
    // The regression this guards: a dead webhook used to mean the lead existed
    // nowhere at all.
    const fetchSpy = vi.fn(async (url: unknown) =>
      String(url).includes('/api/database/records/')
        ? new Response(JSON.stringify([{ id: 'row-2' }]), { status: 201 })
        : new Response('gone', { status: 500 }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const res = await post(VALID, { ...DB_ENV, LEAD_WEBHOOK_URL: 'https://hooks.example/dead' })
    const body = (await res.json()) as { ok: boolean; stored: boolean; delivered: boolean }

    expect(body.stored).toBe(true)
    expect(body.delivered).toBe(false)
    expect(dbCalls(fetchSpy)).toHaveLength(1)
  })

  test('a database outage still returns 200 so the visitor never sees a broken form', async () => {
    const fetchSpy = vi.fn(async (url: unknown) =>
      String(url).includes('/api/database/records/')
        ? new Response('nope', { status: 503 })
        : new Response('ok', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const res = await post(VALID, { ...DB_ENV, LEAD_WEBHOOK_URL: 'https://hooks.example/live' })
    const body = (await res.json()) as { ok: boolean; stored: boolean; delivered: boolean }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.stored).toBe(false)
    expect(body.delivered).toBe(true)
  })

  test('a thrown fetch is contained — no 500, and delivery is still attempted', async () => {
    const fetchSpy = vi.fn(async (url: unknown) => {
      if (String(url).includes('/api/database/records/')) throw new Error('network down')
      return new Response('ok', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const res = await post(VALID, { ...DB_ENV, LEAD_WEBHOOK_URL: 'https://hooks.example/live' })
    const body = (await res.json()) as { ok: boolean; stored: boolean; delivered: boolean }

    expect(res.status).toBe(200)
    expect(body.stored).toBe(false)
    expect(body.delivered).toBe(true)
  })

  test('with InsForge unconfigured the handler degrades instead of failing', async () => {
    const fetchSpy = vi.fn(async () => new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const res = await post(VALID, { LEAD_WEBHOOK_URL: 'https://hooks.example/live' })
    const body = (await res.json()) as { ok: boolean; stored: boolean; delivered: boolean }

    expect(res.status).toBe(200)
    expect(body.stored).toBe(false)
    expect(body.delivered).toBe(true)
    expect(dbCalls(fetchSpy)).toHaveLength(0)
  })
})

describe('POST /api/lead — validation still holds', () => {
  test('the honeypot is accepted silently and writes nothing', async () => {
    const fetchSpy = vi.fn(async () => new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const res = await post({ ...VALID, company_website: 'http://spam.example' }, DB_ENV)
    expect(res.status).toBe(200)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('an invalid email is rejected and writes nothing', async () => {
    const fetchSpy = vi.fn(async () => new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const res = await post({ ...VALID, email: 'not-an-email' }, DB_ENV)
    expect(res.status).toBe(422)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('oversized free text is clipped to the column limits before it reaches the database', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify([{ id: 'row-3' }]), { status: 201 }))
    vi.stubGlobal('fetch', fetchSpy)

    await post({ ...VALID, company: 'C'.repeat(500), blocker: 'B'.repeat(20_000) }, DB_ENV)

    const rows = JSON.parse(String(dbCalls(fetchSpy)[0].init.body)) as Record<string, string>[]
    // Matches the CHECK constraints in migrations/20260804023516_admin-portal-schema.sql:
    // company <= 200, blocker <= 8000. Exceeding them would make Postgres reject the
    // row, which is exactly the silent loss these tests exist to prevent.
    expect(rows[0].company.length).toBe(200)
    expect(rows[0].blocker.length).toBe(8000)
  })
})
