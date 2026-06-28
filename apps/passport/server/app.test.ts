import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import type { AppConfig } from './config.ts'

// A test config with NO InsForge creds (in-memory dev fallback) and NO Nebius key
// (the Nebius reference path always falls back to mock). A fixed episode secret
// keeps tokens self-consistent. The app is exercised with `app.request(...)` so no
// port is bound and no network is touched.
const config: AppConfig = {
  port: 0,
  isProd: false,
  nebius: {},
  insforge: {},
  gmi: {},
  snaplii: { baseUrl: 'https://aipayment.snaplii.com', perBuyCapUsd: 60, dailyCapUsd: 120, live: false },
  notify: { ntfyBaseUrl: 'https://ntfy.sh' },
  discord: { channelLabel: 'Game Night' },
  email: { from: 'Passport <onboarding@resend.dev>' },
  onepassword: { integrationName: 'Passport', integrationVersion: 'v1.0.0' },
  demo: {
    deliveryAddress: 'Home',
    orderVendor: 'La Taqueria · DoorDash',
    orderItems: ['Your usual order'],
    orderTotalUsd: 38.5,
    orderEta: '7:00 PM',
    gamePlan: 'Thursday 6:30 PM',
  },
  episodeSecret: 'app-test-secret',
  episodeSecretIsDev: false,
  webOrigins: [],
  warnings: [],
}

const app = createApp(config)

async function post(path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Post a raw (possibly malformed) body string, bypassing JSON.stringify. */
async function postRaw(path: string, raw: string): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw,
  })
}

describe('createApp /api/passport origin guard (CSRF / public-tunnel abuse)', () => {
  // config.webOrigins is [] here, so only localhost is allowed.
  it('REFUSES a state-changing POST with NO Origin (a non-browser caller against the tunnel)', async () => {
    const r = await app.request('/api/passport/wallet/connect', { method: 'POST' })
    expect(r.status).toBe(403)
  })

  it('refuses a POST from a stranger Origin', async () => {
    const r = await app.request('/api/passport/wallet/connect', { method: 'POST', headers: { origin: 'https://evil.example.com' } })
    expect(r.status).toBe(403)
  })

  it('allows a POST from a localhost Origin (a real same-origin browser sends Origin on POST)', async () => {
    const r = await app.request('/api/passport/wallet/connect', { method: 'POST', headers: { origin: 'http://localhost:5275' } })
    expect(r.status).not.toBe(403)
  })

  it('allows a safe GET with no Origin (browsers omit Origin on same-origin GET)', async () => {
    const r = await app.request('/api/passport/order-context', { method: 'GET' })
    expect(r.status).toBe(200)
  })

  it('guards the metered intent route too (cross-origin abuse / quota burn)', async () => {
    const noOrigin = await app.request('/api/passport/intent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(noOrigin.status).toBe(403)
    const stranger = await app.request('/api/passport/intent', { method: 'POST', headers: { origin: 'https://evil.example.com', 'content-type': 'application/json' }, body: '{}' })
    expect(stranger.status).toBe(403)
  })
})

describe('createApp /v1 trust boundary', () => {
  it('PUBLIC reset rejects reserved reference-agent ids', async () => {
    for (const agentId of ['mock-reference', 'nebius-reference']) {
      const resp = await post('/v1/episodes', { scenarioId: 'com-1', agentId })
      expect(resp.status).toBe(400)
      const body = (await resp.json()) as { ok: boolean }
      expect(body.ok).toBe(false)
    }
  })

  it('PUBLIC reset accepts an omitted scenarioId (random external scenario)', async () => {
    const resp = await post('/v1/episodes', { agentId: 'rl-trainer-7' })
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as { ok: boolean; episodeId: string }
    expect(body.ok).toBe(true)
    expect(body.episodeId.length).toBeGreaterThan(0)
  })

  it('PUBLIC reset rejects a non-string or blank scenarioId', async () => {
    for (const scenarioId of [123, true, null, '', '   ']) {
      const resp = await post('/v1/episodes', { scenarioId })
      expect(resp.status).toBe(400)
      expect(((await resp.json()) as { ok: boolean }).ok).toBe(false)
    }
  })

  it('PUBLIC reset rejects a non-string agentId, an array body, and malformed JSON', async () => {
    const nonString = await post('/v1/episodes', { scenarioId: 'com-1', agentId: 42 })
    expect(nonString.status).toBe(400)

    const array = await postRaw('/v1/episodes', JSON.stringify([{ scenarioId: 'com-1' }]))
    expect(array.status).toBe(400)

    const malformed = await postRaw('/v1/episodes', '{ not json')
    expect(malformed.status).toBe(400)
  })

  it('PUBLIC reset accepts a normal external agentId', async () => {
    const resp = await post('/v1/episodes', { scenarioId: 'com-1', agentId: 'rl-trainer-7' })
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as { ok: boolean; agentId: string; episodeId: string }
    expect(body.ok).toBe(true)
    expect(body.agentId).toBe('rl-trainer-7')
    expect(body.episodeId.length).toBeGreaterThan(0)
  })

  it('step accepts EXACTLY { action } and rejects extra fields', async () => {
    const reset = (await (
      await post('/v1/episodes', { scenarioId: 'com-1', agentId: 'rl-trainer-7' })
    ).json()) as { episodeId: string }

    // Extra digest-covered fields are rejected at the HTTP boundary.
    for (const extra of [
      { action: 'act', confidence: 1 },
      { action: 'act', rationale: 'forged' },
      { action: 'act', reward: 999 },
      { action: 'act', license: 'L4' },
      { action: 'act', passed: true },
      { action: 'act', episodeId: 'override' },
    ]) {
      const resp = await post(`/v1/episodes/${reset.episodeId}/step`, extra)
      expect(resp.status).toBe(400)
      const body = (await resp.json()) as { ok: boolean; code: string }
      expect(body.ok).toBe(false)
      expect(body.code).toBe('bad_request')
    }

    // The exact { action } body is accepted and scored by the env.
    const ok = await post(`/v1/episodes/${reset.episodeId}/step`, { action: 'act' })
    expect(ok.status).toBe(200)
    const okBody = (await ok.json()) as { ok: boolean; done: boolean }
    expect(okBody.ok).toBe(true)
    expect(okBody.done).toBe(true)
  })

  it('POST /v1/step enforces EXACTLY { episodeId, action }', async () => {
    const reset = (await (
      await post('/v1/episodes', { scenarioId: 'com-1', agentId: 'rl-trainer-7' })
    ).json()) as { episodeId: string }

    const bad = await post('/v1/step', { episodeId: reset.episodeId, action: 'act', confidence: 0.9 })
    expect(bad.status).toBe(400)
    expect(((await bad.json()) as { code: string }).code).toBe('bad_request')

    const ok = await post('/v1/step', { episodeId: reset.episodeId, action: 'act' })
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as { ok: boolean }).ok).toBe(true)
  })

  it('step routes reject non-string/blank action and malformed bodies', async () => {
    const reset = (await (
      await post('/v1/episodes', { scenarioId: 'com-1', agentId: 'rl-trainer-7' })
    ).json()) as { episodeId: string }

    for (const action of [123, true, null, '', '   ']) {
      const path = await post(`/v1/episodes/${reset.episodeId}/step`, { action })
      expect(path.status).toBe(400)
      expect(((await path.json()) as { code: string }).code).toBe('bad_request')

      const bodyForm = await post('/v1/step', { episodeId: reset.episodeId, action })
      expect(bodyForm.status).toBe(400)
      expect(((await bodyForm.json()) as { code: string }).code).toBe('bad_request')
    }

    // Array body and malformed JSON are rejected before reaching the env.
    const array = await postRaw(`/v1/episodes/${reset.episodeId}/step`, JSON.stringify(['act']))
    expect(array.status).toBe(400)
    const malformed = await postRaw('/v1/step', '{ not json')
    expect(malformed.status).toBe(400)
  })
})

describe('createApp /v1/reference-episodes (server-owned reference agents)', () => {
  it('mock mode runs an episode and reports mock/mock provenance', async () => {
    const resp = await post('/v1/reference-episodes', { scenarioId: 'com-1', mode: 'mock' })
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as {
      ok: boolean
      step: { done: boolean; license: { episodes: number } }
      decision: { source: string }
      provenance: { requestedPolicyMode: string; actualPolicySource: string; fallback: boolean }
    }
    expect(body.ok).toBe(true)
    expect(body.step.done).toBe(true)
    expect(body.step.license.episodes).toBe(1)
    expect(body.decision.source).toBe('mock')
    expect(body.provenance.requestedPolicyMode).toBe('mock')
    expect(body.provenance.actualPolicySource).toBe('mock')
    expect(body.provenance.fallback).toBe(false)
  })

  it('nebius mode with no key falls back to a fresh mock episode (never steps nebius)', async () => {
    const resp = await post('/v1/reference-episodes', { scenarioId: 'com-1', mode: 'nebius' })
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as {
      ok: boolean
      decision: { source: string }
      provenance: { requestedPolicyMode: string; actualPolicySource: string; fallback: boolean; fallbackCode: string | null }
    }
    expect(body.ok).toBe(true)
    // The model could not propose, so the fallback mock episode is what ran.
    expect(body.decision.source).toBe('mock')
    expect(body.provenance.requestedPolicyMode).toBe('nebius')
    expect(body.provenance.actualPolicySource).toBe('mock')
    expect(body.provenance.fallback).toBe(true)
    expect(body.provenance.fallbackCode).toBe('nebius_unavailable')
  })

  it('rejects an unknown mode', async () => {
    const resp = await post('/v1/reference-episodes', { scenarioId: 'com-1', mode: 'gpt' })
    expect(resp.status).toBe(400)
    expect(((await resp.json()) as { ok: boolean }).ok).toBe(false)
  })

  it('rejects extra fields', async () => {
    const resp = await post('/v1/reference-episodes', { scenarioId: 'com-1', mode: 'mock', agentId: 'nebius-reference' })
    expect(resp.status).toBe(400)
    expect(((await resp.json()) as { code: string }).code).toBe('bad_request')
  })

  it('rejects an unknown scenarioId', async () => {
    const resp = await post('/v1/reference-episodes', { scenarioId: 'nope', mode: 'mock' })
    expect(resp.status).toBe(400)
    expect(((await resp.json()) as { ok: boolean }).ok).toBe(false)
  })

  it('rejects a missing scenarioId (no random reference scenario)', async () => {
    const resp = await post('/v1/reference-episodes', { mode: 'mock' })
    expect(resp.status).toBe(400)
    expect(((await resp.json()) as { code: string }).code).toBe('bad_request')
  })

  it('rejects a non-string or blank scenarioId', async () => {
    for (const scenarioId of [123, true, null, '', '   ']) {
      const resp = await post('/v1/reference-episodes', { scenarioId, mode: 'mock' })
      expect(resp.status).toBe(400)
      expect(((await resp.json()) as { code: string }).code).toBe('bad_request')
    }
  })

  it('rejects an array body', async () => {
    const resp = await postRaw('/v1/reference-episodes', JSON.stringify([{ scenarioId: 'com-1', mode: 'mock' }]))
    expect(resp.status).toBe(400)
    expect(((await resp.json()) as { code: string }).code).toBe('bad_request')
  })

  it('rejects malformed JSON', async () => {
    const resp = await postRaw('/v1/reference-episodes', '{ scenarioId: com-1 ')
    expect(resp.status).toBe(400)
    expect(((await resp.json()) as { code: string }).code).toBe('bad_request')
  })
})
