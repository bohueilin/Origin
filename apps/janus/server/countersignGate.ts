// Countersign gate — the ordered, fail-closed authority check that runs BEFORE any secret
// is fetched. This is the enforcement chokepoint: "agent signs, gate countersigns, or nothing
// happens." It is a PURE function of its inputs (no I/O, no wall-clock beyond the `now` passed
// in) so it is fully testable and deterministic; the handler around it does the actual secret
// resolution only AFTER this returns `allow`.
//
// The check order is the security argument. Each gate is a place an attack dies, and cheaper
// checks run first so an attacker's request is refused before anything expensive (or anything
// that touches a real credential) happens:
//
//   1. PoP            — the presenter proves possession of the key. Stops replay of a captured
//                       request body (nonce single-use, checked by the caller).
//   2. HOLDER binding — the presenting key must OWN the Warrant's subject thumbprint. This is
//                       the stolen-Warrant defense: a thief holding someone else's Warrant JSON
//                       cannot produce the possession signature, so WRONG_HOLDER fires before
//                       any scope logic even runs.
//   3. QUARANTINE     — a tainted/frozen agent (Cordon) is refused here, so the secret is never
//                       fetched for an agent exposed to untrusted content (deny-before-resolve).
//   4. WARRANT        — the earned level is re-DERIVED from the cited evidence under the pinned
//                       policy and the issuer signature is checked. Inflation / tamper / staleness
//                       all void here.
//   5. DELEGATION     — if the authority was delegated, the offline chain must verify and only
//                       ever narrow; the effective level is min(earned, chain ceiling).
//   6. SCOPE          — the requested capability must be within the level's ceiling. High/critical
//                       commits are never auto-allowed; they demand a human approval.
//
// Only when ALL pass does the gate return `allow`. Anything else denies with a specific code,
// and the caller MUST NOT resolve a secret on a deny.

import { agentThumbprint, verifyPop, type Ed25519PublicJwk, type PopChallenge } from '@origin/verifier-core/countersign-identity'
import { verifyWarrant, type Warrant } from '@origin/verifier-core/warrant'
import { scopeDecision, type LicenseLevelId } from './scopePolicy.ts'

export type GateDenyCode =
  | 'POP_INVALID'
  | 'NONCE_REPLAY'
  | 'WRONG_HOLDER'
  | 'QUARANTINED'
  | 'WARRANT_INVALID'
  | 'DELEGATION_INVALID'
  | 'OUT_OF_SCOPE'
  | 'REQUIRES_APPROVAL'

export interface CountersignPresentation {
  /** The presenting agent's Ed25519 public JWK (its identity). */
  agentPublicJwk: Ed25519PublicJwk
  /** Proof-of-possession over this request. */
  popChallenge: PopChallenge
  popSignature: string
  /** The earned-authority credential. */
  warrant: Warrant
  /** The capability the agent wants to exercise (e.g. 'credential.scoped_request'). */
  capability: string
  /** The vault reference the action targets — echoed into the receipt, never resolved here. */
  itemRef?: string
  /** Optional offline delegation chain (leaf-holder acting under delegated authority). */
  delegationChain?: unknown
}

export interface GateContext {
  route: string
  body: unknown
  now: number
  /** Single-use nonce check — the caller burns the nonce; the gate only reads the verdict. */
  nonceOk: boolean
  /** The pinned gym issuer public key + thumbprint (authenticity of the Warrant). */
  issuerPublicJwk: Ed25519PublicJwk
  issuerThumbprint: string
  /** The level→scope manifest digest in force (tamper-evidence of the scope policy). */
  capabilityManifestDigest?: string
  /** Revocation floor — Warrants below this epoch are stale. */
  minEpoch?: number
  /** Cordon: is this agent tainted/frozen? If so, deny before resolve. */
  isTainted?: (agentThumbprint: string) => boolean
  /** Optional offline delegation-chain verifier (from @origin/verifier-core/delegation). */
  verifyDelegationChain?: (chain: unknown, opts: Record<string, unknown>) => { ok: boolean; reason?: string; effectiveCaveats?: { capabilities?: string[] } }
}

export interface GateDecision {
  decision: 'allow' | 'deny'
  gate: string
  code: GateDenyCode | 'OK'
  reason: string
  agent_thumbprint: string
  level: LicenseLevelId | null
  capability: string
  checks: Array<['PASS' | 'FAIL', string]>
}

/** The pure gate. Returns allow/deny + the specific gate that decided. Never resolves a secret. */
export function countersignGate(p: CountersignPresentation, ctx: GateContext): GateDecision {
  const checks: Array<['PASS' | 'FAIL', string]> = []
  const holder = safeThumbprint(p.agentPublicJwk)
  const base = { agent_thumbprint: holder ?? 'unknown', capability: p.capability, level: null as LicenseLevelId | null }
  const deny = (gate: string, code: GateDenyCode, reason: string): GateDecision => {
    checks.push(['FAIL', `${gate}: ${reason}`])
    return { decision: 'deny', gate, code, reason, checks, ...base }
  }
  const pass = (m: string) => checks.push(['PASS', m])

  if (!holder) return deny('identity', 'POP_INVALID', 'presenting key is not a valid Ed25519 JWK')

  // 1 — proof of possession over THIS request (route + body bound).
  if (!ctx.nonceOk) return deny('pop', 'NONCE_REPLAY', 'nonce already used or unknown (replay)')
  const pop = verifyPop({ challenge: p.popChallenge, signatureB64Url: p.popSignature, publicJwk: p.agentPublicJwk, expectRoute: ctx.route, body: ctx.body })
  if (!pop.ok) return deny('pop', 'POP_INVALID', `proof-of-possession failed (${pop.code}): ${pop.reason}`)
  pass('possession proven; request bound to this key, route, and body')

  // 2 — the presenter must OWN the Warrant's subject (stolen-Warrant defense).
  if (p.warrant?.agent_thumbprint !== holder) {
    return deny('holder', 'WRONG_HOLDER', 'presenting key does not own this Warrant (stolen/misused credential)')
  }
  pass('holder binding: the presenting key owns the Warrant subject')

  // 3 — quarantine: a tainted agent is refused before the secret is ever fetched.
  if (ctx.isTainted && ctx.isTainted(holder)) {
    return deny('quarantine', 'QUARANTINED', 'agent is exposed to untrusted content — credential refused, secret never fetched')
  }
  pass('quarantine: agent is not tainted')

  // 4 — the Warrant: re-derive the earned level from evidence + verify the issuer signature.
  const wr = verifyWarrant(p.warrant, {
    issuerPublicJwk: ctx.issuerPublicJwk,
    expectedIssuerThumbprint: ctx.issuerThumbprint,
    capabilityManifestDigest: ctx.capabilityManifestDigest,
    now: ctx.now,
    minEpoch: ctx.minEpoch,
  })
  for (const c of wr.checks) checks.push(c)
  if (!wr.ok) return deny('warrant', 'WARRANT_INVALID', `Warrant invalid (${wr.code}): ${wr.reason}`)
  const effectiveLevel = wr.level as LicenseLevelId
  base.level = effectiveLevel

  // 5 — delegation: if acting under delegated authority, the chain must verify and only narrow.
  let delegatedCapabilities: string[] | null = null
  if (p.delegationChain && ctx.verifyDelegationChain) {
    const chain = ctx.verifyDelegationChain(p.delegationChain, { issuerPublicJwk: ctx.issuerPublicJwk, rootThumbprint: p.warrant.agent_thumbprint })
    if (!chain.ok) return deny('delegation', 'DELEGATION_INVALID', `delegation chain invalid: ${chain.reason ?? 'unspecified'}`)
    delegatedCapabilities = chain.effectiveCaveats?.capabilities ?? null
    pass('delegation chain verified — authority only narrowed')
  }

  // 6 — scope: the capability must be within the level's ceiling AND (if delegated) the chain caveats.
  if (delegatedCapabilities && !delegatedCapabilities.includes(p.capability)) {
    return deny('scope', 'OUT_OF_SCOPE', `capability ${p.capability} is outside the delegated caveats`)
  }
  const sc = scopeDecision(effectiveLevel, p.capability)
  if (sc.decision === 'deny') return deny('scope', 'OUT_OF_SCOPE', `capability ${p.capability} exceeds ${effectiveLevel} ceiling: ${sc.reason}`)
  if (sc.decision === 'require_approval') return deny('scope', 'REQUIRES_APPROVAL', `capability ${p.capability} requires a human approval regardless of level: ${sc.reason}`)
  pass(`scope: ${p.capability} is within the ${effectiveLevel} ceiling`)

  return { decision: 'allow', gate: 'resolve', code: 'OK', reason: `allowed at ${effectiveLevel}: ${p.capability} in scope, holder verified, warrant re-derived`, checks, ...base }
}

function safeThumbprint(jwk: Ed25519PublicJwk): string | null {
  try {
    return agentThumbprint(jwk)
  } catch {
    return null
  }
}
