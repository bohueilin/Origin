// Type surface for rlkit/crucible.mjs — the config-bound agent credential ("reference check").

export interface CrucibleCredential {
  credential_schema_version: string
  subject: string
  agent_config: unknown
  config_digest: string
  env_bundle_digest: string
  verifier_version: string
  reward_model_version: string
  rsl_level: string
  n_tasks: number
  cold_pass_rate: number
  pass_rate: number
  lift: number
  receipt_digests: string[]
  issued_at: string | null
  reproducibility: string
  credential_digest: string
}

export type CheckLine = ['PASS' | 'FAIL', string]

export function configDigest(agentConfig: unknown): string
export function computeLift(coldPassRate: number, harnessedPassRate: number): number
export function mintCredential(args: {
  agentConfig: unknown
  envBundleDigest: string
  versions: { verifier_version: string; reward_model_version: string }
  rslLevel: string
  nTasks: number
  coldPassRate: number
  harnessedPassRate: number
  receiptDigests: string[]
  issuedAt?: string | null
}): CrucibleCredential
/** Codes: 0 valid · 3 credential tamper · 4 config/env/verifier drift → VOID. */
export function verifyCredential(args: {
  credential: CrucibleCredential
  liveConfig?: unknown
  envBundleDigest?: string
  versions?: { verifier_version: string }
}): { code: number; checks: CheckLine[] }
