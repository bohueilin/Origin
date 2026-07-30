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
import { onRequestPost } from './parse-floor'
import type { ParseFloorResponse } from '../../../src/foundry/types'

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
})
