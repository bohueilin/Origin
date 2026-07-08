// Type surface for env-manifest.mjs — pure, verifier-agnostic content addressing
// for the pinned env-surface sub-artifacts (tools[] + policies[]) of an
// EnvironmentBundle (P1) and the authorization projection (P3).
// Hand-written declarations; keep in lockstep with env-manifest.mjs.

export interface ToolSpec {
  name: string
  version?: string
  actions: readonly string[]
}

/** JSON-Schema fragment admitting exactly the tool's concrete actions. */
export interface ToolInputSchema {
  type: string
  additionalProperties: boolean
  required: string[]
  properties: { action: { enum: string[] } }
}

export interface ToolSchemaEntry {
  name: string
  version: string
  schema: ToolInputSchema
  schema_digest: string
}

/** Bundle-shaped tool entry — P1 pin ({name, schema_digest, version}); P3 adds
 *  {scope, rate_limit} onto these SAME entries (never a parallel array). */
export interface BundleToolEntry {
  name: string
  schema_digest: string
  version: string
  scope?: string
  rate_limit?: { capacity: number; refill_per_step: number }
  [key: string]: unknown
}

/** A policy pins a human-readable statement AND the sha256 of its implementing source. */
export interface PolicyEntry {
  id: string
  kind: string
  statement: string
  source_ref: string
  source_digest: string
  digest: string
}

export function toolInputSchema(actions: readonly string[]): ToolInputSchema
export function buildToolSchemas(specs: readonly ToolSpec[]): ToolSchemaEntry[]
export function toBundleTools(tools: readonly ToolSchemaEntry[]): BundleToolEntry[]
/** Order-independent rollup over the bundle tool entries (folds every field present). */
export function toolsDigest(tools: readonly BundleToolEntry[]): string

export const SAFETY_GATE_STATEMENT: string
export const LICENSE_LADDER_STATEMENT: string

/** `safetyGateSrc` / `licenseSrc` are the SOURCE STRINGS of the implementing files. */
export function buildPolicies(args: { safetyGateSrc: string; licenseSrc: string }): PolicyEntry[]
export function policiesDigest(policies: readonly PolicyEntry[]): string

/** registry_digest (P3): the authorization projection — (name, scope, rate_limit) sorted by name. */
export function registryDigest(
  tools: ReadonlyArray<{ name: string; scope?: string; rate_limit?: unknown }>,
): string
