// Type surface for rlkit/sigil.mjs — the portable, offline-verifiable signed receipt.
// Hand-written declarations (the runtime is plain .mjs, shared with Node CLIs + vitest).

export interface Sigil {
  sigil_schema_version: string
  issuer: string
  kind: string
  alg: 'ES256'
  payload: unknown
  payload_digest: string
  pubkey_jwk: JsonWebKey
  thumbprint: string
  signature: string
  signed_at: string | null
}

/** Codes: 0 valid · 1 payload tampered · 2 signature invalid · 3 wrong signer · 4 malformed. */
export interface SigilVerdict {
  ok: boolean
  code: 0 | 1 | 2 | 3 | 4
  reason: string
}

export function generateSigningKey(): Promise<CryptoKeyPair>
export function keyThumbprint(pubkeyJwk: JsonWebKey): Promise<string>
export function signSigil(
  payload: unknown,
  keyPair: CryptoKeyPair,
  opts?: { issuer?: string; kind?: string; signed_at?: string | null },
): Promise<Sigil>
export function verifySigil(sigil: Sigil, opts?: { expectedThumbprint?: string }): Promise<SigilVerdict>
