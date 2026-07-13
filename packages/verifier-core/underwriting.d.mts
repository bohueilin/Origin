// Type surface for underwriting.mjs — the deterministic risk signal for agent insurance.
import type { CrucibleCredential } from './crucible.mjs'

export type RiskBand = 'A' | 'B' | 'C' | 'D' | 'E'

export interface UnderwritingSignal {
  underwriting_schema_version: string
  credential_digest: string
  config_digest: string
  rsl_level: string
  risk_score: number
  risk_band: RiskBand
  factors: {
    rsl_level: string
    pass_rate: number
    cold_pass_rate: number
    lift: number
    n_tasks: number
    catastrophic_signal: boolean
  }
  voids_on: string
  basis: string
}

export interface UnderwritingVerdict {
  ok: boolean
  code: number
  checks: [string, string][]
}

export function riskScore(credential: CrucibleCredential): number
export function riskBand(score: number): RiskBand
export function underwriteCredential(credential: CrucibleCredential): UnderwritingSignal
export function verifyUnderwriting(signal: UnderwritingSignal, credential: CrucibleCredential): UnderwritingVerdict
