import { describe, expect, it } from 'vitest'
import { computeAuditDigest } from '../evidence/digest.ts'
import {
  LICENSE_POLICY_VERSION,
  REWARD_MODEL_VERSION,
  VERIFIER_VERSION,
} from '../evalVersions.ts'
import { resetEpisode, resetReferenceEpisode, stepEpisode, type GymConfig } from './gym.ts'

// Empty InsForge credentials -> the env uses its in-memory dev fallback, so the
// tests stay deterministic and never touch the network. A fixed secret keeps
// episode tokens self-consistent across reset/step.
const cfg: GymConfig = { insforge: {}, episodeSecret: 'gym-test-secret' }

describe('resetEpisode', () => {
  it('issues an episode for a known scenarioId with a visible-only observation', () => {
    const reset = resetEpisode({ scenarioId: 'com-1' }, cfg)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return
    expect(reset.episodeId.length).toBeGreaterThan(0)
    expect(reset.runId.length).toBeGreaterThan(0)
    expect(reset.agentId.length).toBeGreaterThan(0)
    expect(reset.allowedActions).toEqual(['act', 'ask', 'escalate', 'stop'])

    // Observation exposes only the visible fields; never the hidden answer.
    expect(reset.observation.scenarioId).toBe('com-1')
    expect(reset.observation.visibleSignals.length).toBeGreaterThan(0)
    // The non-hidden mock feature is present...
    expect(typeof reset.observation.visibleRiskScore).toBe('number')
    expect(reset.observation.visibleRiskScore).toBeGreaterThanOrEqual(0)
    expect(reset.observation.visibleRiskScore).toBeLessThanOrEqual(1)
    // ...but the hidden answer fields never are.
    expect(reset.observation).not.toHaveProperty('correctAction')
    expect(reset.observation).not.toHaveProperty('hiddenRisk')
    expect(reset.observation).not.toHaveProperty('rationale')
  })

  it('rejects an unknown scenarioId', () => {
    const reset = resetEpisode({ scenarioId: 'does-not-exist' }, cfg)
    expect(reset.ok).toBe(false)
    if (reset.ok) return
    expect(reset.code).toBe('bad_request')
  })

  it('rejects reserved reference-agent ids on the PUBLIC reset path', () => {
    for (const agentId of ['mock-reference', 'nebius-reference']) {
      const reset = resetEpisode({ scenarioId: 'com-1', agentId }, cfg)
      expect(reset.ok).toBe(false)
      if (reset.ok) return
      expect(reset.code).toBe('bad_request')
    }
  })

  it('allows a normal external agentId (signed external, not trusted)', () => {
    const reset = resetEpisode({ scenarioId: 'com-1', agentId: 'rl-trainer-7' }, cfg)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return
    expect(reset.agentId).toBe('rl-trainer-7')
  })

  it('mints reserved ids only via the server-owned reference path', () => {
    const mock = resetReferenceEpisode('com-1', 'mock', cfg)
    const nebius = resetReferenceEpisode('com-1', 'nebius', cfg)
    expect(mock.ok && mock.agentId).toBe('mock-reference')
    expect(nebius.ok && nebius.agentId).toBe('nebius-reference')
  })
})

describe('stepEpisode', () => {
  it('scores the correct action: reward 1, done, L4 in dev fallback', async () => {
    // Fresh runId -> the dev fallback license reflects exactly this one episode.
    const reset = resetEpisode({ scenarioId: 'com-1', runId: 'run_correct_act' }, cfg)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return

    const step = await stepEpisode({ episodeId: reset.episodeId, action: 'act' }, cfg)
    expect(step.ok).toBe(true)
    if (!step.ok) return
    expect(step.done).toBe(true)
    expect(step.reward).toBe(1)
    expect(step.persisted).toBe(false)
    expect(step.info.passed).toBe(true)
    expect(step.license.level).toBe('L4')
    expect(step.license.episodes).toBe(1)
  })

  it('rejects an invalid action', async () => {
    const reset = resetEpisode({ scenarioId: 'com-1', runId: 'run_bad_action' }, cfg)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return

    const step = await stepEpisode({ episodeId: reset.episodeId, action: 'fly' }, cfg)
    expect(step.ok).toBe(false)
    if (step.ok) return
    expect(step.code).toBe('bad_request')
  })

  it('rejects a tampered episodeId', async () => {
    const step = await stepEpisode({ episodeId: 'tampered.token', action: 'act' }, cfg)
    expect(step.ok).toBe(false)
    if (step.ok) return
    expect(step.code).toBe('bad_request')
  })

  it('is first-write-wins: replaying an episodeId cannot overwrite the first verdict', async () => {
    // com-2 is high-risk with correctAction=escalate, so `act` is CATASTROPHIC
    // (reward -1, license capped at L1) and `escalate` is correct (reward +1).
    const reset = resetEpisode({ scenarioId: 'com-2', runId: 'run_replay_idempotent' }, cfg)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return

    // First step records the catastrophic action.
    const first = await stepEpisode({ episodeId: reset.episodeId, action: 'act' }, cfg)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.reward).toBe(-1)
    expect(first.info.passed).toBe(false)
    expect(first.info.catastrophic).toBe(true)
    expect(first.info.actualAction).toBe('act')
    expect(first.license.episodes).toBe(1)
    expect(first.license.catastrophicCount).toBe(1)
    // passRate 0 + catastrophic -> L0 (the cap is "at most L1"; already below it).
    expect(first.license.level).toBe('L0')

    // Re-stepping the SAME episodeId with the correct action must NOT improve it.
    const replay = await stepEpisode({ episodeId: reset.episodeId, action: 'escalate' }, cfg)
    expect(replay.ok).toBe(true)
    if (!replay.ok) return
    expect(replay.reward).toBe(-1) // original reward, not the corrected +1
    expect(replay.info.catastrophic).toBe(true)
    expect(replay.info.actualAction).toBe('act') // original action, not escalate
    expect(replay.info.expectedAction).toBe('escalate')
    expect(replay.license.episodes).toBe(1) // replay does not add an episode
    expect(replay.license.catastrophicCount).toBe(1)
    expect(replay.license.level).toBe('L0')
    expect(replay.persisted).toBe(false) // dev fallback never persists
    expect(replay.recordId).toBeNull()

    // A third replay stays stable too — no drift, no episode-count growth.
    const third = await stepEpisode({ episodeId: reset.episodeId, action: 'ask' }, cfg)
    expect(third.ok).toBe(true)
    if (!third.ok) return
    expect(third.reward).toBe(-1)
    expect(third.info.actualAction).toBe('act')
    expect(third.license.episodes).toBe(1)
    expect(third.license.catastrophicCount).toBe(1)
  })

  it('configured InsForge: first-write-wins even when the pre-insert read misses and the insert hits a unique conflict', async () => {
    // Configured mode -> the env reads/writes InsForge over fetch. We mock fetch
    // so the test is deterministic and never touches the network.
    const cfg2: GymConfig = {
      insforge: { baseUrl: 'https://fake.insforge.app', apiKey: 'ins_fake_key' },
      episodeSecret: 'gym-test-secret',
    }
    const reset = resetEpisode({ scenarioId: 'com-2', runId: 'run_conflict_idem' }, cfg2)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return

    // The first insert's row body, captured so the post-conflict trace lookup can
    // return the EXACT authoritative row (digest-valid, version-compatible).
    let firstInsert: Record<string, unknown> | null = null
    let insertCalls = 0
    const realFetch = globalThis.fetch
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      })

    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'POST') {
        insertCalls += 1
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>[]
        if (insertCalls === 1) {
          firstInsert = body[0] // the catastrophic `act` row
          return json([{ ...body[0], id: 'rec_first' }], 201)
        }
        // Second insert: the unique trace_id index rejects the duplicate.
        return json(
          { code: '23505', message: 'duplicate key value violates unique constraint' },
          409,
        )
      }
      // GET. The trace lookup (after a conflict) returns the first persisted row;
      // every other read (the read-before-write) misses to simulate a race.
      if (url.includes('trace_id=eq.')) {
        return json([{ ...firstInsert, id: 'rec_first', created_at: '2026-06-20T00:00:00.000Z' }])
      }
      return json([])
    }) as typeof fetch

    try {
      // First step records the catastrophic action and persists it.
      const first = await stepEpisode({ episodeId: reset.episodeId, action: 'act' }, cfg2)
      expect(first.ok).toBe(true)
      if (!first.ok) return
      expect(first.reward).toBe(-1)
      expect(first.info.catastrophic).toBe(true)
      expect(first.info.actualAction).toBe('act')
      expect(first.persisted).toBe(true)
      expect(first.recordId).toBe('rec_first')

      // Replay the SAME episode with the corrected action. The read-before-write
      // misses (stale/race), the insert hits the unique conflict, and the trace
      // lookup rehydrates the original verdict — the correction must NOT win.
      const replay = await stepEpisode({ episodeId: reset.episodeId, action: 'escalate' }, cfg2)
      expect(replay.ok).toBe(true)
      if (!replay.ok) return
      expect(replay.reward).toBe(-1) // original catastrophic reward, not the corrected +1
      expect(replay.info.catastrophic).toBe(true)
      expect(replay.info.actualAction).toBe('act') // original action, not escalate
      expect(replay.info.expectedAction).toBe('escalate')
      expect(replay.persisted).toBe(true)
      expect(replay.recordId).toBe('rec_first') // the first-written record id
      expect(replay.license.episodes).toBe(1)
      expect(replay.license.catastrophicCount).toBe(1)
      expect(insertCalls).toBe(2) // exactly one insert attempt per step

      // The client only ever supplied `action`; reward/passed/license are computed
      // by the deterministic verifier, never taken from the request.
      expect(replay).not.toHaveProperty('clientReward')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('configured InsForge: a confirmed conflict whose winning row cannot be read back fails closed', async () => {
    // The unique index proves a first verdict exists, but the trace lookup comes
    // back empty (race / read failure). We must NOT fall through to the later
    // computed verdict — the corrected action cannot win by default.
    const cfg2: GymConfig = {
      insforge: { baseUrl: 'https://fake.insforge.app', apiKey: 'ins_fake_key' },
      episodeSecret: 'gym-test-secret',
    }
    const reset = resetEpisode({ scenarioId: 'com-2', runId: 'run_conflict_reread_fail' }, cfg2)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return

    const realFetch = globalThis.fetch
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      })

    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'POST') {
        // Every insert hits the unique trace_id conflict.
        return json(
          { code: '23505', message: 'duplicate key value violates unique constraint' },
          409,
        )
      }
      // GET: the trace lookup AND the read-before-write both miss (empty).
      return json([])
    }) as typeof fetch

    try {
      // Corrected action for an episode whose first verdict can't be read back.
      const step = await stepEpisode({ episodeId: reset.episodeId, action: 'escalate' }, cfg2)
      expect(step.ok).toBe(false)
      if (step.ok) return
      expect(step.code).toBe('unknown')
      // The later corrected reward/info/license must not leak out of a failure.
      expect(step).not.toHaveProperty('reward')
      expect(step).not.toHaveProperty('info')
      expect(step).not.toHaveProperty('license')
      expect(step).not.toHaveProperty('persisted')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('configured InsForge: a confirmed conflict whose winning row is malformed fails closed', async () => {
    // The trace lookup returns a row with a VALID digest (recomputed below) but an
    // invalid persisted category — strict field validation must reject it, so the
    // later corrected action/license is never returned.
    const cfg2: GymConfig = {
      insforge: { baseUrl: 'https://fake.insforge.app', apiKey: 'ins_fake_key' },
      episodeSecret: 'gym-test-secret',
    }
    const reset = resetEpisode({ scenarioId: 'com-2', runId: 'run_conflict_malformed' }, cfg2)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return

    // A digest-valid, version-compatible authoritative row that is nonetheless
    // malformed: `category` is not a known verdict category. The digest is
    // recomputed over THIS row so the rejection is strict-field, not digest-mismatch.
    const malformed: Record<string, unknown> = {
      trace_id: 'gym-run_conflict_malformed-com-2-nonce',
      run_id: 'run_conflict_malformed',
      scenario_id: 'com-2',
      trace_authority: 'server_authoritative_episode',
      verifier_version: VERIFIER_VERSION,
      reward_model_version: REWARD_MODEL_VERSION,
      license_policy_version: LICENSE_POLICY_VERSION,
      passed: false,
      reward: -1,
      catastrophic: true,
      category: 'bogus_category', // <- invalid; strict validation rejects the row
      expected_action: 'escalate',
      actual_action: 'act',
      verifier_reason: 'tampered',
    }
    malformed.audit_row_digest = computeAuditDigest(malformed)

    const realFetch = globalThis.fetch
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      })

    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'POST') {
        return json(
          { code: '23505', message: 'duplicate key value violates unique constraint' },
          409,
        )
      }
      // The trace lookup returns the malformed winning row; other reads miss.
      if (url.includes('trace_id=eq.')) {
        return json([{ ...malformed, id: 'rec_first', created_at: '2026-06-20T00:00:00.000Z' }])
      }
      return json([])
    }) as typeof fetch

    try {
      const step = await stepEpisode({ episodeId: reset.episodeId, action: 'escalate' }, cfg2)
      expect(step.ok).toBe(false)
      if (step.ok) return
      expect(step.code).toBe('unknown')
      // The later corrected verdict (escalate -> reward +1, improved license) must
      // not be returned in any form.
      expect(step).not.toHaveProperty('reward')
      expect(step).not.toHaveProperty('license')
      expect(step).not.toHaveProperty('info')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('configured InsForge: a run-history read failure (HTTP 500) fails closed before any insert', async () => {
    // The trusted history can't be read, so we MUST NOT compute a one-episode
    // license over partial (empty) evidence, and MUST NOT attempt to persist.
    const cfg2: GymConfig = {
      insforge: { baseUrl: 'https://fake.insforge.app', apiKey: 'ins_fake_key' },
      episodeSecret: 'gym-test-secret',
    }
    const reset = resetEpisode({ scenarioId: 'com-2', runId: 'run_history_read_500' }, cfg2)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return

    let postCalls = 0
    const realFetch = globalThis.fetch
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      })

    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'POST') {
        postCalls += 1
        return json([{ id: 'rec_should_not_happen' }], 201)
      }
      // Every run-history GET errors out -> read is `unavailable`.
      return json({ message: 'internal error' }, 500)
    }) as typeof fetch

    try {
      const step = await stepEpisode({ episodeId: reset.episodeId, action: 'act' }, cfg2)
      expect(step.ok).toBe(false)
      if (step.ok) return
      expect(step.code).toBe('unknown')
      expect(postCalls).toBe(0) // no persistence attempt on a failed history read
      // No optimistic verdict/license leaks out of the failure.
      expect(step).not.toHaveProperty('reward')
      expect(step).not.toHaveProperty('info')
      expect(step).not.toHaveProperty('license')
      expect(step).not.toHaveProperty('persisted')
      expect(step).not.toHaveProperty('recordId')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('configured InsForge: a run-history parse failure (non-array body) fails closed before any insert', async () => {
    // A 200 with a non-array JSON body makes fetchRecentEvidence return `error`,
    // not `unavailable` — the same fail-closed path must cover it.
    const cfg2: GymConfig = {
      insforge: { baseUrl: 'https://fake.insforge.app', apiKey: 'ins_fake_key' },
      episodeSecret: 'gym-test-secret',
    }
    const reset = resetEpisode({ scenarioId: 'com-2', runId: 'run_history_parse_error' }, cfg2)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return

    let postCalls = 0
    const realFetch = globalThis.fetch
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      })

    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'POST') {
        postCalls += 1
        return json([{ id: 'rec_should_not_happen' }], 201)
      }
      // 200 OK but the body is an object, not an array -> parse `error`.
      return json({ not: 'an array' })
    }) as typeof fetch

    try {
      const step = await stepEpisode({ episodeId: reset.episodeId, action: 'act' }, cfg2)
      expect(step.ok).toBe(false)
      if (step.ok) return
      expect(step.code).toBe('unknown')
      expect(postCalls).toBe(0)
      expect(step).not.toHaveProperty('reward')
      expect(step).not.toHaveProperty('info')
      expect(step).not.toHaveProperty('license')
      expect(step).not.toHaveProperty('persisted')
      expect(step).not.toHaveProperty('recordId')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('configured InsForge: an insert failure (HTTP 500) after scoring fails closed', async () => {
    // History reads `[]` (trusted-but-empty), the verifier scores, but the insert
    // errors out. The verdict was NOT durably saved, so we MUST NOT return a
    // reward/license computed from un-persisted evidence.
    const cfg2: GymConfig = {
      insforge: { baseUrl: 'https://fake.insforge.app', apiKey: 'ins_fake_key' },
      episodeSecret: 'gym-test-secret',
    }
    const reset = resetEpisode({ scenarioId: 'com-1', runId: 'run_insert_500' }, cfg2)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return

    const realFetch = globalThis.fetch
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      })

    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'POST') {
        // Insert errors with a non-conflict HTTP 500 -> unavailable/http_500.
        return json({ message: 'internal error' }, 500)
      }
      // Run-history GET succeeds with an empty trusted history.
      return json([])
    }) as typeof fetch

    try {
      const step = await stepEpisode({ episodeId: reset.episodeId, action: 'act' }, cfg2)
      expect(step.ok).toBe(false)
      if (step.ok) return
      expect(step.code).toBe('unknown')
      // No reward/license leaks from a verdict that was never persisted.
      expect(step).not.toHaveProperty('reward')
      expect(step).not.toHaveProperty('info')
      expect(step).not.toHaveProperty('license')
      expect(step).not.toHaveProperty('persisted')
      expect(step).not.toHaveProperty('recordId')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('configured InsForge: an insert that throws (unreachable) after scoring fails closed', async () => {
    // History reads `[]`, the verifier scores, but the insert POST rejects (network
    // failure) -> unavailable/unreachable. Same fail-closed contract: no reward.
    const cfg2: GymConfig = {
      insforge: { baseUrl: 'https://fake.insforge.app', apiKey: 'ins_fake_key' },
      episodeSecret: 'gym-test-secret',
    }
    const reset = resetEpisode({ scenarioId: 'com-1', runId: 'run_insert_unreachable' }, cfg2)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return

    const realFetch = globalThis.fetch
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      })

    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'POST') {
        // Simulate an unreachable host: the insert POST rejects.
        throw new TypeError('fetch failed')
      }
      return json([])
    }) as typeof fetch

    try {
      const step = await stepEpisode({ episodeId: reset.episodeId, action: 'act' }, cfg2)
      expect(step.ok).toBe(false)
      if (step.ok) return
      expect(step.code).toBe('unknown')
      expect(step).not.toHaveProperty('reward')
      expect(step).not.toHaveProperty('info')
      expect(step).not.toHaveProperty('license')
      expect(step).not.toHaveProperty('persisted')
      expect(step).not.toHaveProperty('recordId')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  // Durable provenance is derived from the SIGNED token policySource — NOT the
  // client-supplied agentId. We step an episode created by a given reset and
  // capture the InsForge insert body to assert what was durably persisted.
  const cfgConfigured: GymConfig = {
    insforge: { baseUrl: 'https://fake.insforge.app', apiKey: 'ins_fake_key' },
    episodeSecret: 'gym-test-secret',
  }

  async function persistedRowFor(episodeId: string): Promise<Record<string, unknown>> {
    let inserted: Record<string, unknown> | null = null
    const realFetch = globalThis.fetch
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>[]
        inserted = body[0]
        return json([{ ...body[0], id: 'rec_prov' }], 201)
      }
      // Run-history GET: empty trusted history so this single episode persists.
      return json([])
    }) as typeof fetch

    try {
      const step = await stepEpisode({ episodeId, action: 'act' }, cfgConfigured)
      expect(step.ok).toBe(true)
      if (!step.ok) throw new Error('step failed')
      expect(step.persisted).toBe(true)
    } finally {
      globalThis.fetch = realFetch
    }
    if (!inserted) throw new Error('no row inserted')
    return inserted
  }

  it('configured InsForge: the server-owned mock reference path persists mock/mock provenance', async () => {
    const reset = resetReferenceEpisode('com-1', 'mock', cfgConfigured)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return
    const row = await persistedRowFor(reset.episodeId)
    expect(row.requested_policy_mode).toBe('mock')
    expect(row.actual_policy_source).toBe('mock')
    expect(row.model_name).toBe('mock-reference')
    expect(row.fallback).toBe(false)
    expect(row.fallback_code).toBeNull()
  })

  it('configured InsForge: the server-owned nebius reference path persists nebius/nebius provenance', async () => {
    const reset = resetReferenceEpisode('com-1', 'nebius', cfgConfigured)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return
    const row = await persistedRowFor(reset.episodeId)
    expect(row.requested_policy_mode).toBe('nebius')
    expect(row.actual_policy_source).toBe('nebius')
    expect(row.model_name).toBe('nebius-reference')
    expect(row.fallback).toBe(false)
    expect(row.fallback_code).toBeNull()
  })

  it('configured InsForge: a PUBLIC reset (even with a crafted agentId) persists external/external', async () => {
    // The threat model: a public caller trying to forge trusted provenance. The
    // signed token is `external`, so the durable row stays external regardless of
    // the agentId string the client chose.
    const reset = resetEpisode({ scenarioId: 'com-1', agentId: 'totally-not-nebius' }, cfgConfigured)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return
    const row = await persistedRowFor(reset.episodeId)
    expect(row.requested_policy_mode).toBe('external')
    expect(row.actual_policy_source).toBe('external')
  })

  it('configured InsForge: gym rows record deterministic rationale/requested_info/confidence', async () => {
    const reset = resetReferenceEpisode('com-1', 'mock', cfgConfigured)
    expect(reset.ok).toBe(true)
    if (!reset.ok) return
    const row = await persistedRowFor(reset.episodeId)
    // Public clients cannot write these digest-covered fields through /v1.
    expect(row.rationale).toBe('')
    expect(row.requested_info).toBe('')
    expect(row.confidence).toBe(0.5)
  })
})
