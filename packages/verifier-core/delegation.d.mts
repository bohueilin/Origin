// Type surface for delegation.mjs — offline attenuated, macaroon-style, Ed25519-signed delegation.
// Hand-written declarations (the runtime is plain .mjs, shared with Node CLIs + vitest).

/** An Ed25519 public JWK (RFC 8037 OKP); the private form adds `d`. */
export interface Ed25519PublicJwk {
  kty: 'OKP'
  crv: 'Ed25519'
  x: string
}
export interface Ed25519PrivateJwk extends Ed25519PublicJwk {
  d: string
}

/**
 * Monotonic-narrowing restrictions. Every dimension is OPTIONAL; an omitted dimension inherits
 * the parent's. A present dimension may only ever NARROW the parent's:
 *   tools/capabilities — child's set ⊆ parent's · path_prefix — child extends parent's subtree ·
 *   budget/ttl_ms — child <= parent · max_depth — decrements each hop · audience — cannot retarget.
 */
export interface Caveats {
  tools?: string[]
  capabilities?: string[]
  path_prefix?: string
  budget?: number
  ttl_ms?: number
  max_depth?: number
  audience?: string
}

/** The effective (intersected) caveats at a point in the chain. null = unbounded / no restriction. */
export interface EffectiveCaveats {
  tools: string[] | null
  capabilities: string[] | null
  path_prefix: string
  budget: number | null
  ttl_ms: number | null
  max_depth: number | null
  audience: string | null
}

/** A signed, self-verifying delegation certificate — one hop of attenuated authority. */
export interface DelegationCert {
  delegation_schema_version: string
  v: string
  parent_thumbprint: string
  child_thumbprint: string
  caveats: Caveats
  /** Links to the prior cert's cert_digest, or the root Warrant's warrant_digest. */
  parent_delegation_digest: string | null
  /** 1-based hop index (root Warrant = 0, first delegation = 1, ...). */
  depth: number
  issued_at: number | null
  /** The parent's public key rides along; verify still checks its thumbprint == parent_thumbprint. */
  parent_public_jwk: Ed25519PublicJwk
  /** sha256 of the canonical cert content, excluding cert_digest + parent_signature. */
  cert_digest: string
  /** The parent's Ed25519 signature over { cert_digest }. */
  parent_signature: string
}

/** Deny codes. 0 valid · 1 tampered · 2 bad parent sig · 3 scope escalation · 4 depth exceeded ·
 *  5 broken link · 6 wrong audience · 7 malformed. */
export type DelegationDenyCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

export const DELEGATION_SCHEMA_VERSION: string
export const COUNTERSIGN_DELEGATION_VERSION: string
export const DELEGATION_DENY: {
  readonly VALID: 0
  readonly TAMPERED: 1
  readonly BAD_PARENT_SIG: 2
  readonly SCOPE_ESCALATION: 3
  readonly DEPTH_EXCEEDED: 4
  readonly BROKEN_LINK: 5
  readonly WRONG_AUDIENCE: 6
  readonly MALFORMED: 7
}

/** Ok / reason marker for a caveats structural check. */
export interface CaveatValidation {
  ok: boolean
  reason?: string
}
export function validateCaveats(caveats: Caveats | null | undefined): CaveatValidation

/** Result of intersecting two caveat sets: the narrower of each, or an escalation marker. */
export type IntersectResult =
  | { ok: true; effective: EffectiveCaveats }
  | {
      ok: false
      escalation: true
      dimension: 'tools' | 'capabilities' | 'path_prefix' | 'budget' | 'ttl_ms' | 'max_depth' | 'audience'
      reason: string
    }

/** The monotonic-narrowing kernel: effective = the narrower of each dimension, or an escalation marker. */
export function intersectCaveats(parent: Caveats | EffectiveCaveats | null | undefined, child: Caveats | null | undefined): IntersectResult

export interface MintDelegationInput {
  parentThumbprint?: string
  parentPrivateJwk: Ed25519PrivateJwk
  childThumbprint: string
  caveats?: Caveats
  parentDelegationDigest?: string | null
  depth?: number
  issuedAt?: number | null
}
export function mintDelegation(input: MintDelegationInput): DelegationCert

/** A minimal root Warrant view — only the anchor fields verifyDelegationChain reads. */
export interface RootWarrantAnchor {
  agent_thumbprint: string
  warrant_digest?: string
  license_level?: string
  [k: string]: unknown
}

export interface VerifyDelegationOpts {
  rootWarrant?: RootWarrantAnchor
  rootThumbprint?: string
  rootDelegationDigest?: string
  rootCaveats?: Caveats
  publicJwks?: Record<string, Ed25519PublicJwk>
  maxDepth?: number
  expectedAudience?: string
}

export interface DelegationVerdict {
  ok: boolean
  code: DelegationDenyCode
  reason: string
  effectiveCaveats: EffectiveCaveats | null
  depth: number | null
  checks: Array<['PASS' | 'FAIL', string]>
}

export function verifyDelegationChain(
  chain: Array<RootWarrantAnchor | DelegationCert> | DelegationCert[],
  opts?: VerifyDelegationOpts,
): DelegationVerdict

export interface EffectiveCeilingInput {
  warrantLevel?: string
  chain: Array<RootWarrantAnchor | DelegationCert> | DelegationCert[]
  opts?: VerifyDelegationOpts
}
export interface EffectiveCeiling {
  ok: boolean
  code: DelegationDenyCode
  reason: string
  governingLevel: string | null
  levelRank: number | null
  effectiveCaveats: EffectiveCaveats | null
  depth: number | null
}
export function effectiveCeiling(input: EffectiveCeilingInput): EffectiveCeiling
