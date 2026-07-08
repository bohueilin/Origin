// ----------------------------------------------------------------------------
// Server-owned reference agents.
//
// The reference agents (mock + Nebius) are the only callers allowed to mint a
// gym episode whose durable provenance becomes `mock` / `nebius`. They drive the
// SAME `/v1` reset/step env as any external agent — they never compute the
// verifier/reward/license themselves. This keeps the trust boundary honest: the
// public `/v1/episodes` route cannot forge reference-agent provenance, and only a
// run the server actually executed earns concrete attribution.
//
// Nebius fallback: if the model fails to PROPOSE, we never step the
// nebius-reference episode (that would persist evidence claiming Nebius decided).
// Instead we open a FRESH trusted mock episode and step that one, so the durable
// row honestly reads `mock` while the response flags the fallback.
// ----------------------------------------------------------------------------

import { decide } from '../src/agent.ts'
import type {
  AgentDecision,
  Domain,
  EvidencePolicySource,
  MockPolicyView,
  ModelPolicyView,
  TraceProvenance,
} from '../src/types'
import {
  resetReferenceEpisode,
  stepEpisode,
  type GymConfig,
  type GymStepSuccess,
  type Observation,
} from './env/gym.ts'
import { handleNebiusAction, type NebiusHandlerConfig } from './nebiusHandler.ts'

export type ReferenceMode = 'mock' | 'nebius'

export interface ReferenceConfig {
  gym: GymConfig
  nebius: NebiusHandlerConfig
}

export type ReferenceResult =
  | { ok: true; step: GymStepSuccess; decision: AgentDecision; provenance: TraceProvenance }
  | { ok: false; code: 'bad_request' | 'unknown'; error: string }

/** Mock policy view from the env observation (includes the mock-only risk score). */
function mockViewFromObs(o: Observation): MockPolicyView {
  return {
    id: o.scenarioId,
    domain: o.domain as Domain,
    title: o.title,
    situation: o.situation,
    visibleSignals: o.visibleSignals,
    visibleRiskScore: o.visibleRiskScore,
  }
}

/** Strict model view from the env observation (no mock-only risk score). */
function modelViewFromObs(o: Observation): ModelPolicyView {
  return {
    id: o.scenarioId,
    domain: o.domain as Domain,
    title: o.title,
    situation: o.situation,
    visibleSignals: o.visibleSignals,
  }
}

/** Open a trusted mock episode, decide from its observation, and step it. */
async function runMockEpisode(
  scenarioId: string,
  cfg: ReferenceConfig,
  requestedPolicyMode: EvidencePolicySource,
  fallbackCode: string | null,
): Promise<ReferenceResult> {
  const reset = resetReferenceEpisode(scenarioId, 'mock', cfg.gym)
  if (!reset.ok) return { ok: false, code: 'bad_request', error: reset.error }

  const decision = decide(mockViewFromObs(reset.observation))
  const step = await stepEpisode({ episodeId: reset.episodeId, action: decision.action }, cfg.gym)
  if (!step.ok) {
    return { ok: false, code: step.code === 'bad_request' ? 'bad_request' : 'unknown', error: step.error }
  }
  return {
    ok: true,
    step,
    decision,
    provenance: {
      requestedPolicyMode,
      actualPolicySource: 'mock',
      fallback: fallbackCode != null,
      fallbackCode,
    },
  }
}

/**
 * Run one reference-agent episode end-to-end through the gym env. The caller (the
 * `/v1/reference-episodes` route) has already validated `scenarioId` as a
 * non-empty string and `mode` as a `ReferenceMode`, so the trusted runner takes
 * the stricter boundary type directly. Unknown scenario ids still fail closed via
 * `resetReferenceEpisode`. Everything trust-bearing is computed by stepEpisode
 * against the server-loaded scenario.
 */
export async function runReferenceEpisode(
  input: { scenarioId: string; mode: ReferenceMode },
  cfg: ReferenceConfig,
): Promise<ReferenceResult> {
  const { scenarioId, mode } = input

  if (mode === 'mock') {
    return runMockEpisode(scenarioId, cfg, 'mock', null)
  }

  // Nebius: open a trusted nebius episode and let the model PROPOSE from the
  // visible model view only.
  const reset = resetReferenceEpisode(scenarioId, 'nebius', cfg.gym)
  if (!reset.ok) return { ok: false, code: 'bad_request', error: reset.error }

  const nebius = await handleNebiusAction({ view: modelViewFromObs(reset.observation) }, cfg.nebius)
  if (!nebius.ok) {
    // The model did not propose — do NOT step the nebius episode. Fall back to a
    // fresh trusted mock episode so the durable row honestly reads `mock`.
    return runMockEpisode(scenarioId, cfg, 'nebius', 'nebius_unavailable')
  }

  const decision: AgentDecision = {
    action: nebius.decision.action,
    confidence: nebius.decision.confidence,
    rationale: nebius.decision.rationale,
    requestedInfo: nebius.decision.requestedInfo,
    source: 'nebius',
    model: nebius.model,
  }
  const step = await stepEpisode({ episodeId: reset.episodeId, action: decision.action }, cfg.gym)
  if (!step.ok) {
    return { ok: false, code: step.code === 'bad_request' ? 'bad_request' : 'unknown', error: step.error }
  }
  return {
    ok: true,
    step,
    decision,
    provenance: {
      requestedPolicyMode: 'nebius',
      actualPolicySource: 'nebius',
      fallback: false,
      fallbackCode: null,
    },
  }
}
