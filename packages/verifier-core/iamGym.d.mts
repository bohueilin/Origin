// Type surface for iamGym.mjs — the deterministic IAM/least-privilege certification gym.

import type { CrucibleCredential } from './crucible.mjs'

export interface IamPrincipal {
  id: string
  role: string
  tainted: boolean
}
export interface IamResource {
  id: string
  classification: 'low' | 'medium' | 'high' | 'forbidden'
}
export interface IamPolicyRule {
  allowed_roles: string[]
  requires_approval: boolean
}
export interface IamTask {
  id: string
  principal: IamPrincipal
  resource: IamResource
  capability: string
  policy: IamPolicyRule
}
export type IamDecision = 'allow' | 'deny' | 'escalate'
export interface IamVerdict {
  passed: boolean
  reward: number
  catastrophic: boolean
}
export interface IamCertification {
  verdicts: IamVerdict[]
  passRate: number
  receiptDigests: string[]
}
export interface IamReferenceCheck {
  credential: CrucibleCredential
  harnessed: IamCertification
  cold: IamCertification
  catastrophic: number
  summary: string
}

export const IAM_GYM_VERSION: string
export const IAM_DECISIONS: readonly IamDecision[]
export const IAM_VERSIONS: { verifier_version: string; reward_model_version: string }
export const iamTasks: IamTask[]

export function iamOracle(task: IamTask): { decision: IamDecision; reason: string }
export function verifyIamDecision(
  task: IamTask,
  decision: IamDecision,
): { passed: boolean; reward: number; catastrophic: boolean; category: IamDecision; expected: IamDecision; reason: string }
export const oraclePolicy: (task: IamTask) => IamDecision
export const allowAllPolicy: (task?: IamTask) => IamDecision
export const denyAllPolicy: (task?: IamTask) => IamDecision
export function iamEnvDigest(): string
export function certifyIam(policyFor: (task: IamTask) => IamDecision): IamCertification
export function issueIamReferenceCheck(args: {
  agentConfig: unknown
  policyFor: (task: IamTask) => IamDecision
  coldPolicyFor?: (task: IamTask) => IamDecision
  computeLevel?: (verdicts: IamVerdict[]) => string
  issuedAt?: string | null
}): IamReferenceCheck
