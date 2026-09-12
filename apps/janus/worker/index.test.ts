import { describe, expect, it } from 'vitest'
import { configFromEnv } from './index.ts'

describe('Worker production config', () => {
  it('rejects absent and blank signing secrets before app construction', () => {
    for (const secret of [undefined, '', '   ']) expect(() => configFromEnv({ APP_DO: {} as DurableObjectNamespace, EPISODE_SIGNING_SECRET: secret })).toThrow(/EPISODE_SIGNING_SECRET/)
  })

  it('retains nonblank auth values without a development signing fallback', () => {
    const config = configFromEnv({ APP_DO: {} as DurableObjectNamespace, EPISODE_SIGNING_SECRET: 'worker-secret', SERVICE_AUTH_TOKEN: 'service', VAPI_WEBHOOK_SECRET: 'vapi' })
    expect(config.episodeSecret).toBe('worker-secret')
    expect(config.episodeSecretIsDev).toBe(false)
    expect(config.serviceAuthToken).toBe('service')
    expect(config.vapiWebhookSecret).toBe('vapi')
  })
})
