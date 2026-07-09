// Type declarations for countersign-identity.mjs — Ed25519 agent identity.

export const COUNTERSIGN_IDENTITY_VERSION: string

export interface Ed25519PublicJwk {
  kty: 'OKP'
  crv: 'Ed25519'
  x: string
}
export interface Ed25519PrivateJwk extends Ed25519PublicJwk {
  d: string
}

export interface AgentKey {
  publicJwk: Ed25519PublicJwk
  privateJwk: Ed25519PrivateJwk
  thumbprint: string
}

export function generateAgentKey(): AgentKey
export function agentThumbprint(publicJwk: Ed25519PublicJwk): string
export function signPayload(payload: unknown, privateJwk: Ed25519PrivateJwk): string
export function verifyPayload(payload: unknown, signatureB64Url: string, publicJwk: Ed25519PublicJwk): boolean

export interface PopChallenge {
  v: string
  agent: string
  route: string
  body_digest: string
  nonce: string
  iat: number
}

export function buildPopChallenge(input: {
  agentThumbprint: string
  route: string
  body?: unknown
  nonce: string
  iat: number
}): PopChallenge

export interface PopResult {
  ok: boolean
  code: 0 | 1 | 2 | 3 | 4
  reason: string
}

export function verifyPop(input: {
  challenge: PopChallenge
  signatureB64Url: string
  publicJwk: Ed25519PublicJwk
  expectRoute?: string
  body?: unknown
}): PopResult

export const _internal: {
  bytesToB64Url(buf: Uint8Array | ArrayBuffer): string
  b64UrlToBytes(s: string): Uint8Array
}
