import { describe, expect, it } from 'vitest'
import { authorizeService, authorizeVapi, constantTimeEqual, readBearer } from './requestAuth.ts'

describe('request authority helpers', () => {
  it('accepts exactly one normalized Bearer credential', () => {
    expect(readBearer(' Bearer token ')).toBe('token')
    expect(readBearer('bEaReR token')).toBe('token')
    for (const value of [undefined, '', 'Basic token', 'Bearer ', 'Bearer one two', 'Bearer one,two', 'Bearer\ttoken']) expect(readBearer(value)).toBeNull()
  })

  it('compares all configured service and Vapi credentials without cross-authorizing', () => {
    expect(constantTimeEqual('sëcret', 'sëcret')).toBe(true)
    expect(constantTimeEqual('sëcret', 'sëcrex')).toBe(false)
    expect(constantTimeEqual('short', 'longer')).toBe(false)
    expect(authorizeService(new Headers({ authorization: 'Bearer service' }), 'service')).toBe('authorized')
    expect(authorizeService(new Headers(), undefined)).toBe('not_configured')
    expect(authorizeService(new Headers(), '   ')).toBe('not_configured')
    expect(authorizeVapi(new Headers({ 'x-vapi-secret': 'wrong', authorization: 'Bearer vapi' }), 'vapi')).toBe('unauthorized')
    expect(authorizeVapi(new Headers({ authorization: 'Bearer vapi' }), 'vapi')).toBe('authorized')
    expect(authorizeVapi(new Headers({ authorization: 'Bearer service' }), 'vapi')).toBe('unauthorized')
  })
})
