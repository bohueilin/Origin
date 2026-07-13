// Countersign — the identity primitive: a key IS the agent.
// =============================================================================
// Clean-room. Inspired by the agent-identity cohort's proof-of-possession credentials
// (kushDCFS Agent Passport, aboard macaroons) — no code copied; see docs/PRIOR_ART.md.
//
// The load-bearing idea Countersign adds to Origin: an agent is not a free string.
// An agent is an Ed25519 keypair. Its id (thumbprint) is DERIVED from its public key —
// so no agent can claim another's name (the thumbprint wouldn't match), and no thief can
// exercise a stolen credential (it can't produce the possession signature). Authority is
// bound to a key the agent itself holds, and only ever the key.
//
// Ed25519 (not ECDSA/P-256 like Sigil) because: deterministic signatures (no per-sign RNG
// to get wrong), small keys, and node:crypto one-shot sync sign/verify — so the whole gate
// stays synchronous and deterministic, exactly like the rest of the Origin engine.
//
// Reuses `canonical` + `sha256` from @origin/evidence, so an agent thumbprint is the SAME
// content-address primitive the rest of the evidence stack already trusts. The public-key
// JWK follows RFC 8037 (OKP / Ed25519); the thumbprint follows RFC 7638 (lexicographic
// members {crv,kty,x}). Two different keys → two different thumbprints; the same key → the
// same thumbprint on every machine, forever.
//
// Honest scope: this proves POSSESSION of a key and INTEGRITY of what it signed. It does
// NOT bind the key to a real-world human/operator — that is a separate PKI/attestation
// concern (see docs/architecture/COUNTERSIGN.md → "Sybil & operator binding").
// =============================================================================

import { canonical, sha256 } from '@origin/evidence/env-evidence'
import { generateKeyPairSync, sign as nodeSign, verify as nodeVerify, createPublicKey, createPrivateKey } from 'node:crypto'

export const COUNTERSIGN_IDENTITY_VERSION = 'countersign-id-v1'

const enc = new TextEncoder()

// ---- base64url (no padding), Node Buffer-free so it also runs in a browser bundle ----
function bytesToB64Url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64UrlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * Generate a fresh Ed25519 agent identity.
 * Returns portable JWKs: publicJwk = {kty:'OKP', crv:'Ed25519', x}; privateJwk adds `d`.
 * The private JWK never has to leave the process that generated it.
 */
export function generateAgentKey() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const publicJwk = publicKey.export({ format: 'jwk' })
  const privateJwk = privateKey.export({ format: 'jwk' })
  return { publicJwk, privateJwk, thumbprint: agentThumbprint(publicJwk) }
}

/**
 * RFC 7638 / RFC 8037 thumbprint of an Ed25519 public key: sha256 over the canonical
 * JSON of exactly {crv, kty, x}. This is the agent_id. Deterministic and machine-independent.
 */
export function agentThumbprint(publicJwk) {
  if (!publicJwk || publicJwk.kty !== 'OKP' || publicJwk.crv !== 'Ed25519' || typeof publicJwk.x !== 'string') {
    throw new Error('agentThumbprint: expected an Ed25519 OKP public JWK {kty,crv,x}')
  }
  // RFC 7638 requires exactly these members, lexicographically ordered; canonical() sorts keys.
  return sha256(canonical({ crv: publicJwk.crv, kty: publicJwk.kty, x: publicJwk.x }))
}

function toKeyObject(jwk, kind) {
  return kind === 'private'
    ? createPrivateKey({ key: jwk, format: 'jwk' })
    : createPublicKey({ key: jwk, format: 'jwk' })
}

/**
 * Sign a payload with an agent's private key. The signature covers the payload's
 * content-address (sha256 of canonical JSON) — so a signature is bound to exact content;
 * flip one byte and verification fails. Returns a base64url detached signature.
 */
export function signPayload(payload, privateJwk) {
  const digest = sha256(canonical(payload))
  const sig = nodeSign(null, enc.encode(digest), toKeyObject(privateJwk, 'private'))
  return bytesToB64Url(sig)
}

/**
 * Verify a detached signature over `payload` with a public JWK. Returns boolean.
 * Recomputes the content-address, so it catches both payload tampering and a wrong key.
 */
export function verifyPayload(payload, signatureB64Url, publicJwk) {
  try {
    const digest = sha256(canonical(payload))
    return nodeVerify(null, enc.encode(digest), toKeyObject(publicJwk, 'public'), b64UrlToBytes(signatureB64Url))
  } catch {
    return false
  }
}

/**
 * Proof-of-possession over a request: an agent proves it holds the key bound to its
 * thumbprint by signing {agent, route, body_digest, nonce, iat}. The gate verifies the
 * signature AND that agentThumbprint(publicJwk) === claimed agent — closing name-squatting.
 * `nonce` is single-use (burned by the caller's nonce store) to stop replay.
 */
export function buildPopChallenge({ agentThumbprint: agent, route, body, nonce, iat }) {
  return { v: COUNTERSIGN_IDENTITY_VERSION, agent, route, body_digest: sha256(canonical(body ?? null)), nonce, iat }
}

/**
 * Verify a proof-of-possession. Returns { ok, code, reason }.
 *   0 ok · 1 thumbprint mismatch (key doesn't own the claimed id) · 2 bad signature ·
 *   3 route/body mismatch · 4 malformed.
 * The nonce/iat freshness check is the caller's (nonceStore) — this is the pure crypto half.
 */
export function verifyPop({ challenge, signatureB64Url, publicJwk, expectRoute, body }) {
  if (!challenge || typeof challenge !== 'object' || !publicJwk) return { ok: false, code: 4, reason: 'malformed PoP' }
  let derived
  try {
    derived = agentThumbprint(publicJwk)
  } catch {
    return { ok: false, code: 4, reason: 'public key is not a valid Ed25519 JWK' }
  }
  if (derived !== challenge.agent) {
    return { ok: false, code: 1, reason: 'key does not own the claimed agent id (thumbprint mismatch)' }
  }
  if (expectRoute !== undefined && challenge.route !== expectRoute) {
    return { ok: false, code: 3, reason: `PoP route ${challenge.route} != expected ${expectRoute}` }
  }
  if (body !== undefined && challenge.body_digest !== sha256(canonical(body ?? null))) {
    return { ok: false, code: 3, reason: 'PoP body_digest does not match the presented body' }
  }
  if (!verifyPayload(challenge, signatureB64Url, publicJwk)) {
    return { ok: false, code: 2, reason: 'PoP signature invalid for this key' }
  }
  return { ok: true, code: 0, reason: 'possession proven; key owns the claimed agent id' }
}

export const _internal = { bytesToB64Url, b64UrlToBytes }
