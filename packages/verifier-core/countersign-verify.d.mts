// Type surface for countersign-verify.mjs — the offline Countersign bundle verifier.
// Hand-written declarations (the runtime is plain .mjs, shared with Node CLIs + vitest).

/** A [PASS|FAIL, message] check line, as produced by verifyWarrant. */
export type CheckLine = [tag: 'PASS' | 'FAIL', message: string]

/** An Ed25519 OKP public JWK (RFC 8037) as carried by a bundle's issuer. */
export interface PublicJwk {
  kty: 'OKP'
  crv: 'Ed25519'
  x: string
  [k: string]: unknown
}

/** The exported bundle shape verifyBundle consumes. */
export interface CountersignBundle {
  bundle_schema_version: string
  issuer: { public_jwk: PublicJwk; thumbprint: string }
  /** Earned, key-bound, re-derivable authority credentials (see warrant.mjs). */
  warrants: unknown[]
  /** Optional delegation chains ([rootWarrant?, cert, ...] each); verified only if a
   *  delegation verifier is available (else the chain fails closed). */
  delegations?: unknown[][]
  /** Optional verification pins carried by the bundle itself. */
  pinned?: {
    capability_manifest_digest?: string
    min_epoch?: number
    now?: number
    audience?: string
    max_delegation_depth?: number
  }
}

/** Per-credential verification result. `code` is the underlying verifyWarrant code (0..7). */
export interface BundleItemResult {
  kind: 'bundle' | 'issuer' | 'warrant' | 'delegation'
  subject: string | null
  ok: boolean
  code: number
  reason: string
  checks: CheckLine[]
  /** Present on warrant results: the re-derived license level, or null on failure. */
  level?: string | null
}

export interface BundleSummary {
  bundle_schema_version: string | null
  issuer_thumbprint: string | null
  total: number
  passed: number
  failed: number
  warrants: number
  delegations: number
  exitCode: number
  verdict: 'VALID' | 'REJECTED'
  headline: string
}

export interface BundleVerdict {
  ok: boolean
  /** Process exit code: 0 OK · 2 INTEGRITY · 3 AUTHORITY (most-severe class of all parts). */
  exitCode: number
  results: BundleItemResult[]
  summary: BundleSummary
}

/** A delegation-chain verifier (verifyDelegationChain), if the optional module is present. */
export type DelegationVerifier = (
  chain: unknown[],
  opts: { expectedAudience?: string; maxDepth?: number },
) => { ok: boolean; code: number; reason: string; checks?: CheckLine[] }

export interface VerifyBundleOptions {
  capabilityManifestDigest?: string
  minEpoch?: number
  now?: number
  delegationVerifier?: DelegationVerifier
}

export const BUNDLE_SCHEMA_VERSION: string

/** Process exit classes: OK=0, INTEGRITY=2, AUTHORITY=3. */
export const EXIT: Readonly<{ OK: 0; INTEGRITY: 2; AUTHORITY: 3 }>

/** Map a warrant/issuer verdict code (0..7) to its process exit class. Unknown → INTEGRITY. */
export function exitForCode(code: number): number

/** Map a delegation verdict code (DELEGATION_DENY) to its process exit class. The integrity/
 *  authority split differs from warrants (5 broken-link → integrity, 4 depth → authority). */
export function exitForDelegationCode(code: number): number

/** Verify an exported bundle fully offline (synchronous; warrant path is the core). */
export function verifyBundle(bundle: CountersignBundle, opts?: VerifyBundleOptions): BundleVerdict

/** Async wrapper: lazily loads the optional delegation module if the bundle needs it. */
export function verifyBundleWithDelegations(
  bundle: CountersignBundle,
  opts?: VerifyBundleOptions,
): Promise<BundleVerdict>

/** Render a verdict as a multi-line human report with PASS/FAIL lines per check. */
export function formatReport(result: BundleVerdict): string
