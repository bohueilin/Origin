// Type surface for proofCarryingPolicy.mjs — hash-chained, proof-carrying policy versions.

export interface PolicyVersion {
  policy_schema_version: string
  version: number
  parent_digest: string
  rules: Record<string, unknown>
  author?: string
  reason?: string
  at?: string | null
  digest: string
}

export interface BoundDecision {
  decision: unknown
  policy_digest: string
  policy_version: number
  decided_under: string
}

export function policyVersionDigest(version: PolicyVersion): string
export function createPolicy(
  rules: Record<string, unknown>,
  meta?: { author?: string; reason?: string; at?: string | null },
): PolicyVersion
export function amendPolicy(
  prev: PolicyVersion,
  rules: Record<string, unknown>,
  meta?: { author?: string; reason?: string; at?: string | null },
): PolicyVersion
export function verifyPolicyChain(versions: PolicyVersion[]): { ok: boolean; reason: string; head?: string }
export function bindDecision(policyVersion: PolicyVersion, decision: unknown): BoundDecision
export function verifyDecisionUnderPolicy(
  boundDecision: BoundDecision,
  policyVersion: PolicyVersion,
): { ok: boolean; reason: string }
