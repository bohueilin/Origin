import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  gymLicenseToState,
  observationToMockView,
  resetGymEpisode,
  runReferenceGymEpisode,
  stepGymEpisode,
} from './gymClient'
import { LICENSE_LEVELS } from './license'
import type { GymObservation, GymRunLicense } from './types'

// A minimal fetch Response stand-in — only `.json()` is exercised by the client.
function jsonResponse(body: unknown): Response {
  return { json: async () => body } as Response
}

const RESET_OK = {
  ok: true,
  episodeId: 'ep-token',
  runId: 'run_1',
  agentId: 'external-agent',
  observation: {
    scenarioId: 'com-1',
    domain: 'commerce',
    title: 'T',
    situation: 'S',
    visibleSignals: [],
  },
  allowedActions: ['act', 'ask', 'escalate', 'stop'],
  verifierRules: 'rules',
}

const STEP_OK = {
  ok: true,
  episodeId: 'ep-token',
  runId: 'run_1',
  agentId: 'external-agent',
  reward: 1,
  done: true,
  info: {
    passed: true,
    category: 'correct',
    catastrophic: false,
    expectedAction: 'ask',
    actualAction: 'ask',
    reason: null,
  },
  license: { level: 'L1', name: 'Ask', passRate: 1, avgReward: 1, catastrophicCount: 0, episodes: 1 },
  persisted: false,
  recordId: null,
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('gymClient', () => {
  it('reset posts to /v1/episodes with only { scenarioId, agentId }', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(RESET_OK))
    vi.stubGlobal('fetch', fetchMock)

    // External gym clients pass a non-reserved agentId (reserved reference ids are
    // rejected by the server — see server/app.test.ts).
    await resetGymEpisode('com-1', 'external-agent')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/v1/episodes')
    expect(JSON.parse(String(init.body))).toEqual({ scenarioId: 'com-1', agentId: 'external-agent' })
  })

  it('runReferenceGymEpisode posts to /v1/reference-episodes with only { scenarioId, mode }', async () => {
    const REF_OK = {
      ok: true,
      step: STEP_OK,
      decision: { action: 'ask', confidence: 0.5, rationale: 'r', source: 'mock' },
      provenance: {
        requestedPolicyMode: 'nebius',
        actualPolicySource: 'mock',
        fallback: true,
        fallbackCode: 'nebius_unavailable',
      },
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(REF_OK))
    vi.stubGlobal('fetch', fetchMock)

    const result = await runReferenceGymEpisode('com-1', 'nebius')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/v1/reference-episodes')
    const body = JSON.parse(String(init.body))
    expect(body).toEqual({ scenarioId: 'com-1', mode: 'nebius' })
    expect(Object.keys(body)).toEqual(['scenarioId', 'mode'])
    // The helper surfaces the env-scored step + decision + provenance verbatim.
    expect(result.provenance.fallback).toBe(true)
    expect(result.provenance.actualPolicySource).toBe('mock')
    expect(result.step.license.episodes).toBe(1)
  })

  it('runReferenceGymEpisode throws when the env returns ok:false', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: 'down' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(runReferenceGymEpisode('com-1', 'mock')).rejects.toThrow('down')
  })

  it('step posts to /v1/episodes/:id/step with ONLY { action }', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(STEP_OK))
    vi.stubGlobal('fetch', fetchMock)

    await stepGymEpisode('ep-token', 'ask')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/v1/episodes/ep-token/step')
    const body = JSON.parse(String(init.body))
    // The body must be exactly { action } — no confidence/rationale/reward/etc.
    expect(body).toEqual({ action: 'ask' })
    expect(Object.keys(body)).toEqual(['action'])
  })

  it('throws when the env returns ok:false', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: 'nope' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(stepGymEpisode('ep-token', 'ask')).rejects.toThrow('nope')
  })

  it('observationToMockView builds the mock view only from gym observation fields', () => {
    const obs: GymObservation = {
      scenarioId: 'com-2',
      domain: 'commerce',
      title: 'Title',
      situation: 'Situation',
      visibleSignals: [{ label: 'sig', value: 'v' }],
      visibleRiskScore: 0.72,
    }
    const view = observationToMockView(obs)
    expect(view).toEqual({
      id: 'com-2',
      domain: 'commerce',
      title: 'Title',
      situation: 'Situation',
      visibleSignals: [{ label: 'sig', value: 'v' }],
      visibleRiskScore: 0.72,
    })
    // The mock view carries the mock-only risk score but never a hidden answer.
    expect(view.visibleRiskScore).toBe(0.72)
    expect(view).not.toHaveProperty('correctAction')
    expect(view).not.toHaveProperty('hiddenRisk')
  })

  it('gymLicenseToState maps the /v1 license level and stats into LicenseState', () => {
    const license: GymRunLicense = {
      level: 'L1',
      name: 'Ask',
      passRate: 0.5,
      avgReward: -0.25,
      catastrophicCount: 1,
      episodes: 4,
    }
    const state = gymLicenseToState(license)
    expect(state.level).toBe(LICENSE_LEVELS.L1)
    expect(state.episodes).toBe(4)
    expect(state.passes).toBe(2) // round(0.5 * 4)
    expect(state.passRate).toBe(0.5)
    expect(state.avgReward).toBe(-0.25)
    expect(state.totalReward).toBe(-1) // avgReward * episodes
    expect(state.catastrophicCount).toBe(1)
    expect(state.reason).toContain('L1')
  })

  it('gymLicenseToState falls back to L0 for an unknown level id', () => {
    const license: GymRunLicense = {
      level: 'L9',
      name: 'Bogus',
      passRate: 0,
      avgReward: 0,
      catastrophicCount: 0,
      episodes: 0,
    }
    expect(gymLicenseToState(license).level).toBe(LICENSE_LEVELS.L0)
  })
})
