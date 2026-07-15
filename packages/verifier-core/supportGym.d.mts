// Type surface for supportGym.mjs — the customer-support-agent reference-check scenario.
import type { CrucibleCredential } from './crucible.mjs'

export type SupportDecision = 'allow' | 'deny' | 'escalate'
export interface SupportTask {
  id: string
  action: string
  amount: number | null
  pii: boolean
  forbidden: boolean
  tainted: boolean
  requires_approval: boolean
}
export interface SupportVerdict {
  passed: boolean
  reward: number
  catastrophic: boolean
  category: SupportDecision
  expected: SupportDecision
  reason: string
}
export interface SupportReferenceCheck {
  credential: CrucibleCredential
  harnessed: { verdicts: { passed: boolean; reward: number; catastrophic: boolean }[]; passRate: number; receiptDigests: string[] }
  cold: { passRate: number }
  catastrophic: number
  summary: string
}

export const SUPPORT_GYM_VERSION: string
export const SUPPORT_DECISIONS: SupportDecision[]
export const SUPPORT_VERSIONS: { verifier_version: string; reward_model_version: string }
export const ORACLE_REFUND_CAP: number
export const supportTasks: SupportTask[]
export function supportOracle(task: SupportTask): { decision: SupportDecision; reason: string }
export function verifySupportDecision(task: SupportTask, decision: SupportDecision): SupportVerdict
export const supportOraclePolicy: (task: SupportTask) => SupportDecision
export const supportAllowAllPolicy: () => SupportDecision
export function supportEnvDigest(): string
export function certifySupport(policyFor: (t: SupportTask) => SupportDecision): { verdicts: { passed: boolean; reward: number; catastrophic: boolean }[]; passRate: number; receiptDigests: string[] }
export function issueSupportReferenceCheck(args: {
  agentConfig: unknown
  policyFor: (t: SupportTask) => SupportDecision
  coldPolicyFor?: (t: SupportTask) => SupportDecision
  computeLevel?: (verdicts: { passed: boolean; reward: number; catastrophic: boolean }[]) => string
  issuedAt?: string | null
}): SupportReferenceCheck
