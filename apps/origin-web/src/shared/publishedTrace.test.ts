import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPublishedTrace } from './publishedTrace'

// The loader returns the published bytes unchanged, and throws (never a trace) on any failure.
const published = readFileSync(new URL('../../public/proof/tr-a002.json', import.meta.url), 'utf8')
const serve = (body: string, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })))

describe('loadPublishedTrace', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns the file byte for byte with its parsed trace, from this site', async () => {
    serve(published)
    const { text, trace } = await loadPublishedTrace()
    expect(text).toBe(published)
    expect(trace.events).toHaveLength(12)
    expect(fetch).toHaveBeenCalledWith('/proof/tr-a002.json')
  })

  it('throws on a failed request, an event_count that does not match the events, or a different shape', async () => {
    serve('', 404)
    await expect(loadPublishedTrace()).rejects.toThrow('HTTP 404')
    serve(JSON.stringify({ ...JSON.parse(published), event_count: 13 }))
    await expect(loadPublishedTrace()).rejects.toThrow('unexpected shape')
    serve('null')
    await expect(loadPublishedTrace()).rejects.toThrow('unexpected shape')
  })
})
