// Pages Function adapter for parse-floor — behavioral spec, written BEFORE the
// implementation (TDD). The adapter is thin: parse the body, size-guard it,
// build a CerebrasConfig from the Pages env, and hand off to the SAME
// handleParseFloor the Hono server uses — one parse path, two runtimes.
//
// This function exists because the deployed site never had one: foundry.html
// shipped, but /api/foundry/* 404'd on Cloudflare Pages (the Hono server only
// runs locally). Same root cause as the /api/lead outage — a route with no
// Pages Function behind it.

import { describe, expect, it } from 'vitest'
import { onRequestPost } from './parse-floor.ts'
import type { ParseFloorResponse } from '../../../src/foundry/types.ts'

const call = async (body: string, env: Record<string, string | undefined> = {}): Promise<Response> =>
  onRequestPost({
    request: new Request('https://origin.test/api/foundry/parse-floor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    env,
  } as Parameters<typeof onRequestPost>[0])

describe('POST /api/foundry/parse-floor (Cloudflare Pages Function)', () => {
  it('demo mode with no env: 200, labeled sample floor, no-store', async () => {
    const res = await call(JSON.stringify({}))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const data = (await res.json()) as ParseFloorResponse
    expect(data.ok).toBe(true)
    expect(data.fallback).toBe('no_image')
    expect(data.siteMap).not.toBeNull()
  })

  it('an uploaded image with no CEREBRAS_API_KEY is refused, not answered with a sample', async () => {
    const res = await call(JSON.stringify({ imageDataUri: 'data:image/png;base64,AAAA' }))
    expect(res.status).toBe(200)
    const data = (await res.json()) as ParseFloorResponse
    expect(data.ok).toBe(false)
    expect(data.siteMap).toBeNull()
    expect(data.fallback).toBe('no_key')
  })

  it('rejects a non-JSON body with 400', async () => {
    const res = await call('not json at all')
    expect(res.status).toBe(400)
    const data = (await res.json()) as { ok: boolean }
    expect(data.ok).toBe(false)
  })

  it('rejects an oversize body with 413 before parsing it', async () => {
    const res = await call(`{"imageDataUri":"${'A'.repeat(10_600_000)}"}`)
    expect(res.status).toBe(413)
  })

  it('rejects an oversize declared Content-Length without reading the body', async () => {
    const req = new Request('https://origin.test/api/foundry/parse-floor', { method: 'POST', body: '{}' })
    Object.defineProperty(req, 'headers', { value: new Headers({ 'content-length': '99999999' }) })
    const res = await onRequestPost({ request: req, env: {} } as Parameters<typeof onRequestPost>[0])
    expect(res.status).toBe(413)
  })

  it('is disable-able via env kill switch (PARSE_DISABLED)', async () => {
    const res = await call(JSON.stringify({}), { PARSE_DISABLED: '1' })
    expect(res.status).toBe(503)
  })

  it('rate-limits repeated calls per isolate (paid-key endpoint, not a free relay)', async () => {
    // The limiter is per-isolate and in-memory — real edge enforcement should
    // ALSO come from a Cloudflare WAF rate rule (dashboard). This is friction,
    // honestly scoped, not a guarantee.
    const statuses: number[] = []
    for (let i = 0; i < 40; i += 1) statuses.push((await call(JSON.stringify({}), { PARSE_RATE_PER_MIN: '10' })).status)
    // Window state is module-level (earlier tests in this file legitimately
    // consumed some of it), so assert the shape, not exact positions: requests
    // beyond the limit 429, and every response is one of the two.
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(30)
    expect(statuses.every((s) => s === 200 || s === 429)).toBe(true)
  })
})
