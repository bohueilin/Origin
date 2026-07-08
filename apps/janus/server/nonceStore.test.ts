import { afterEach, describe, expect, it, vi } from 'vitest'
import { consumeNonceDurable } from './nonceStore.ts'
import type { InsforgeConfig } from './config.ts'

const cfg: InsforgeConfig = { baseUrl: 'https://x.insforge.app', apiKey: 'ik_test', timeoutMs: 2000 }

function mockFetch(impl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl))
}
function res(status: number, body = '{}'): Response {
  return new Response(body, { status })
}

afterEach(() => vi.unstubAllGlobals())

describe('consumeNonceDurable — durable one-shot replay protection', () => {
  it('returns unavailable when InsForge is not configured (caller falls back to in-process)', async () => {
    const r = await consumeNonceDurable('n1', 1500, false, {})
    expect(r.status).toBe('unavailable')
  })

  it('first insert succeeds → consumed', async () => {
    mockFetch(async () => res(201, '[{"id":"a"}]'))
    const r = await consumeNonceDurable('n2', 1500, true, cfg)
    expect(r.status).toBe('consumed')
  })

  it('HTTP 409 conflict → replayed', async () => {
    mockFetch(async () => res(409))
    const r = await consumeNonceDurable('n3', 1500, true, cfg)
    expect(r.status).toBe('replayed')
  })

  it('4xx carrying a duplicate-key / unique-violation body → replayed', async () => {
    for (const body of ['duplicate key value violates unique constraint', 'SQLSTATE 23505', 'already exists']) {
      mockFetch(async () => res(400, body))
      const r = await consumeNonceDurable('n4', 1500, true, cfg)
      expect(r.status).toBe('replayed')
    }
  })

  it('a non-conflict server error → unavailable (degrade, never block)', async () => {
    mockFetch(async () => res(500, 'internal error'))
    const r = await consumeNonceDurable('n5', 1500, true, cfg)
    expect(r.status).toBe('unavailable')
  })

  it('a network throw → unavailable (never throws to the caller)', async () => {
    mockFetch(async () => {
      throw new Error('boom')
    })
    const r = await consumeNonceDurable('n6', 1500, true, cfg)
    expect(r.status).toBe('unavailable')
  })

  it('sends the nonce as an array body and never includes id/created_at', async () => {
    let captured: unknown
    mockFetch(async (...args: unknown[]) => {
      const init = args[1] as RequestInit
      captured = JSON.parse(String(init.body))
      return res(201, '[{"id":"a"}]')
    })
    await consumeNonceDurable('n7', 1500, true, cfg)
    expect(Array.isArray(captured)).toBe(true)
    const row = (captured as Record<string, unknown>[])[0]
    expect(row).toEqual({ nonce: 'n7', amount_cents: 1500, live: true })
    expect(row).not.toHaveProperty('id')
    expect(row).not.toHaveProperty('created_at')
  })
})
