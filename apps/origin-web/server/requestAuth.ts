export type AuthDecision = 'authorized' | 'unauthorized' | 'not_configured'

export function readBearer(authorization: string | undefined): string | null {
  if (!authorization) return null
  const match = authorization.trim().match(/^Bearer ([^\s,]+)$/i)
  return match ? match[1] : null
}

export function constantTimeEqual(expected: string, candidate: string): boolean {
  const a = new TextEncoder().encode(expected)
  const b = new TextEncoder().encode(candidate)
  if (a.length !== b.length) return false
  let different = 0
  for (let i = 0; i < a.length; i += 1) different |= a[i] ^ b[i]
  return different === 0
}

export function authorizeService(headers: Headers, configuredToken: string | undefined): AuthDecision {
  if (!configuredToken || !configuredToken.trim()) return 'not_configured'
  const candidate = readBearer(headers.get('authorization') ?? undefined)
  return candidate && constantTimeEqual(configuredToken, candidate) ? 'authorized' : 'unauthorized'
}

export function authorizeVapi(headers: Headers, configuredSecret: string | undefined): AuthDecision {
  if (!configuredSecret || !configuredSecret.trim()) return 'not_configured'
  const header = headers.get('x-vapi-secret')
  const candidate = header === null ? readBearer(headers.get('authorization') ?? undefined) : header
  return candidate && constantTimeEqual(configuredSecret, candidate) ? 'authorized' : 'unauthorized'
}
