import { describe, expect, it, vi } from 'vitest'
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
  minimax: {},
  episodeSecret: 'app-test-secret',
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

describe('createApp /v1/warehouse symbolic env', () => {
  it('resets a warehouse task without leaking the oracle label', async () => {
    const resp = await post('/v1/warehouse/episodes', { taskId: 'wh-l1-01', agentId: 'hud-fallback' })
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as {
      ok: boolean
      episodeId: string
      allowedActions: string[]
      observation: Record<string, unknown>
    }
    expect(body.ok).toBe(true)
    expect(body.episodeId.length).toBeGreaterThan(0)
    expect(body.allowedActions).toContain('move:north')
    expect(body.allowedActions).toContain('finish')
    expect(body.observation).not.toHaveProperty('oracle')
    expect(body.observation).not.toHaveProperty('label')
  })

  it('warehouse step accepts exactly { action } and returns signed next state', async () => {
    const reset = (await (
      await post('/v1/warehouse/episodes', { taskId: 'wh-l1-01', agentId: 'hud-fallback' })
    ).json()) as { episodeId: string }

    const spoof = await post(`/v1/warehouse/episodes/${reset.episodeId}/step`, {
      action: 'observe',
      reward: 1,
    })
    expect(spoof.status).toBe(400)
    expect(((await spoof.json()) as { code: string }).code).toBe('bad_request')

    const ok = await post(`/v1/warehouse/episodes/${reset.episodeId}/step`, { action: 'observe' })
    expect(ok.status).toBe(200)
    const body = (await ok.json()) as {
      ok: boolean
      done: boolean
      episodeId: string
      trace: string[]
      reward: number
    }
    expect(body.ok).toBe(true)
    expect(body.done).toBe(false)
    expect(body.episodeId).not.toBe(reset.episodeId)
    expect(body.trace).toEqual(['observe'])
    expect(body.reward).toBe(0)
  })

  it('warehouse reset rejects unknown tasks and malformed bodies', async () => {
    const unknown = await post('/v1/warehouse/episodes', { taskId: 'missing' })
    expect(unknown.status).toBe(400)

    const array = await postRaw('/v1/warehouse/episodes', JSON.stringify([{ taskId: 'wh-l1-01' }]))
    expect(array.status).toBe(400)

    const malformed = await postRaw('/v1/warehouse/episodes', '{ taskId: wh-l1-01 ')
    expect(malformed.status).toBe(400)
  })
})

describe('createApp /v1/warehouse embodiment + reference (Stage A)', () => {
  type ResetBody = { ok: boolean; episodeId: string; observation: { batteryRemaining: number } }

  it('reset accepts a valid embodiment/domain and applies reduced battery server-side', async () => {
    const human = (await (
      await post('/v1/warehouse/episodes', { taskId: 'wh-l1-01', embodiment: 'humanoid' })
    ).json()) as ResetBody
    const arm = (await (
      await post('/v1/warehouse/episodes', { taskId: 'wh-l1-01', embodiment: 'arm', domain: 'hospital' })
    ).json()) as ResetBody
    expect(human.ok).toBe(true)
    expect(arm.ok).toBe(true)
    expect(arm.observation.batteryRemaining).toBeLessThan(human.observation.batteryRemaining)
  })

  it('reset rejects an invalid embodiment or domain', async () => {
    const badEmb = await post('/v1/warehouse/episodes', { taskId: 'wh-l1-01', embodiment: 'spider' })
    expect(badEmb.status).toBe(400)
    const badDom = await post('/v1/warehouse/episodes', { taskId: 'wh-l1-01', domain: 'mars' })
    expect(badDom.status).toBe(400)
  })

  it('step trusts only the signed token — embodiment in the step body is rejected', async () => {
    const reset = (await (
      await post('/v1/warehouse/episodes', { taskId: 'wh-l1-01', embodiment: 'arm' })
    ).json()) as ResetBody
    const spoof = await post(`/v1/warehouse/episodes/${reset.episodeId}/step`, {
      action: 'observe',
      embodiment: 'humanoid',
    })
    expect(spoof.status).toBe(400)
  })

  it('reference-episodes runs the oracle and returns terminal evidence', async () => {
    const resp = await post('/v1/warehouse/reference-episodes', {
      taskId: 'wh-l1-01',
      domain: 'manufacturing',
      embodiment: 'humanoid',
      planId: 'plan_demo',
      approvedFactsHash: 'facts_demo',
      inputManifestSummary: '1 workflow video',
      frozenWorkflowSummary: 'move tote safely',
    })
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as {
      ok: boolean
      agentId: string
      reward: number
      info: { expected: string; passed: boolean }
    }
    expect(body.ok).toBe(true)
    expect(body.agentId).toBe('warehouse-oracle-reference')
    expect(body.info.expected).toBe('finish')
    expect(body.info.passed).toBe(true)
    expect(body.reward).toBe(1)
  })

  it('reference-episodes rejects unknown task, invalid embodiment, and extra fields', async () => {
    expect((await post('/v1/warehouse/reference-episodes', { taskId: 'nope' })).status).toBe(400)
    expect(
      (await post('/v1/warehouse/reference-episodes', { taskId: 'wh-l1-01', embodiment: 'spider' })).status,
    ).toBe(400)
    expect(
      (await post('/v1/warehouse/reference-episodes', { taskId: 'wh-l1-01', bogus: 1 })).status,
    ).toBe(400)
    expect(
      (await post('/v1/warehouse/reference-episodes', { taskId: 'wh-l1-01', runId: 'client-chosen' })).status,
    ).toBe(400)
  })
})

describe('createApp /api/voice/structure (voice intake trust boundary)', () => {
  it('no key configured -> 503 no_key and never leaks config', async () => {
    const resp = await post('/api/voice/structure', { transcript: 'a robot for my dad’s factory' })
    expect(resp.status).toBe(503)
    const body = (await resp.json()) as { ok: boolean; code: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe('no_key')
    expect(JSON.stringify(body)).not.toMatch(/apiKey/i)
  })

  it('blank transcript -> 400', async () => {
    const resp = await post('/api/voice/structure', { transcript: ' ' })
    expect(resp.status).toBe(400)
  })

  it('with a configured key, the response never echoes the key/config (mocked fetch)', async () => {
    const SENTINEL = 'SENTINEL-MINIMAX-KEY-do-not-leak'
    const mmBody = {
      choices: [
        {
          message: {
            content:
              '{"outcome":"move totes safely","description":"carry to packing","safetyRules":["never enter operator-only cells"],"domain":"manufacturing","embodiment":"humanoid"}',
          },
        },
      ],
      base_resp: { status_code: 0 },
    }
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => mmBody })))
    try {
      const keyedApp = createApp({
        ...config,
        minimax: { apiKey: SENTINEL, baseUrl: 'https://example.test/v1', model: 'test-model' },
      })
      const resp = await keyedApp.request('/api/voice/structure', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transcript: 'um carry totes over to packing please' }),
      })
      expect(resp.status).toBe(200)
      const body = (await resp.json()) as { ok: boolean; fields: { outcome: string } }
      expect(body.ok).toBe(true)
      expect(body.fields.outcome).toBe('move totes safely')
      const text = JSON.stringify(body)
      expect(text).not.toContain(SENTINEL)
      expect(text).not.toMatch(/apiKey/i)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
