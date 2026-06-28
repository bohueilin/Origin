import { afterEach, describe, expect, it, vi } from 'vitest'
import { computeAuditDigest, handleRunEpisode, parseEvidenceRow } from './runEpisodeHandler.ts'
import {
  ENVIRONMENT_NAME,
  LICENSE_POLICY_VERSION,
  REWARD_MODEL_VERSION,
  ROW_SCHEMA_VERSION,
  SCENARIO_REGISTRY_VERSION,
  VERIFIER_VERSION,
  getEvalVersions,
} from './evalVersions.ts'
import { toModelView } from '../src/agent.ts'
import { SCENARIO_VERSION, seedScenarios } from '../src/seedScenarios.ts'

// A minimal but valid, current-schema, server-authoritative evidence row. The
// gym /v1 path persists rows with `external` provenance; the unified evidence
// schema must accept them while still rejecting unknown provenance values.
const baseRow: Record<string, unknown> = {
  trace_authority: 'server_authoritative_episode',
  id: 'rec_x',
  trace_id: 'srv-mock-1-com-1',
  run_id: 'run_x',
  episode_index: 1,
  run_sequence: 1,
  scenario_id: 'com-1',
  scenario_title: 'Refund within policy',
  requested_policy_mode: 'mock',
  actual_policy_source: 'mock',
  fallback: false,
  fallback_code: null,
  model_name: null,
  action: 'act',
  rationale: 'looks routine',
  requested_info: '',
  confidence: 0.9,
  passed: true,
  reward: 1,
  category: 'correct',
  catastrophic: false,
  expected_action: 'act',
  actual_action: 'act',
  verifier_reason: null,
  verifier_checks: [],
  license_level: 'L4',
  created_at: '2026-06-20T00:00:00.000Z',
  verifier_version: VERIFIER_VERSION,
  reward_model_version: REWARD_MODEL_VERSION,
  license_policy_version: LICENSE_POLICY_VERSION,
  row_schema_version: '1.0.0',
}

const digested = (row: Record<string, unknown>) => ({
  ...row,
  audit_row_digest: computeAuditDigest(row),
})

describe('parseEvidenceRow — unified evidence schema', () => {
  it('accepts a digest-valid gym row with external provenance', () => {
    const externalRow = {
      ...baseRow,
      trace_id: 'gym-ep_2026-06-20-com-1-1',
      requested_policy_mode: 'external',
      actual_policy_source: 'external',
      model_name: 'external-agent/reference-v1',
    }
    const item = parseEvidenceRow(digested(externalRow))
    expect(item).not.toBeNull()
    expect(item?.requestedPolicyMode).toBe('external')
    expect(item?.actualPolicySource).toBe('external')
    expect(item?.digestStatus).toBe('valid')
    expect(item?.versionMismatch).toBe(false)
  })

  it('still accepts legacy mock/nebius provenance', () => {
    expect(parseEvidenceRow(digested(baseRow))?.actualPolicySource).toBe('mock')
    expect(
      parseEvidenceRow(digested({ ...baseRow, requested_policy_mode: 'nebius' }))
        ?.requestedPolicyMode,
    ).toBe('nebius')
  })

  it('rejects unknown provenance values', () => {
    expect(parseEvidenceRow({ ...baseRow, requested_policy_mode: 'wat' })).toBeNull()
    expect(parseEvidenceRow({ ...baseRow, actual_policy_source: 'rogue' })).toBeNull()
  })

  it('accepts a real gym-produced external row (full stepEpisode field shape)', () => {
    // Build a row with the exact field set stepEpisode persists for a gym /v1
    // episode — not the legacy row with provenance flipped, but the real shape
    // (scenario_snapshot, actual_policy_input, external provenance, model_name).
    const scenario = seedScenarios.find((s) => s.id === 'com-1')!
    const view = toModelView(scenario)
    const versions = getEvalVersions()
    const gymRow: Record<string, unknown> = {
      trace_id: 'gym-run_abc-com-1-nonce123',
      run_id: 'run_abc',
      episode_index: 1,
      run_sequence: 1,
      trace_authority: 'server_authoritative_episode',
      environment_name: ENVIRONMENT_NAME,
      scenario_registry_version: SCENARIO_REGISTRY_VERSION,
      verifier_version: VERIFIER_VERSION,
      reward_model_version: REWARD_MODEL_VERSION,
      license_policy_version: LICENSE_POLICY_VERSION,
      app_commit: versions.appCommit,
      row_schema_version: ROW_SCHEMA_VERSION,
      scenario_id: scenario.id,
      scenario_version: SCENARIO_VERSION,
      scenario_title: scenario.title,
      domain: scenario.domain,
      scenario_snapshot: scenario,
      requested_policy_mode: 'external',
      actual_policy_source: 'external',
      fallback: false,
      fallback_code: null,
      attempted_model_input: null,
      actual_policy_input: view,
      model_name: 'external-agent/trainer-7',
      action: 'act',
      rationale: 'visible signals are within policy',
      requested_info: '',
      confidence: 0.8,
      passed: true,
      reward: 1,
      category: 'correct',
      catastrophic: false,
      expected_action: 'act',
      actual_action: 'act',
      verifier_reason: null,
      verifier_checks: [],
      license_level: 'L4',
      license_summary: {
        level: 'L4',
        name: 'Autonomous',
        passRate: 1,
        avgReward: 1,
        catastrophicCount: 0,
        episodes: 1,
      },
      created_at: '2026-06-20T00:00:00.000Z',
    }

    const item = parseEvidenceRow(digested(gymRow))
    expect(item).not.toBeNull()
    // digest-valid (tamper-evident) ...
    expect(item?.digestStatus).toBe('valid')
    expect(item?.digestPresent).toBe(true)
    // ... version-compatible (so: trusted evidence AND license-eligible) ...
    expect(item?.versionMismatch).toBe(false)
    // ... carrying the real external provenance.
    expect(item?.requestedPolicyMode).toBe('external')
    expect(item?.actualPolicySource).toBe('external')
    expect(item?.reward).toBe(1)
    expect(item?.passed).toBe(true)
  })
})

describe('handleRunEpisode — configured InsForge fail-closed', () => {
  // A configured InsForge config so handleRunEpisode takes the persistence path
  // (insforgeConfigured requires both baseUrl and apiKey).
  const cfgWithInsforge = {
    nebius: {},
    insforge: { baseUrl: 'https://insforge.test', apiKey: 'ins_test_key' },
  }
  const cfgLocalOnly = { nebius: {}, insforge: {} }

  // The fields that grant authority — none may leak on a fail-closed response.
  const AUTHORITY_FIELDS = ['trace', 'license', 'persistence', 'runId', 'auditRow']

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fails closed when the configured InsForge insert returns HTTP 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('upstream error', { status: 500, statusText: 'Internal Server Error' }),
    )

    const res = await handleRunEpisode({ scenarioId: 'com-1', policyMode: 'mock' }, cfgWithInsforge)

    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected fail-closed result')
    expect(res.code).toBe('unknown')
    for (const k of AUTHORITY_FIELDS) {
      expect(res).not.toHaveProperty(k)
    }
  })

  it('fails closed when the configured InsForge insert throws/rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))

    const res = await handleRunEpisode({ scenarioId: 'com-1', policyMode: 'mock' }, cfgWithInsforge)

    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected fail-closed result')
    expect(res.code).toBe('unknown')
    for (const k of AUTHORITY_FIELDS) {
      expect(res).not.toHaveProperty(k)
    }
  })

  it('still returns the demo response when InsForge is unconfigured', async () => {
    const res = await handleRunEpisode({ scenarioId: 'com-1', policyMode: 'mock' }, cfgLocalOnly)

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('expected ok demo result')
    expect(res.trace).toBeTruthy()
    expect(res.license).toBeTruthy()
    expect(res.persistence.status).toBe('local_only')
    expect(typeof res.runId).toBe('string')
  })
})
