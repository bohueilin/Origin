// Type declarations for license-policy.mjs — the deterministic earned-license policy.

export const LICENSE_POLICY_VERSION: string
export const LICENSE_ORDER: ['L0', 'L1', 'L2', 'L3', 'L4']
export type LicenseLevelId = 'L0' | 'L1' | 'L2' | 'L3' | 'L4'

export function levelRank(id: LicenseLevelId): number

export interface Verdict {
  passed: boolean
  reward: number
  catastrophic: boolean
  scenario_id?: string
  split?: 'train' | 'heldout' | null
}

export interface BaseDerivation {
  level: LicenseLevelId
  episodes: number
  passes: number
  passRate: number
  avgReward: number
  catastrophicCount: number
}

export function deriveBaseLevel(verdicts: Verdict[]): BaseDerivation

export interface WarrantDerivation {
  level: LicenseLevelId
  base_level: LicenseLevelId
  episodes: number
  passes: number
  passRate: number
  avgReward: number
  catastrophicCount: number
  distinctScenarios: number
  hasHeldout: boolean
  caps: string[]
  policy_version: string
  params: { minDistinctForL3: number; requireHeldoutForL3: boolean }
}

export interface WarrantLevelOpts {
  minDistinctForL3?: number
  requireHeldoutForL3?: boolean
}

export function deriveWarrantLevel(backing: Verdict[], opts?: WarrantLevelOpts): WarrantDerivation
