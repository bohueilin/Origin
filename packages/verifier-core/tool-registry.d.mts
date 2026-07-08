// Type surface for tool-registry.mjs — scoped, deterministically rate-limited
// tool authorization (P3). Fail-closed: a call is authorized BEFORE it runs.
// Hand-written declarations; keep in lockstep with tool-registry.mjs.

export { registryDigest } from '@origin/evidence/env-manifest'

export interface RateLimit {
  capacity: number
  refill_per_step: number
}

export interface RegistryTool {
  name: string
  scope: string
  rate_limit: RateLimit
  version?: string
  schema_digest?: string | null
  [key: string]: unknown
}

export interface ToolGrant {
  tool_scopes: readonly string[]
}

export type AuthzVerdictKind = 'allow' | 'deny_scope' | 'deny_rate' | 'unknown_tool'

export interface AuthzVerdict {
  verdict: AuthzVerdictKind
  allow: boolean
  scope: string | null
}

/** Deterministic token bucket — `step` is a call index, never wall-clock. */
export interface TokenBucket {
  tryConsume(step: number): boolean
  peek(): number
}
export function makeBucket(capacity: number, refillPerStep: number): TokenBucket

export interface ToolRegistry {
  readonly tools: readonly RegistryTool[]
  has(name: string): boolean
  get(name: string): RegistryTool | undefined
  /** Authorize a single call at call-index `step`. Fail-closed + deterministic. */
  authorize(name: string, grant: ToolGrant, step: number): AuthzVerdict
}
export function buildRegistry(tools: readonly RegistryTool[]): ToolRegistry
