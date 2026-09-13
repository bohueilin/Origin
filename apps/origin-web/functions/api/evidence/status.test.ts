import { describe, expect, it } from 'vitest'
import { onRequestGet, onRequestHead } from './status.ts'

const request = (method: 'GET' | 'HEAD', authorization?: string) => new Request('https://origin.test/api/evidence/status', {
  method,
  headers: authorization ? { authorization } : {},
})

describe('Pages evidence status authority', () => {
  it('requires configured service authority for GET before returning the unavailable stub', async () => {
    expect(onRequestGet({ request: request('GET'), env: {} }).status).toBe(503)
    const unauthorized = onRequestGet({ request: request('GET', 'Bearer wrong'), env: { SERVICE_AUTH_TOKEN: 'pages-token' } })
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get('www-authenticate')).toBe('Bearer')
    const accepted = onRequestGet({ request: request('GET', 'Bearer pages-token'), env: { SERVICE_AUTH_TOKEN: 'pages-token' } })
    expect(accepted.status).toBe(200)
    expect(await accepted.json()).toEqual({ ok: false, status: 'unavailable' })
  })

  it('applies the same policy to HEAD without returning a body', async () => {
    expect(onRequestHead({ request: request('HEAD'), env: { SERVICE_AUTH_TOKEN: 'pages-token' } }).status).toBe(401)
    const accepted = onRequestHead({ request: request('HEAD', 'Bearer pages-token'), env: { SERVICE_AUTH_TOKEN: 'pages-token' } })
    expect(accepted.status).toBe(200)
    expect(await accepted.text()).toBe('')
  })
})
