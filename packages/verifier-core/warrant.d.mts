// Type declarations for warrant.mjs — the earned, key-bound, re-derivable authority credential.

import type { Ed25519PublicJwk, Ed25519PrivateJwk } from './countersign-identity.d.mts'
import type { LicenseLevelId, WarrantDerivation, WarrantLevelOpts } from './license-policy.d.mts'

export const WARRANT_SCHEMA_VERSION: string

export interface BackingRow {
  agent_seq: number
  trace_id?: string | null
  audit_row_digest: string
  scenario_id: string
  split?: 'train' | 'heldout' | null
  passed: boolean
  reward: number
  catastrophic: boolean
}

export interface Warrant {
  warrant_schema_version: string
  subject: 'agent'
  agent_thumbprint: string
  license_level: LicenseLevelId
  derivation: WarrantDerivation
  license_policy_version: string
  verifier_version: string | null
  reward_model_version: string | null
  environment_name: string | null
  capability_manifest_digest: string | null
  backing: BackingRow[]
  chain_head: string
  n_episodes: number
  issuer_thumbprint: string | null
  epoch: number
  issued_at: number | null
  freshness_window_ms: number | null
  reproducibility: string
  warrant_digest: string
  issuer_signature: string | null
}

export function foldAgentChain(backing: BackingRow[]): { ok: boolean; head: string | null; reason: string }

export function mintWarrant(input: {
  agentThumbprint: string
  backing: BackingRow[]
  versions?: { verifier_version?: string; reward_model_version?: string; environment_name?: string }
  capabilityManifestDigest?: string | null
  issuerPrivateJwk?: Ed25519PrivateJwk | null
  issuerThumbprint?: string | null
  issuedAt?: number | null
  epoch?: number
  freshnessWindowMs?: number | null
  policyOpts?: WarrantLevelOpts
}): Warrant

export interface VerifyWarrantOpts {
  issuerPublicJwk?: Ed25519PublicJwk
  expectedIssuerThumbprint?: string
  capabilityManifestDigest?: string
  now?: number
  minEpoch?: number
}

export interface VerifyWarrantResult {
  ok: boolean
  code: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
  level: LicenseLevelId | null
  reason: string
  checks: Array<['PASS' | 'FAIL', string]>
}

export function verifyWarrant(warrant: Warrant, opts?: VerifyWarrantOpts): VerifyWarrantResult
