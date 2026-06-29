// ----------------------------------------------------------------------------
// Hono app construction — the routes, with no listener side effects.
//
// `createApp(config)` builds the route table so it can be imported and exercised
// with `app.request(...)` in tests without binding a port. `server/main.ts` stays
// a thin entrypoint that loads config and serves this app.
//
// Exposes:
//   GET  /health
//   Gym (RL env, external policy):
//     POST /v1/episodes                      reset -> { episodeId, observation }
//     POST /v1/episodes/:episodeId/step      step  -> { reward, done, info, license }
//     POST /v1/step                          step  (episodeId in body)
//   Gym (server-owned reference agents):
//     POST /v1/reference-episodes            run one mock/nebius reference episode
//   Legacy (current UI + reference flows), reusing existing handlers:
//     POST /api/run-episode, GET /api/runs/recent, GET /api/evidence/status,
//     POST /api/nebius-action, POST /api/vapi/tools
// ----------------------------------------------------------------------------

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { bodyLimit } from 'hono/body-limit'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppConfig } from './config.ts'
import { resetEpisode, stepEpisode, type GymConfig } from './env/gym.ts'
import {
  resetWarehouseEpisode,
  runWarehouseReferenceEpisode,
  stepWarehouseEpisode,
  type WarehouseGymConfig,
} from './env/warehouseGym.ts'
import { PHYSICAL_DOMAINS, ROBOT_EMBODIMENTS } from '../src/environmentPlan.ts'
import { ENVIRONMENT_NAME } from './evalVersions.ts'
import type { NebiusErrorCode } from './nebiusHandler.ts'
import { handleNebiusAction } from './nebiusHandler.ts'
import { handleVoiceStructure, type VoiceResult } from './minimaxHandler.ts'
import { runReferenceEpisode } from './referenceAgent.ts'
import { getEvidenceStatus, getRecentRuns, handleRunEpisode } from './runEpisodeHandler.ts'
import { handleVapiTools } from './vapiHandler.ts'
import { handleGymRollout, handleParseFloor, handleQuorumRun, handleSpeedRace } from './foundryHandler.ts'
import { handleSocRun, handleSocRace, handleSocShootout, handleEconomics, handleEnsemble, handleLatency, handleAccuracy, handlePassportRun, handleSupervisionRun } from './socHandler.ts'
import { handleLeaderboard } from './leaderboardHandler.ts'

function nebiusStatus(code: NebiusErrorCode): ContentfulStatusCode {
  switch (code) {
    case 'bad_request':
      return 400
    case 'no_key':
      return 503
    case 'timeout':
      return 504
    default:
      return 502
  }
}

// Voice structuring degrades gracefully on the client, so a missing key (503) is
// expected, not a hard failure.
function voiceStatus(r: VoiceResult): ContentfulStatusCode {
  if (r.ok) return 200
  switch (r.code) {
    case 'bad_request':
      return 400
    case 'no_key':
      return 503
    case 'timeout':
      return 504
    default:
      return 502
  }
}

async function jsonBody(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json()
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

// Strict body parser for `/v1` routes: a malformed, non-object, or array body must
// be rejected (not silently coerced to `{}`), so a trusted episode can never be
// minted from a request the server could not actually understand.
type StrictBody =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string }

async function strictJsonObject(c: { req: { json: () => Promise<unknown> } }): Promise<StrictBody> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return { ok: false, error: 'Request body must be valid JSON.' }
  }
  if (Array.isArray(raw)) {
    return { ok: false, error: 'Request body must be a JSON object, not an array.' }
  }
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' }
  }
  return { ok: true, body: raw as Record<string, unknown> }
}

const badRequest = (
  c: { json: (v: unknown, s: ContentfulStatusCode) => Response },
  error: string,
): Response => c.json({ ok: false, code: 'bad_request', error }, 400)

/** Keys present in `body` that are not in the allow-list. */
function extraKeys(body: Record<string, unknown>, allowed: string[]): string[] {
  return Object.keys(body).filter((k) => !allowed.includes(k))
}

// Server-trusted eval enums. Only these may reach the gym; an unknown value is a
// client error (rejected here), never silently coerced into changing physics.
const EMBODIMENT_SET = new Set<string>(ROBOT_EMBODIMENTS)
const DOMAIN_SET = new Set<string>(PHYSICAL_DOMAINS)

const stepStatus = (r: { ok: boolean; code?: string }): ContentfulStatusCode =>
  r.ok ? 200 : r.code === 'bad_request' ? 400 : 502

const foundrySmallBodyLimit = bodyLimit({
  maxSize: 96 * 1024,
  onError: (c) => c.json({ ok: false, code: 'payload_too_large', error: 'Foundry request body too large.' }, 413),
})

const foundryImageBodyLimit = bodyLimit({
  maxSize: 10_500_000,
  onError: (c) => c.json({ ok: false, code: 'payload_too_large', error: 'Foundry image request body too large.' }, 413),
})

export function createApp(config: AppConfig): Hono {
  const runCfg = { nebius: config.nebius, insforge: config.insforge }
  const gymCfg: GymConfig = { insforge: config.insforge, episodeSecret: config.episodeSecret }
  const warehouseCfg: WarehouseGymConfig = {
    insforge: config.insforge,
    episodeSecret: config.episodeSecret,
  }

  const app = new Hono()
  app.use('*', cors())

  app.get('/health', (c) =>
    c.json({ ok: true, environment: ENVIRONMENT_NAME, time: new Date().toISOString() }),
  )

  // ---- Gym env (external policy) -----------------------------------------
  // PUBLIC reset for external agents. `scenarioId` may be omitted (random external
  // scenario), but a PRESENT field must be the right type — a mistyped or blank
  // value is a client error, never silently coerced.
  app.post('/v1/episodes', async (c) => {
    const parsed = await strictJsonObject(c)
    if (!parsed.ok) return badRequest(c, parsed.error)
    const body = parsed.body
    if ('scenarioId' in body && (typeof body.scenarioId !== 'string' || body.scenarioId.trim() === '')) {
      return badRequest(c, 'scenarioId must be a non-empty string when provided.')
    }
    if ('agentId' in body && typeof body.agentId !== 'string') {
      return badRequest(c, 'agentId must be a string when provided.')
    }
    const r = resetEpisode(
      { scenarioId: body.scenarioId as string | undefined, agentId: body.agentId as string | undefined },
      gymCfg,
    )
    return c.json(r, r.ok ? 200 : 400)
  })

  // The step body is server-enforced as EXACTLY { action } — any extra key
  // (confidence, rationale, reward, license, passed, episodeId, …) is rejected so
  // a client can never write a digest-covered field through `/v1`.
  app.post('/v1/episodes/:episodeId/step', async (c) => {
    const parsed = await strictJsonObject(c)
    if (!parsed.ok) return badRequest(c, parsed.error)
    const body = parsed.body
    const extra = extraKeys(body, ['action'])
    if (extra.length) {
      return badRequest(c, `Unexpected field(s): ${extra.join(', ')}. Send only { action }.`)
    }
    if (typeof body.action !== 'string' || body.action.trim() === '') {
      return badRequest(c, 'action must be a non-empty string.')
    }
    const r = await stepEpisode({ episodeId: c.req.param('episodeId'), action: body.action }, gymCfg)
    return c.json(r, stepStatus(r))
  })

  // The body-form step is enforced as EXACTLY { episodeId, action }.
  app.post('/v1/step', async (c) => {
    const parsed = await strictJsonObject(c)
    if (!parsed.ok) return badRequest(c, parsed.error)
    const body = parsed.body
    const extra = extraKeys(body, ['episodeId', 'action'])
    if (extra.length) {
      return badRequest(c, `Unexpected field(s): ${extra.join(', ')}. Send only { episodeId, action }.`)
    }
    if (typeof body.episodeId !== 'string' || body.episodeId.trim() === '') {
      return badRequest(c, 'episodeId must be a non-empty string.')
    }
    if (typeof body.action !== 'string' || body.action.trim() === '') {
      return badRequest(c, 'action must be a non-empty string.')
    }
    const r = await stepEpisode({ episodeId: body.episodeId, action: body.action }, gymCfg)
    return c.json(r, stepStatus(r))
  })

  // ---- Gym env (server-owned reference agents) ---------------------------
  // The ONLY path that can mint trusted mock/nebius provenance — and only after
  // the server actually runs that reference agent against the gym env.
  app.post('/v1/reference-episodes', async (c) => {
    const parsed = await strictJsonObject(c)
    if (!parsed.ok) return badRequest(c, parsed.error)
    const body = parsed.body
    const extra = extraKeys(body, ['scenarioId', 'mode'])
    if (extra.length) {
      return badRequest(c, `Unexpected field(s): ${extra.join(', ')}. Send only { scenarioId, mode }.`)
    }
    if (typeof body.scenarioId !== 'string' || body.scenarioId.trim() === '') {
      return badRequest(c, 'scenarioId must be a non-empty string.')
    }
    if (body.mode !== 'mock' && body.mode !== 'nebius') {
      return badRequest(c, 'mode must be "mock" or "nebius".')
    }
    const r = await runReferenceEpisode(
      { scenarioId: body.scenarioId, mode: body.mode },
      { gym: gymCfg, nebius: config.nebius },
    )
    return c.json(r, r.ok ? 200 : r.code === 'bad_request' ? 400 : 502)
  })

  // ---- Calibrated Autonomy Gym: symbolic warehouse -----------------------
  // Multi-step warehouse reset. Same trust shape as /v1/episodes: the reset
  // returns visible observation + signed state; the oracle label stays hidden.
  app.post('/v1/warehouse/episodes', async (c) => {
    const parsed = await strictJsonObject(c)
    if (!parsed.ok) return badRequest(c, parsed.error)
    const body = parsed.body
    const extra = extraKeys(body, [
      'taskId',
      'agentId',
      'runId',
      'embodiment',
      'domain',
      'planId',
      'requirementSummary',
      'approvedFactsHash',
      'inputManifestSummary',
      'frozenWorkflowSummary',
    ])
    if (extra.length) {
      return badRequest(
        c,
        `Unexpected field(s): ${extra.join(', ')}. Send only { taskId, agentId, runId, embodiment, domain, planId, requirementSummary, approvedFactsHash, inputManifestSummary, frozenWorkflowSummary }.`,
      )
    }
    if ('taskId' in body && (typeof body.taskId !== 'string' || body.taskId.trim() === '')) {
      return badRequest(c, 'taskId must be a non-empty string when provided.')
    }
    if ('agentId' in body && typeof body.agentId !== 'string') {
      return badRequest(c, 'agentId must be a string when provided.')
    }
    if ('runId' in body && typeof body.runId !== 'string') {
      return badRequest(c, 'runId must be a string when provided.')
    }
    // Only a known embodiment may reach the gym (it is the sole physics lever).
    if ('embodiment' in body && (typeof body.embodiment !== 'string' || !EMBODIMENT_SET.has(body.embodiment))) {
      return badRequest(c, `embodiment must be one of: ${ROBOT_EMBODIMENTS.join(', ')}.`)
    }
    if ('domain' in body && (typeof body.domain !== 'string' || !DOMAIN_SET.has(body.domain))) {
      return badRequest(c, `domain must be one of: ${PHYSICAL_DOMAINS.join(', ')}.`)
    }
    if ('planId' in body && typeof body.planId !== 'string') {
      return badRequest(c, 'planId must be a string when provided.')
    }
    if ('requirementSummary' in body && typeof body.requirementSummary !== 'string') {
      return badRequest(c, 'requirementSummary must be a string when provided.')
    }
    if ('approvedFactsHash' in body && typeof body.approvedFactsHash !== 'string') {
      return badRequest(c, 'approvedFactsHash must be a string when provided.')
    }
    if ('inputManifestSummary' in body && typeof body.inputManifestSummary !== 'string') {
      return badRequest(c, 'inputManifestSummary must be a string when provided.')
    }
    if ('frozenWorkflowSummary' in body && typeof body.frozenWorkflowSummary !== 'string') {
      return badRequest(c, 'frozenWorkflowSummary must be a string when provided.')
    }
    const r = resetWarehouseEpisode(
      {
        taskId: body.taskId as string | undefined,
        agentId: body.agentId as string | undefined,
        runId: body.runId as string | undefined,
        embodiment: body.embodiment as string | undefined,
        domain: body.domain as string | undefined,
        planId: body.planId as string | undefined,
        requirementSummary: body.requirementSummary as string | undefined,
        approvedFactsHash: body.approvedFactsHash as string | undefined,
        inputManifestSummary: body.inputManifestSummary as string | undefined,
        frozenWorkflowSummary: body.frozenWorkflowSummary as string | undefined,
      },
      warehouseCfg,
    )
    return c.json(r, r.ok ? 200 : 400)
  })

  // The warehouse step body is exactly { action }; the signed episode carries
  // all rollout state, and the server computes terminal reward/evidence.
  app.post('/v1/warehouse/episodes/:episodeId/step', async (c) => {
    const parsed = await strictJsonObject(c)
    if (!parsed.ok) return badRequest(c, parsed.error)
    const body = parsed.body
    const extra = extraKeys(body, ['action'])
    if (extra.length) {
      return badRequest(c, `Unexpected field(s): ${extra.join(', ')}. Send only { action }.`)
    }
    if (typeof body.action !== 'string' || body.action.trim() === '') {
      return badRequest(c, 'action must be a non-empty string.')
    }
    const r = await stepWarehouseEpisode(
      { episodeId: c.req.param('episodeId'), action: body.action },
      warehouseCfg,
    )
    return c.json(r, stepStatus(r))
  })

  // Server-owned DETERMINISTIC warehouse reference episode: runs the calibrated
  // oracle through the embodiment-adjusted task and persists evidence with `mock`
  // provenance. No model spend. Exact fields only.
  app.post('/v1/warehouse/reference-episodes', async (c) => {
    const parsed = await strictJsonObject(c)
    if (!parsed.ok) return badRequest(c, parsed.error)
    const body = parsed.body
    const extra = extraKeys(body, [
      'taskId',
      'domain',
      'embodiment',
      'planId',
      'requirementSummary',
      'approvedFactsHash',
      'inputManifestSummary',
      'frozenWorkflowSummary',
    ])
    if (extra.length) {
      return badRequest(
        c,
        `Unexpected field(s): ${extra.join(', ')}. Send only { taskId, domain, embodiment, planId, requirementSummary, approvedFactsHash, inputManifestSummary, frozenWorkflowSummary }.`,
      )
    }
    if (typeof body.taskId !== 'string' || body.taskId.trim() === '') {
      return badRequest(c, 'taskId must be a non-empty string.')
    }
    if ('embodiment' in body && (typeof body.embodiment !== 'string' || !EMBODIMENT_SET.has(body.embodiment))) {
      return badRequest(c, `embodiment must be one of: ${ROBOT_EMBODIMENTS.join(', ')}.`)
    }
    if ('domain' in body && (typeof body.domain !== 'string' || !DOMAIN_SET.has(body.domain))) {
      return badRequest(c, `domain must be one of: ${PHYSICAL_DOMAINS.join(', ')}.`)
    }
    if ('planId' in body && typeof body.planId !== 'string') {
      return badRequest(c, 'planId must be a string when provided.')
    }
    if ('requirementSummary' in body && typeof body.requirementSummary !== 'string') {
      return badRequest(c, 'requirementSummary must be a string when provided.')
    }
    if ('approvedFactsHash' in body && typeof body.approvedFactsHash !== 'string') {
      return badRequest(c, 'approvedFactsHash must be a string when provided.')
    }
    if ('inputManifestSummary' in body && typeof body.inputManifestSummary !== 'string') {
      return badRequest(c, 'inputManifestSummary must be a string when provided.')
    }
    if ('frozenWorkflowSummary' in body && typeof body.frozenWorkflowSummary !== 'string') {
      return badRequest(c, 'frozenWorkflowSummary must be a string when provided.')
    }
    const r = await runWarehouseReferenceEpisode(
      {
        taskId: body.taskId,
        domain: body.domain as string | undefined,
        embodiment: body.embodiment as string | undefined,
        planId: body.planId as string | undefined,
        requirementSummary: body.requirementSummary as string | undefined,
        approvedFactsHash: body.approvedFactsHash as string | undefined,
        inputManifestSummary: body.inputManifestSummary as string | undefined,
        frozenWorkflowSummary: body.frozenWorkflowSummary as string | undefined,
      },
      warehouseCfg,
    )
    return c.json(r, stepStatus(r))
  })

  // ---- Legacy /api (reuses existing server-owned handlers) ----------------
  app.post('/api/run-episode', async (c) => {
    const r = await handleRunEpisode(await jsonBody(c), runCfg)
    if (!r.ok) return c.json(r, r.code === 'bad_request' ? 400 : 502)
    // Client-safe subset (auditRow stays server-side).
    return c.json({ ok: true, trace: r.trace, license: r.license, persistence: r.persistence, runId: r.runId })
  })
  app.get('/api/runs/recent', (c) => c.json({ ok: true, runs: getRecentRuns(10) }))
  app.get('/api/evidence/status', async (c) => {
    const limitRaw = Number(c.req.query('limit'))
    const status = await getEvidenceStatus(runCfg, {
      refresh: c.req.query('refresh') === '1',
      limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
      runId: c.req.query('run_id') ?? undefined,
    })
    return c.json({ ok: true, ...status })
  })
  app.post('/api/nebius-action', async (c) => {
    const r = await handleNebiusAction(await jsonBody(c), config.nebius)
    return c.json(r, r.ok ? 200 : nebiusStatus(r.code))
  })
  // Voice intake: structure a speech transcript into capture-form fields via the
  // server-side MiniMax key. Authoring only — never touches oracle/reward/license.
  app.post('/api/voice/structure', async (c) => {
    const r = await handleVoiceStructure(await jsonBody(c), config.minimax)
    return c.json(r, voiceStatus(r))
  })
  app.post('/api/vapi/tools', async (c) => c.json(await handleVapiTools(await jsonBody(c), runCfg)))

  // ---- Origin Foundry: floor → environment → verified, reward-hardened policy ----
  // Cerebras gemma-4-31b is the primary for every gemma-4 call; a deterministic mock
  // (labeled source:'mock') keeps the demo alive offline. The oracle alone scores.
  app.post('/api/foundry/parse-floor', foundryImageBodyLimit, async (c) => c.json(await handleParseFloor(await jsonBody(c), config.cerebras)))
  app.post('/api/foundry/quorum-run', foundrySmallBodyLimit, async (c) => c.json(await handleQuorumRun(await jsonBody(c), config.cerebras)))
  app.post('/api/foundry/gym-rollout', foundrySmallBodyLimit, async (c) => {
    const r = await handleGymRollout(await jsonBody(c))
    return c.json(r, r.ok ? 200 : 400)
  })
  app.post('/api/foundry/speed-race', foundrySmallBodyLimit, async (c) => c.json(await handleSpeedRace(await jsonBody(c), config.cerebras, config.gemini)))

  // ---- Origin Autonomy-Control (AI-SOC): same engine, digital buyer ----
  // A software agent's destructive/injection-driven tool-calls are vetoed by the Guardian and
  // a fail-closed policy floor; the deterministic policy is the only judge. The loop-race proves
  // per-step verification is free at Cerebras speed.
  app.post('/api/foundry/soc-run', foundrySmallBodyLimit, async (c) => c.json(await handleSocRun(await jsonBody(c), config.cerebras)))
  app.post('/api/foundry/soc-race', foundrySmallBodyLimit, async (c) => c.json(await handleSocRace(await jsonBody(c), config.cerebras, config.gemini)))
  // Speed leaderboard: gemma-4-31b on Cerebras vs every available frontier GPU model, live tok/s.
  app.post('/api/foundry/leaderboard', foundrySmallBodyLimit, async (c) => c.json(await handleLeaderboard(await jsonBody(c), config.cerebras, config.gemini)))
  // The "safety tax": GPU one-shot (fast, unguarded → breaches) vs Cerebras verified (safe AND faster).
  app.post('/api/foundry/soc-shootout', foundrySmallBodyLimit, async (c) => c.json(await handleSocShootout(await jsonBody(c), config.cerebras, config.gemini)))
  // Economics: measured throughput → incidents/min (the input to the $ scorecard).
  app.post('/api/foundry/economics', foundrySmallBodyLimit, async (c) => c.json(await handleEconomics(await jsonBody(c), config.cerebras, config.gemini)))
  // Ensemble-of-N Guardians: a committee for the price of one (miss-rate ↓ as N ↑).
  app.post('/api/foundry/ensemble', foundrySmallBodyLimit, async (c) => c.json(await handleEnsemble(await jsonBody(c), config.cerebras, config.gemini)))
  // Latency: detect+veto an injected attack before a GPU returns its first token.
  app.post('/api/foundry/latency', foundrySmallBodyLimit, async (c) => c.json(await handleLatency(await jsonBody(c), config.cerebras, config.gemini)))
  // Accuracy vs latency: speed converts time into correctness (one-shot → verified).
  app.post('/api/foundry/accuracy', foundrySmallBodyLimit, async (c) => c.json(await handleAccuracy(await jsonBody(c), config.cerebras, config.gemini)))
  // Passport: identity→authority→veto — the "who is allowed" gate before the Guardian's "what".
  app.post('/api/foundry/passport-run', foundrySmallBodyLimit, async (c) => c.json(await handlePassportRun(await jsonBody(c), config.cerebras)))
  app.post('/api/foundry/supervision-run', foundrySmallBodyLimit, async (c) => c.json(await handleSupervisionRun(await jsonBody(c), config.cerebras)))

  return app
}
