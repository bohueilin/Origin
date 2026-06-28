import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestApproval, asciiHeader } from './notifyHandler.ts'
import type { NotifyConfig } from './config.ts'

const cfg: NotifyConfig = {
  ntfyBaseUrl: 'https://ntfy.sh',
  ntfyTopic: 'test-topic',
  publicBaseUrl: 'https://tunnel.example.com',
}

afterEach(() => vi.restoreAllMocks())

describe('asciiHeader', () => {
  it('transliterates common punctuation and strips the rest', () => {
    expect(asciiHeader('Pay La Taquería — “game” night…')).toBe('Pay La Taquera - "game" night...')
    expect(asciiHeader('🚀 ship it')).toBe('ship it')
    expect(asciiHeader('plain ascii')).toBe('plain ascii')
  })
})

describe('approval-to-phone push', () => {
  it('still fires a REAL push when the title carries non-ASCII (header stays ASCII)', async () => {
    let sentTitle = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sentTitle = (init.headers as Record<string, string>).Title
        return new Response('ok', { status: 200 })
      }),
    )
    // Em-dash + accent would make fetch throw on the header and drop to simulation before the fix.
    const r = await requestApproval({ title: 'Pay La Taquería — game night', summary: 'detail', amount: 15 }, cfg)
    expect(r.ok).toBe(true)
    expect(r.channel).toBe('push') // 'simulation' if the header had thrown
    expect(r.pushed).toBe(true)
    expect(sentTitle).toMatch(/^[\x20-\x7E]+$/) // pure ASCII
    expect(sentTitle).toContain('$15.00')
  })

  it('still pushes when publicBaseUrl carries a non-ASCII char (Actions header folded, no throw)', async () => {
    let actions = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        actions = (init.headers as Record<string, string>).Actions ?? ''
        return new Response('ok', { status: 200 })
      }),
    )
    const r = await requestApproval({ title: 'ok', summary: 's', amount: 15 }, { ...cfg, publicBaseUrl: 'https://exámple.com' })
    expect(r.channel).toBe('push') // 'simulation' if the Actions header had thrown
    expect(actions).toMatch(/^[\x20-\x7E]*$/) // pure ASCII
  })

  it('falls back to simulation when no channel is configured', async () => {
    const r = await requestApproval({ title: 'x', summary: 'y' }, { ntfyBaseUrl: 'https://ntfy.sh' })
    expect(r.channel).toBe('simulation')
    expect(r.pushed).toBe(false)
    expect(r.approvable_from_phone).toBe(false)
  })
})
