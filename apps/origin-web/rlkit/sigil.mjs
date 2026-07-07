// Sigil — the shareable, browser-signed receipt.
// =============================================================================
// A Sigil turns any Origin evidence artifact (a trace's final_digest, a ScoreReceipt,
// a Crucible credential) into a PORTABLE, self-verifying JSON blob that a third party
// can check WITHOUT trusting our server:
//
//   • the signature is over the payload's content-address (sha256 of canonical JSON),
//     so a Sigil is bound to exact content — flip one byte and it voids;
//   • the signer's PUBLIC key travels inside the Sigil (JWK), so anyone can verify
//     offline; the PRIVATE key never leaves the signer (a browser via Web Crypto);
//   • an optional issuer thumbprint lets a verifier pin "signed by THIS key" so a
//     valid-but-wrong-signer Sigil is rejected.
//
// Universal: uses Web Crypto (`crypto.subtle`) + base64 that runs identically in
// Node ≥18 and the browser — the same `signSigil` code path a claude.ai page would use.
// Reuses the exact `canonical` + `sha256` from env-evidence.mjs, so a Sigil's
// payload_digest is the SAME content-address the rest of rlkit already trusts.
//
// Honest scope: this proves INTEGRITY + AUTHENTICITY of a receipt (it wasn't altered,
// and this key signed it). It does NOT by itself prove the key belongs to a real-world
// identity — that binding is a separate PKI/attestation concern, out of scope here.
// =============================================================================

import { canonical, sha256 } from './env-evidence.mjs'

const SUBTLE = globalThis.crypto?.subtle
const KEY_ALG = { name: 'ECDSA', namedCurve: 'P-256' }
const SIGN_ALG = { name: 'ECDSA', hash: 'SHA-256' } // ES256

const enc = new TextEncoder()

// Universal base64 (no Node Buffer dependency) — btoa/atob exist in Node ≥18 and browsers.
function bytesToB64(buf) {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
function b64ToBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function requireSubtle() {
  if (!SUBTLE) throw new Error('Web Crypto (crypto.subtle) unavailable — Sigil needs a secure context (Node ≥18 or a browser).')
  return SUBTLE
}

/** Generate a fresh ECDSA P-256 signing keypair. In the browser, keep the key non-extractable. */
export async function generateSigningKey() {
  return requireSubtle().generateKey(KEY_ALG, true, ['sign', 'verify'])
}

/**
 * A stable public-key thumbprint (an issuer id): sha256 over the RFC-7638 EC members.
 * Two different keys → different thumbprints; the same key → the same thumbprint every time.
 */
export async function keyThumbprint(pubkeyJwk) {
  // RFC 7638 requires exactly these members, in lexicographic order, for an EC key.
  const members = { crv: pubkeyJwk.crv, kty: pubkeyJwk.kty, x: pubkeyJwk.x, y: pubkeyJwk.y }
  return sha256(canonical(members))
}

/**
 * Sign a payload → a portable Sigil. The signature covers the payload's content-address
 * (sha256 of canonical JSON), so the Sigil is bound to exact content.
 *
 * @param payload  any JSON-serializable evidence (a digest string, a receipt, a credential)
 * @param keyPair  a CryptoKeyPair from generateSigningKey()
 * @param opts     { issuer?, kind?, signed_at? } — signed_at is caller-supplied (no wall-clock here)
 */
export async function signSigil(payload, keyPair, opts = {}) {
  const subtle = requireSubtle()
  const payload_digest = sha256(canonical(payload))
  const signature = await subtle.sign(SIGN_ALG, keyPair.privateKey, enc.encode(payload_digest))
  const pubkey_jwk = await subtle.exportKey('jwk', keyPair.publicKey)
  return {
    sigil_schema_version: '1.0.0',
    issuer: opts.issuer ?? 'origin',
    kind: opts.kind ?? 'receipt',
    alg: 'ES256',
    payload,
    payload_digest,
    pubkey_jwk,
    thumbprint: await keyThumbprint(pubkey_jwk),
    signature: bytesToB64(signature),
    signed_at: opts.signed_at ?? null,
  }
}

/**
 * Verify a Sigil, offline, with only the Sigil itself:
 *   1) recompute the content-address and confirm it matches payload_digest (integrity);
 *   2) verify the signature over that digest with the EMBEDDED public key (authenticity);
 *   3) optionally require the signer to be a pinned issuer (expectedThumbprint).
 *
 * Returns { ok, code, reason }. Codes: 0 valid · 1 payload tampered · 2 signature invalid ·
 * 3 wrong signer (thumbprint pin failed) · 4 malformed Sigil.
 */
export async function verifySigil(sigil, opts = {}) {
  if (!sigil || typeof sigil !== 'object' || !sigil.pubkey_jwk || !sigil.signature || typeof sigil.payload_digest !== 'string') {
    return { ok: false, code: 4, reason: 'malformed Sigil (missing payload_digest, pubkey, or signature)' }
  }
  // 1) integrity — does the payload still hash to the digest that was signed?
  if (sha256(canonical(sigil.payload)) !== sigil.payload_digest) {
    return { ok: false, code: 1, reason: 'payload was altered — content no longer matches the signed digest' }
  }
  // 2) authenticity — verify the signature with the key that travels in the Sigil.
  const subtle = requireSubtle()
  let pub
  try {
    pub = await subtle.importKey('jwk', sigil.pubkey_jwk, KEY_ALG, true, ['verify'])
  } catch {
    return { ok: false, code: 4, reason: 'malformed Sigil (public key is not a valid P-256 JWK)' }
  }
  const valid = await subtle.verify(SIGN_ALG, pub, b64ToBytes(sigil.signature), enc.encode(sigil.payload_digest))
  if (!valid) return { ok: false, code: 2, reason: 'signature is invalid for this payload + key' }
  // 3) optional issuer pin — reject a valid signature from an unexpected signer.
  if (opts.expectedThumbprint) {
    const t = await keyThumbprint(sigil.pubkey_jwk)
    if (t !== opts.expectedThumbprint) {
      return { ok: false, code: 3, reason: 'signed by an unexpected key (issuer thumbprint mismatch)' }
    }
  }
  return { ok: true, code: 0, reason: 'valid — content intact and signed by the embedded key' }
}
