// Pages Function adapter for parse-floor — behavioral spec, written BEFORE the
// implementation (TDD). The adapter is thin: parse the body, size-guard it,
// build a CerebrasConfig from the Pages env, and hand off to the SAME
// handleParseFloor the Hono server uses — one parse path, two runtimes.
//
// This function exists because the deployed site never had one: foundry.html
// shipped, but /api/foundry/* 404'd on Cloudflare Pages (the Hono server only
// runs locally). Same root cause as the /api/lead outage — a route with no
// Pages Function behind it.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_PARSE_BODY_BYTES, onRequestPost, resetParseRateLimitForTest } from './parse-floor.ts'
import type { ParseFloorResponse } from '../../../src/foundry/types.ts'

const call = async (
  body: string,
  env: Record<string, string | undefined> = {},
  authorization = 'Bearer pages-test-token',
): Promise<Response> =>
  onRequestPost({
    request: new Request('https://origin.test/api/foundry/parse-floor', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization },
      body,
    }),
    env: { SERVICE_AUTH_TOKEN: 'pages-test-token', ...env },
  } as Parameters<typeof onRequestPost>[0])

describe('POST /api/foundry/parse-floor (Cloudflare Pages Function)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    resetParseRateLimitForTest()
  })

  it('fails closed before parsing the body when service authority is absent or invalid', async () => {
    expect((await call('{not-json', { SERVICE_AUTH_TOKEN: undefined })).status).toBe(503)
    const unauthorized = await call('{not-json', { SERVICE_AUTH_TOKEN: 'pages-test-token' }, 'Bearer wrong')
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('does not pull a streaming body before service authentication succeeds', async () => {
    let bodyReads = 0
    const request = {
      headers: new Headers({ authorization: 'Bearer wrong' }),
      get body() {
        bodyReads += 1
        throw new Error('body must not be read')
      },
    } as unknown as Request

    const res = await onRequestPost({ request, env: { SERVICE_AUTH_TOKEN: 'pages-test-token' } })

    expect(res.status).toBe(401)
    expect(bodyReads).toBe(0)
  })

  it('authorized demo mode with no provider env: 200, labeled sample floor, no-store', async () => {
    const res = await call(JSON.stringify({}))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const data = (await res.json()) as ParseFloorResponse
    expect(data.ok).toBe(true)
    expect(data.fallback).toBe('no_image')
    expect(data.siteMap).not.toBeNull()
  })

  it('an uploaded image with no CEREBRAS_API_KEY is refused, not answered with a sample', async () => {
    const res = await call(JSON.stringify({ imageDataUri: 'data:image/png;base64,AAAA', uploadConsent: true }), { PARSE_EXTERNAL_ENABLED: '1' })
    expect(res.status).toBe(200)
    const data = (await res.json()) as ParseFloorResponse
    expect(data.ok).toBe(false)
    expect(data.siteMap).toBeNull()
    expect(data.fallback).toBe('no_key')
  })

  it('maps disabled external parsing and missing consent to typed HTTP failures', async () => {
    const disabled = await call(JSON.stringify({ imageDataUri: 'data:image/png;base64,AAAA', uploadConsent: true }))
    expect(disabled.status).toBe(503)
    expect(await disabled.json()).toMatchObject({ ok: false, fallback: 'external_parse_disabled' })

    const missingConsent = await call(
      JSON.stringify({ imageDataUri: 'data:image/png;base64,AAAA' }),
      { PARSE_EXTERNAL_ENABLED: '1', CEREBRAS_API_KEY: 'test-key' },
    )
    expect(missingConsent.status).toBe(400)
    expect(await missingConsent.json()).toMatchObject({ ok: false, fallback: 'consent_required' })
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
    Object.defineProperty(req, 'headers', { value: new Headers({ 'content-length': '99999999', authorization: 'Bearer pages-test-token' }) })
    const res = await onRequestPost({ request: req, env: { SERVICE_AUTH_TOKEN: 'pages-test-token' } } as Parameters<typeof onRequestPost>[0])
    expect(res.status).toBe(413)
  })

  it('bounds a chunked stream by bytes before JSON parsing', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_PARSE_BODY_BYTES))
        controller.enqueue(new Uint8Array([1]))
        controller.close()
      },
    })
    const request = new Request('https://origin.test/api/foundry/parse-floor', {
      method: 'POST',
      headers: { authorization: 'Bearer pages-test-token' },
      body,
      duplex: 'half',
    } as RequestInit)

    const res = await onRequestPost({ request, env: { SERVICE_AUTH_TOKEN: 'pages-test-token' } })

    expect(res.status).toBe(413)
  })

  it('is disable-able via env kill switch (PARSE_DISABLED)', async () => {
    const res = await call(JSON.stringify({}), { PARSE_DISABLED: '1' })
    expect(res.status).toBe(503)
  })

  it('charges only provider-eligible image requests immediately before dispatch', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        width: 4, height: 4, start: { x: 0, y: 0 }, item: { x: 1, y: 0 }, drop: { x: 2, y: 0 },
        obstacles: [], hazards: [], humanOnly: [],
      }) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchSpy)
    const env = {
      PARSE_RATE_PER_MIN: '1', PARSE_EXTERNAL_ENABLED: '1', CEREBRAS_API_KEY: 'test-key',
    }

    expect((await call('{}', env)).status).toBe(200)
    expect((await call('not json', env)).status).toBe(400)
    expect((await call(JSON.stringify({ imageDataUri: 'data:text/plain;base64,AAAA', uploadConsent: true }), env)).status).toBe(200)
    expect((await call(JSON.stringify({ imageDataUri: 'data:image/png;base64,AAAA' }), env)).status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()

    const eligible = JSON.stringify({ imageDataUri: 'data:image/png;base64,AAAA', uploadConsent: true })
    expect((await call(eligible, env)).status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect((await call(eligible, env)).status).toBe(429)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
