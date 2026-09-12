import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from './config.ts'

afterEach(() => vi.unstubAllEnvs())

describe('Node production auth configuration', () => {
  it('treats unset, empty, and whitespace authority values as absent', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('EPISODE_SIGNING_SECRET', '')
    for (const value of [undefined, '', '   ']) {
      vi.stubEnv('SERVICE_AUTH_TOKEN', value)
      vi.stubEnv('VAPI_WEBHOOK_SECRET', value)
      const config = loadConfig('/definitely/no/janus-env-file')
      expect(config.serviceAuthToken).toBeUndefined()
      expect(config.vapiWebhookSecret).toBeUndefined()
    }
  })

  it('rejects unset, empty, and whitespace signing secrets in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    for (const value of [undefined, '', '   ']) {
      vi.stubEnv('EPISODE_SIGNING_SECRET', value)
      expect(() => loadConfig('/definitely/no/janus-env-file')).toThrow(/EPISODE_SIGNING_SECRET/)
    }
  })
})
