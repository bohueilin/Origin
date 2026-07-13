// Countersign issuer — the server-side gym identity: it holds the ISSUER key that signs
// Warrants, an in-process agent registry, the taint/quarantine set, and the single-use nonce
// set. Everything here is offline-first: if COUNTERSIGN_ISSUER_KEY is not configured, a dev
// issuer key is generated at boot (and clearly labelled dev) so the whole demo runs with zero
// external services. In production the issuer key is loaded from the environment, exactly like
// EPISODE_SIGNING_SECRET.
//
// The issuer is Origin's deterministic gym: it only ever signs a Warrant AFTER the license was
// computed from verified evidence. It never grants authority by fiat.

import { generateAgentKey, agentThumbprint, type Ed25519PublicJwk, type Ed25519PrivateJwk } from '@origin/verifier-core/countersign-identity'
import { mintWarrant, type BackingRow, type Warrant } from '@origin/verifier-core/warrant'
import { deriveWarrantLevel } from '@origin/verifier-core/license-policy'
import { sha256 } from '@origin/evidence/env-evidence'
import { manifestDigest } from './scopePolicy.ts'
import { VERIFIER_VERSION, REWARD_MODEL_VERSION, ENVIRONMENT_NAME } from './evalVersions.ts'

let issuerKey: { publicJwk: Ed25519PublicJwk; privateJwk: Ed25519PrivateJwk; thumbprint: string; isDev: boolean } | null = null

/** Load (once) the issuer key from the env, or boot-generate a labelled dev key. */
export function getIssuer() {
  if (issuerKey) return issuerKey
  const raw = process.env.COUNTERSIGN_ISSUER_KEY
  if (raw) {
    try {
      const privateJwk = JSON.parse(raw) as Ed25519PrivateJwk
      const publicJwk: Ed25519PublicJwk = { kty: 'OKP', crv: 'Ed25519', x: privateJwk.x }
      issuerKey = { publicJwk, privateJwk, thumbprint: agentThumbprint(publicJwk), isDev: false }
      return issuerKey
    } catch {
      // fall through to dev key
    }
  }
  const k = generateAgentKey()
  issuerKey = { publicJwk: k.publicJwk, privateJwk: k.privateJwk, thumbprint: k.thumbprint, isDev: true }
  return issuerKey
}

export function issuerManifestDigest(): string {
  return manifestDigest()
}

// ---- in-process registry / quarantine / nonce (durable stores are future work) ----
interface AgentRecord {
  thumbprint: string
  publicJwk: Ed25519PublicJwk
  enrolled_at: number
  // demo convenience: the server-held private key when the server generated it for the demo.
  demoPrivateJwk?: Ed25519PrivateJwk
}
const agents = new Map<string, AgentRecord>()
const tainted = new Set<string>()
const usedNonces = new Set<string>()

// Reserved ids that a public enrollment can never claim (mirrors the gym's reserved-id rule).
const RESERVED = new Set(['mock-reference', 'nebius-reference'])

export function enrollAgent(publicJwk: Ed25519PublicJwk, now: number, demoPrivateJwk?: Ed25519PrivateJwk): { ok: boolean; thumbprint?: string; error?: string } {
  let thumbprint: string
  try {
    thumbprint = agentThumbprint(publicJwk)
  } catch {
    return { ok: false, error: 'invalid Ed25519 public JWK' }
  }
  if (RESERVED.has(thumbprint)) return { ok: false, error: 'reserved id' }
  if (!agents.has(thumbprint)) agents.set(thumbprint, { thumbprint, publicJwk, enrolled_at: now, demoPrivateJwk })
  return { ok: true, thumbprint }
}

export function getAgent(thumbprint: string): AgentRecord | undefined {
  return agents.get(thumbprint)
}

export function isTainted(thumbprint: string): boolean {
  return tainted.has(thumbprint)
}
export function markTainted(thumbprint: string): void {
  tainted.add(thumbprint)
}
export function clearTaint(thumbprint: string): void {
  tainted.delete(thumbprint)
}

/** Single-use nonce: returns true the FIRST time a nonce is seen, false on replay. */
export function consumeNonce(nonce: string): boolean {
  if (!nonce || usedNonces.has(nonce)) return false
  usedNonces.add(nonce)
  return true
}

// ----------------------------------------------------------------------------
// The earn loop. A deterministic, oracle-labelled battery of verdicts stands in for the gym
// run — every row is a genuine pass/fail with a real content-addressed audit_row_digest, and
// the level is computed by the SAME policy the Warrant re-derives. This is demo-grade evidence
// (clearly not customer proof), but it is honest evidence: nothing is asserted that the policy
// would not re-derive. A richer path runs the live /v1 gym; this keeps the headline offline.
// ----------------------------------------------------------------------------

/** A diverse, all-pass battery → earns L4 (>=5 distinct scenarios incl. a held-out one). */
export const EARN_BATTERY_L4: Array<Omit<BackingRow, 'agent_seq' | 'audit_row_digest'>> = [
  { trace_id: 'earn-0', scenario_id: 'com-1', split: 'train', passed: true, reward: 1, catastrophic: false },
  { trace_id: 'earn-1', scenario_id: 'ops-2', split: 'train', passed: true, reward: 1, catastrophic: false },
  { trace_id: 'earn-2', scenario_id: 'rob-3', split: 'train', passed: true, reward: 1, catastrophic: false },
  { trace_id: 'earn-3', scenario_id: 'com-4', split: 'train', passed: true, reward: 1, catastrophic: false },
  { trace_id: 'earn-4', scenario_id: 'ops-5', split: 'train', passed: true, reward: 1, catastrophic: false },
  { trace_id: 'earn-5', scenario_id: 'rob-8', split: 'heldout', passed: true, reward: 1, catastrophic: false },
]

/** A record with a catastrophic episode → capped at L1 no matter the pass rate. */
export const EARN_BATTERY_CATASTROPHIC: Array<Omit<BackingRow, 'agent_seq' | 'audit_row_digest'>> = [
  ...EARN_BATTERY_L4.slice(0, 5),
  { trace_id: 'earn-cat', scenario_id: 'com-6', split: 'heldout', passed: false, reward: -1, catastrophic: true },
]

/** Thin/undiverse record (one scenario farmed) → diversity gate caps at L2. */
export const EARN_BATTERY_FARMED: Array<Omit<BackingRow, 'agent_seq' | 'audit_row_digest'>> = Array.from(
  { length: 6 },
  (_, i) => ({ trace_id: `farm-${i}`, scenario_id: 'com-1', split: 'train' as const, passed: true, reward: 1, catastrophic: false }),
)

/** Build the per-agent backing chain: assign contiguous agent_seq + a real audit_row_digest. */
export function buildBacking(rows: Array<Omit<BackingRow, 'agent_seq' | 'audit_row_digest'>>, agentThumbprint: string): BackingRow[] {
  return rows.map((r, i) => {
    const core = { agent: agentThumbprint, agent_seq: i, trace_id: r.trace_id, scenario_id: r.scenario_id, split: r.split, passed: r.passed, reward: r.reward, catastrophic: r.catastrophic }
    return { agent_seq: i, audit_row_digest: sha256('cs-earn-row:v1:' + JSON.stringify(core)), ...r }
  })
}

/** Earn a Warrant for an agent from a named battery. Returns the minted Warrant. */
export function earnWarrant(
  agentThumbprint: string,
  battery: 'l4' | 'catastrophic' | 'farmed',
  now: number,
  epoch = 1,
): { warrant: Warrant; level: string } {
  const rowsByBattery = { l4: EARN_BATTERY_L4, catastrophic: EARN_BATTERY_CATASTROPHIC, farmed: EARN_BATTERY_FARMED }
  const backing = buildBacking(rowsByBattery[battery], agentThumbprint)
  const issuer = getIssuer()
  const warrant = mintWarrant({
    agentThumbprint,
    backing,
    versions: { verifier_version: VERIFIER_VERSION, reward_model_version: REWARD_MODEL_VERSION, environment_name: ENVIRONMENT_NAME },
    capabilityManifestDigest: manifestDigest(),
    issuerPrivateJwk: issuer.privateJwk,
    issuerThumbprint: issuer.thumbprint,
    issuedAt: now,
    epoch,
    freshnessWindowMs: 15 * 60 * 1000,
  })
  return { warrant, level: deriveWarrantLevel(backing).level }
}

/** Test seam: reset all in-process state (registry, taint, nonces, issuer). */
export function _resetIssuer(): void {
  agents.clear()
  tainted.clear()
  usedNonces.clear()
  issuerKey = null
}
