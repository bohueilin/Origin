import { describe, expect, it } from 'vitest'
import { onRequestGet, onRequestHead } from './status.ts'

describe('retired Pages evidence status', () => {
  it('returns an explicit 410 tombstone without requiring service credentials', async () => {
    const response = onRequestGet()
    expect(response.status).toBe(410)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ ok: false, status: 'retired', error: 'evidence_status_retired' })
  })
  it('HEAD has the same status and headers with no body', async () => {
    const response = onRequestHead()
    expect(response.status).toBe(410)
    expect(await response.text()).toBe('')
  })
})
