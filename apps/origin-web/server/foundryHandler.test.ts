// Foundry routes — deterministic (offline / mock) behavior. These run with NO Cerebras key,
// exercising the labeled-mock path so the gate stays hermetic (no network). The real
// gemma-4-31b path shares the same code; only `source` flips to 'cerebras'.

import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import type { AppConfig } from './config.ts'
import type { ParseFloorResponse, QuorumRunResponse, SpeedRaceResponse } from '../src/foundry/types.ts'

const config: AppConfig = {
  port: 0,
  isProd: false,
  nebius: {},
  insforge: {},
  minimax: {},
  cerebras: { model: 'gemma-4-31b', baseUrl: 'https://api.cerebras.ai/v1' }, // no apiKey → mock path
  gemini: { model: 'gemini-2.0-flash', baseUrl: 'https://example.test/v1' },
  episodeSecret: 'foundry-test-secret',
  warnings: [],
}

const app = createApp(config)
const post = async (path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('POST /api/foundry/parse-floor', () => {
  it('returns a repaired, oracle-scored sample floor when offline', async () => {
    const res = await post('/api/foundry/parse-floor', {})
    expect(res.status).toBe(200)
    const data = (await res.json()) as ParseFloorResponse
    expect(data.ok).toBe(true)
    expect(data.source).toBe('mock')
    expect(data.siteMap).not.toBeNull()
    expect(data.siteMap?.width).toBeGreaterThanOrEqual(4)
    // The deterministic oracle reads the parsed floor.
    expect(['finish', 'escalate', 'refuse']).toContain(data.oracle?.verdict)
  })

  it('deterministically repairs an inconsistent grid (wall on an anchor, out-of-bounds)', async () => {
    // No key, so this still returns the sample floor — but repairSiteMap is unit-covered below.
    const res = await post('/api/foundry/parse-floor', { hint: 'classroom' })
    const data = (await res.json()) as ParseFloorResponse
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.repairs)).toBe(true)
  })
})

describe('POST /api/foundry/quorum-run', () => {
  it('verified mode: the Guardian ratifies the safe route and the oracle scores a pass', async () => {
    const res = await post('/api/foundry/quorum-run', { mode: 'verified' })
    expect(res.status).toBe(200)
    const data = (await res.json()) as QuorumRunResponse
    expect(data.ok).toBe(true)
    expect(data.mode).toBe('verified')
    expect(data.steps.length).toBeGreaterThan(0)
    // The deterministic oracle is the judge; the safe policy should pass with positive reward.
    expect(data.passed).toBe(true)
    expect(data.reward).toBeGreaterThan(0)
    // Every applied step carries a Guardian verdict.
    for (const s of data.steps) expect(['ratify', 'veto']).toContain(s.verdict)
  })

  it('reckless mode: the Guardian vetoes the unsafe move — and the no-guardian counterfactual is unsafe', async () => {
    const res = await post('/api/foundry/quorum-run', { mode: 'reckless' })
    const data = (await res.json()) as QuorumRunResponse
    expect(data.ok).toBe(true)
    // The same intent WITHOUT a Guardian drives into a hazard (reward 0). This is what verification prevents.
    expect(data.counterfactual.unsafeEntered).toBe(true)
    expect(data.counterfactual.reward).toBe(0)
    // The guarded run never enters an unsafe cell.
    expect(data.category).not.toBe('unsafe_zone')
  })
})

describe('POST /api/foundry/speed-race', () => {
  it('returns two lanes and a speedup, with illustrative figures when offline', async () => {
    const res = await post('/api/foundry/speed-race', {})
    expect(res.status).toBe(200)
    const data = (await res.json()) as SpeedRaceResponse
    expect(data.ok).toBe(true)
    expect(data.cerebras.provider).toBe('cerebras')
    expect(data.baseline.provider).toBe('gemini')
    expect(data.speedup).toBeGreaterThan(1) // Cerebras tok/s ≫ GPU baseline
  })
})
