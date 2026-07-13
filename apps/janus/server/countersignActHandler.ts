// Countersign HTTP handlers — the enforcement surface. This is where "useLease" finally
// becomes a REAL enforcement path: the /act route runs the deterministic gate FIRST and only
// then brokers the secret. On a deny the broker is never called and no secret is ever fetched.
//
// Offline-first: with 1Password unconfigured, the allow-path still exercises `useLease` (it
// returns no_client) and then falls back to a deterministic, secret-free "resolved" result, so
// the whole flow — deny-before-resolve, JIT boundary, redacted result — is demonstrable with
// zero external services. With 1Password configured, the exact same path resolves a real secret
// JIT inside the action closure and returns only the redacted outcome.
//
// Every decision emits a Countersign Receipt signed by the issuer — the receipt records the
// gate that decided, the re-derived level, and the request identity, so an allow or a deny is
// independently checkable and not merely the agent's own say-so.

import { signPayload, buildPopChallenge, type Ed25519PublicJwk, type PopChallenge } from '@origin/verifier-core/countersign-identity'
import { sha256, canonical } from '@origin/evidence/env-evidence'
import type { Warrant } from '@origin/verifier-core/warrant'
import type { AppConfig } from './config.ts'
import { countersignGate, type CountersignPresentation, type GateContext } from './countersignGate.ts'
import { manifestDigest } from './scopePolicy.ts'
import {
  getIssuer,
  enrollAgent,
  earnWarrant,
  isTainted,
  markTainted,
  clearTaint,
  consumeNonce,
  getAgent,
} from './countersignIssuer.ts'
import { leaseScopedSecret, useLease, isAvailable as opAvailable } from './onePasswordBroker.ts'
import { generateAgentKey } from '@origin/verifier-core/countersign-identity'

export const COUNTERSIGN_ACT_ROUTE = '/api/janus/countersign/act'

interface Reply {
  status: number
  body: Record<string, unknown>
}

/** GET /api/janus/countersign/manifest — the pin material a verifier needs (issuer + scope policy). */
export function handleCountersignManifest(): Reply {
  const issuer = getIssuer()
  return {
    status: 200,
    body: {
      ok: true,
      issuer: { public_jwk: issuer.publicJwk, thumbprint: issuer.thumbprint, is_dev: issuer.isDev },
      capability_manifest_digest: manifestDigest(),
      protocol: 'countersign-v1',
    },
  }
}

/**
 * POST /api/janus/countersign/enroll — register an agent by its public key. For the demo the
 * server can also mint the keypair (body { demo: true }) so the operator holds a real private
 * key to sign PoP with; in production the agent enrolls its OWN public key and keeps its private
 * key. The agent id is DERIVED from the key, so no caller can claim another's id.
 */
export function handleCountersignEnroll(body: Record<string, unknown>, now: number): Reply {
  if (body.demo === true) {
    const k = generateAgentKey()
    const r = enrollAgent(k.publicJwk, now, k.privateJwk)
    if (!r.ok) return { status: 400, body: { ok: false, error: r.error } }
    return { status: 200, body: { ok: true, thumbprint: r.thumbprint, public_jwk: k.publicJwk, private_jwk: k.privateJwk, demo: true } }
  }
  const publicJwk = body.public_jwk as Ed25519PublicJwk | undefined
  if (!publicJwk) return { status: 400, body: { ok: false, error: 'public_jwk required (or { demo: true })' } }
  const r = enrollAgent(publicJwk, now)
  if (!r.ok) return { status: 400, body: { ok: false, error: r.error } }
  return { status: 200, body: { ok: true, thumbprint: r.thumbprint } }
}

/**
 * POST /api/janus/countersign/earn — run the agent through the gym battery and mint a Warrant.
 * `battery` ∈ { l4, catastrophic, farmed } exercises the earned/capped/diversity-gated cases.
 */
export function handleCountersignEarn(body: Record<string, unknown>, now: number): Reply {
  const thumbprint = String(body.thumbprint ?? '')
  if (!getAgent(thumbprint)) return { status: 400, body: { ok: false, error: 'unknown agent — enroll first' } }
  const battery = (['l4', 'catastrophic', 'farmed'].includes(String(body.battery)) ? body.battery : 'l4') as 'l4' | 'catastrophic' | 'farmed'
  const { warrant, level } = earnWarrant(thumbprint, battery, now)
  return { status: 200, body: { ok: true, warrant, level } }
}

/** POST /api/janus/countersign/taint — mark an agent exposed to untrusted content (demo beat). */
export function handleCountersignTaint(body: Record<string, unknown>): Reply {
  const thumbprint = String(body.thumbprint ?? '')
  if (!thumbprint) return { status: 400, body: { ok: false, error: 'thumbprint required' } }
  if (body.clear === true) clearTaint(thumbprint)
  else markTainted(thumbprint)
  return { status: 200, body: { ok: true, thumbprint, tainted: isTainted(thumbprint) } }
}

interface ActBody {
  agent_public_jwk?: Ed25519PublicJwk
  pop_challenge?: PopChallenge
  pop_signature?: string
  warrant?: Warrant
  capability?: string
  item_ref?: string
}

/**
 * POST /api/janus/countersign/act — the enforcement path. Runs the gate, and ONLY on allow
 * brokers a scoped secret through useLease. Returns a signed Countersign Receipt either way.
 */
export async function handleCountersignAct(body: Record<string, unknown>, cfg: AppConfig, now: number): Promise<Reply> {
  const b = body as ActBody
  if (!b.agent_public_jwk || !b.pop_challenge || !b.pop_signature || !b.warrant || !b.capability) {
    return { status: 400, body: { ok: false, error: 'agent_public_jwk, pop_challenge, pop_signature, warrant, capability required' } }
  }

  const issuer = getIssuer()
  const presentation: CountersignPresentation = {
    agentPublicJwk: b.agent_public_jwk,
    popChallenge: b.pop_challenge,
    popSignature: b.pop_signature,
    warrant: b.warrant,
    capability: b.capability,
    itemRef: b.item_ref,
  }
  // The PoP nonce is single-use — burn it once, and only for a structurally-present nonce.
  const nonce = b.pop_challenge?.nonce
  const nonceOk = typeof nonce === 'string' && consumeNonce(nonce)

  const ctx: GateContext = {
    route: COUNTERSIGN_ACT_ROUTE,
    body: gatePopBody(b),
    now,
    nonceOk,
    issuerPublicJwk: issuer.publicJwk,
    issuerThumbprint: issuer.thumbprint,
    capabilityManifestDigest: manifestDigest(),
    isTainted,
  }

  const decision = countersignGate(presentation, ctx)

  if (decision.decision === 'deny') {
    const receipt = signReceipt({ decision, item_ref: b.item_ref ?? null, resolved: false, now, issuerPrivateJwk: issuer.privateJwk, issuerThumbprint: issuer.thumbprint })
    return { status: 200, body: { ok: false, decision: 'deny', gate: decision.gate, code: decision.code, reason: decision.reason, level: decision.level, checks: decision.checks, receipt, secret_fetched: false } }
  }

  // ALLOW — now, and only now, broker the secret. This is the first route to drive useLease.
  const itemRef = b.item_ref ?? 'op://Personal/luma-account'
  let resolution: { resolved: boolean; via: string; result_summary: string }
  if (opAvailable(cfg.onepassword)) {
    const lease = leaseScopedSecret({ item_ref: itemRef, capability: b.capability, intent_id: decision.agent_thumbprint, grant_id: b.warrant.warrant_digest, agent_id: decision.agent_thumbprint }, cfg.onepassword)
    if (!lease.ok || !lease.lease) {
      resolution = { resolved: false, via: 'lease_refused', result_summary: `lease refused: ${lease.error ?? lease.code}` }
    } else {
      const used = await useLease(lease.lease.handle, itemRef, cfg.onepassword, async (secret) => {
        // The secret exists ONLY inside this closure. We return a redacted proof-of-use, never the value.
        return { authenticated: true, secret_length: secret.length }
      })
      resolution = used.ok
        ? { resolved: true, via: '1password_jit', result_summary: 'authenticated via JIT-resolved secret (value never left the closure)' }
        : { resolved: false, via: `useLease_${used.code}`, result_summary: `broker: ${used.error ?? used.code}` }
    }
  } else {
    // Offline: useLease is still exercised (returns no_client); fall back to a secret-free result.
    const probe = await useLease('jns_offline_probe', itemRef, cfg.onepassword, async () => ({ authenticated: true }))
    resolution = { resolved: false, via: `simulated_${probe.code ?? 'no_client'}`, result_summary: 'brokered (simulated): gate passed; a real secret would resolve JIT here and never enter the agent context' }
  }

  const receipt = signReceipt({ decision, item_ref: itemRef, resolved: resolution.resolved, now, issuerPrivateJwk: issuer.privateJwk, issuerThumbprint: issuer.thumbprint })
  return {
    status: 200,
    body: {
      ok: true,
      decision: 'allow',
      level: decision.level,
      capability: b.capability,
      resolution,
      checks: decision.checks,
      receipt,
      secret_in_agent_context: false,
    },
  }
}

/** The exact body the PoP challenge is bound to (must match what the client signed). */
function gatePopBody(b: ActBody): Record<string, unknown> {
  return { capability: b.capability, item_ref: b.item_ref ?? null, warrant_digest: b.warrant?.warrant_digest ?? null }
}

interface ReceiptInput {
  decision: { decision: string; gate: string; code: string; reason: string; agent_thumbprint: string; level: string | null }
  item_ref: string | null
  resolved: boolean
  now: number
  issuerPrivateJwk: Parameters<typeof signPayload>[1]
  issuerThumbprint: string
}

/** A Countersign Receipt — signed by the issuer (the gate), not by the audited agent. */
function signReceipt(i: ReceiptInput): Record<string, unknown> {
  const payload = {
    receipt_schema_version: '1.0.0',
    kind: 'countersign-receipt',
    decision: i.decision.decision,
    gate: i.decision.gate,
    code: i.decision.code,
    reason: i.decision.reason,
    agent_thumbprint: i.decision.agent_thumbprint,
    level: i.decision.level,
    item_ref: i.item_ref,
    secret_resolved: i.resolved,
    issuer_thumbprint: i.issuerThumbprint,
    at: i.now,
  }
  const payload_digest = sha256(canonical(payload))
  const signature = signPayload({ payload_digest }, i.issuerPrivateJwk)
  return { ...payload, payload_digest, signature }
}

/** Helper the demo/tests use to build a valid PoP signature for the /act route. */
export function buildActPop(input: {
  agentThumbprint: string
  capability: string
  itemRef: string | null
  warrantDigest: string
  nonce: string
  iat: number
  privateJwk: Parameters<typeof signPayload>[1]
}): { challenge: PopChallenge; signature: string } {
  const body = { capability: input.capability, item_ref: input.itemRef, warrant_digest: input.warrantDigest }
  const challenge = buildPopChallenge({ agentThumbprint: input.agentThumbprint, route: COUNTERSIGN_ACT_ROUTE, body, nonce: input.nonce, iat: input.iat })
  return { challenge, signature: signPayload(challenge, input.privateJwk) }
}
