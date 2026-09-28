import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestPost } from './lead.ts'

const env = { INSFORGE_BASE_URL: 'https://test.insforge.app', INSFORGE_API_KEY: 'server-only-test-key', LEAD_WEBHOOK_URL: 'https://notify.example/hook' }
const post = (headers: Record<string, string> = { 'cf-connecting-ip': '203.0.113.5' }, config = env) => onRequestPost({ env: config, request: new Request('https://origin.test/api/lead', { method: 'POST', headers, body: JSON.stringify({ name: 'Test', email: 'test@example.test' }) }) })
afterEach(() => vi.unstubAllGlobals())

describe('lead admission before persistence and notification', () => {
  it('returns 429 with retry time and performs no side effects on denial', async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({ allowed: false, retry_after: 420 }))
    vi.stubGlobal('fetch', fetch)
    const result = await post()
    expect(result.status).toBe(429)
    expect(result.headers.get('retry-after')).toBe('420')
    expect(await result.json()).toEqual({ ok: false, error: 'rate_limited' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe(`${env.INSFORGE_BASE_URL}/api/database/rpc/admit_origin_lead`)
  })
  it('sends an HMAC identifier, never a raw address or spoofable forwarded header', async () => {
    const fetch = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => String(url).includes('/rpc/') ? Response.json({ allowed: true, retry_after: 0 }) : Response.json([]))
    vi.stubGlobal('fetch', fetch)
    expect((await post({ 'cf-connecting-ip': '203.0.113.5', 'x-forwarded-for': '198.51.100.1' })).status).toBe(200)
    const first = JSON.parse(String(fetch.mock.calls[0][1]?.body))
    expect(first).toEqual({ client_key: expect.stringMatching(/^[a-f0-9]{64}$/) })
    expect(JSON.stringify(first)).not.toContain('203.0.113.5')
    await post({ 'cf-connecting-ip': '203.0.113.5', 'x-forwarded-for': '198.51.100.2' })
    expect(JSON.parse(String(fetch.mock.calls[3][1]?.body))).toEqual(first)
    await post({ 'cf-connecting-ip': '203.0.113.6' })
    expect(JSON.parse(String(fetch.mock.calls[6][1]?.body))).not.toEqual(first)
  })
  it.each(['error', 'malformed', 'throw'])('fails closed if the shared limiter is %s', async mode => {
    const fetch = vi.fn(async () => { if (mode === 'throw') throw new Error('unavailable'); return mode === 'error' ? new Response('', { status: 503 }) : Response.json({ allowed: 'yes' }) })
    vi.stubGlobal('fetch', fetch)
    expect((await post()).status).toBe(503)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('fails closed without a trusted edge address or backend configuration', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    expect((await post({ 'x-forwarded-for': '203.0.113.5' })).status).toBe(503)
    expect((await post(undefined, { ...env, INSFORGE_API_KEY: '' })).status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })
})
