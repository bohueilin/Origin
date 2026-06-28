// ----------------------------------------------------------------------------
// Stateless, signed episode tokens.
//
// `reset` issues an opaque episodeId that encodes (runId, agentId, scenarioId,
// issued-at, nonce), HMAC-signed with the server secret. `step` verifies the
// signature and re-loads the canonical scenario by id — so the server never
// trusts the client for which scenario (or its hidden answer) a step refers to,
// and needs no server-side episode state. This is what makes the gym horizontally
// scalable: any instance can score any step.
// ----------------------------------------------------------------------------

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Server-controlled provenance baked into the signed token. A PUBLIC reset is
 * always `external`; only the server-owned reference path mints `mock` / `nebius`.
 * Durable evidence derives its provenance from THIS field, never from the
 * client-supplied `agentId`.
 */
export type EpisodePolicySource = 'external' | 'mock' | 'nebius'

const POLICY_SOURCES: EpisodePolicySource[] = ['external', 'mock', 'nebius']

export interface EpisodePayload {
  runId: string
  agentId: string
  scenarioId: string
  /** Signed provenance — see EpisodePolicySource. */
  policySource: EpisodePolicySource
  /** issued-at, epoch ms */
  iat: number
  nonce: string
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

export function newNonce(): string {
  return randomBytes(9).toString('base64url')
}

/** Sign a payload into an opaque `<body>.<sig>` token. */
export function signEpisode(payload: EpisodePayload, secret: string): string {
  const body = b64url(JSON.stringify(payload))
  const sig = b64url(createHmac('sha256', secret).update(body).digest())
  return `${body}.${sig}`
}

/** Verify + decode a token. Returns null on any tampering / malformed input. */
export function verifyEpisode(token: string, secret: string): EpisodePayload | null {
  if (typeof token !== 'string') return null
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = b64url(createHmac('sha256', secret).update(body).digest())
  if (sig.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as EpisodePayload
    if (
      typeof parsed?.runId !== 'string' ||
      typeof parsed?.agentId !== 'string' ||
      typeof parsed?.scenarioId !== 'string'
    ) {
      return null
    }
    // Older tokens (pre-provenance) lack policySource; treat them as `external`
    // so they can never carry trusted reference attribution.
    const policySource: EpisodePolicySource = POLICY_SOURCES.includes(parsed.policySource)
      ? parsed.policySource
      : 'external'
    return { ...parsed, policySource }
  } catch {
    return null
  }
}
