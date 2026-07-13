// Type surface for gymHardening.mjs — the self-hardening environment (the moat's core).
import type { IamTask } from './iamGym.mjs'

export type Decision = 'allow' | 'deny' | 'escalate'
export type PolicyFor = (task: IamTask) => Decision

export interface BatteryScore {
  passRate: number
  catastrophic: number
  n: number
}
export interface AdversarialPolicy {
  name: string
  policy: PolicyFor
}
export interface RobustnessResult {
  caught: number
  total: number
  robustness: number
}
export interface Hole {
  task: IamTask
  caught_policy: string
}
export interface LedgerEntry {
  task_id: string
  oracle_label: Decision
  reason: string
  surfaced_by: string
  source: string
  battery_digest_after: string | null
}
export interface HardenResult {
  battery: IamTask[]
  ledger: LedgerEntry[]
  added: string[]
  digest: string
  version: string
}
export interface RoundResult {
  before: RobustnessResult
  after: RobustnessResult
  holes_found: number
  added: string[]
  battery: IamTask[]
  ledger: LedgerEntry[]
  digest_before: string
  digest_after: string
  version_after: string
}
export interface CurvePoint {
  round: number
  robustness_before: number
  robustness_after: number
  holes_found: number
  battery_size: number
  digest_after: string
}
export interface FixedPointResult {
  battery: IamTask[]
  ledger: LedgerEntry[]
  curve: CurvePoint[]
  final_robustness: number
  final_digest: string
  version: string
}

export function batteryDigest(battery: IamTask[]): string
export function scoreOnBattery(battery: IamTask[], policyFor: PolicyFor): BatteryScore
export function overGrantFamily(): AdversarialPolicy[]
export function probePool(): IamTask[]
export function findHoles(battery: IamTask[], probes: IamTask[], family?: AdversarialPolicy[], limit?: number): Hole[]
export function hardenBattery(
  battery: IamTask[],
  holes: Hole[],
  opts?: { source?: string; priorLedger?: LedgerEntry[] },
): HardenResult
export function gymRobustness(battery: IamTask[], family?: AdversarialPolicy[]): RobustnessResult
export function runHardeningRound(
  battery: IamTask[],
  probes?: IamTask[],
  family?: AdversarialPolicy[],
  opts?: { source?: string; priorLedger?: LedgerEntry[]; limit?: number },
): RoundResult
export function hardenToFixedPoint(
  seedBattery: IamTask[],
  probes?: IamTask[],
  family?: AdversarialPolicy[],
  maxRounds?: number,
  limit?: number,
): FixedPointResult
