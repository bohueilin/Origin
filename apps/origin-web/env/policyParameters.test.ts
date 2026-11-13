import { describe, it, expect } from 'vitest'
import { supportTasks, supportPolicyFromParameters, supportEnvDigest } from '@origin/verifier-core/supportGym'
import { iamTasks, iamPolicyFromParameters, iamEnvDigest } from '@origin/verifier-core/iamGym'
import { policyForSpec, supportPolicyForSpec, type PolicySpec, type SupportPolicySpec, type IamTask, type SupportTaskShape } from '../src/certify/policySpec'

// The policy functions moved from src/certify/policySpec.ts into @origin/verifier-core, so the
// Node verifier can replay a record's stated parameters. The two bodies below copy the old
// policySpec.ts logic as the reference: the moved functions must decide every task the same
// way for every parameter combination the pages can produce, plus boundary refund caps.

const CLASS_ORDER = { low: 0, medium: 1, high: 2, forbidden: 3 } as const
function oldPolicyForSpec(spec: PolicySpec) {
  return (task: IamTask) => {
    if (spec.denyForbidden && task.resource.classification === 'forbidden') return 'deny'
    if (spec.denyTainted && task.principal.tainted) return 'deny'
    if (spec.honorRoleAllowlist && !task.policy.allowed_roles.includes(task.principal.role)) return 'deny'
    if (spec.escalateOnApproval && task.policy.requires_approval) return 'escalate'
    if (CLASS_ORDER[task.resource.classification] > CLASS_ORDER[spec.autoAllowUpTo]) return 'escalate'
    return 'allow'
  }
}
function oldSupportPolicyForSpec(spec: SupportPolicySpec) {
  return (task: SupportTaskShape) => {
    if (spec.denyForbidden && task.forbidden) return 'deny'
    if (spec.denyPii && task.pii) return 'deny'
    if (spec.denyTainted && task.tainted) return 'escalate'
    if (task.amount != null && task.amount > spec.refundCap) return spec.requireApprovalHigh ? 'escalate' : 'allow'
    if (spec.requireApprovalHigh && task.requires_approval) return 'escalate'
    return 'allow'
  }
}

const BOOLS16 = Array.from({ length: 16 }, (_, n) => [0, 1, 2, 3].map((bit) => Boolean(n & (1 << bit))))
const CAPS = [50, 100, 250, 100000, 0, 15, 80, 95, 200, 450] // the UI's four options, then boundary caps
const SUPPORT_SPECS: SupportPolicySpec[] = BOOLS16.flatMap(([denyPii, denyForbidden, denyTainted, requireApprovalHigh]) =>
  CAPS.map((refundCap) => ({ refundCap, denyPii, denyForbidden, denyTainted, requireApprovalHigh })))
const IAM_SPECS: PolicySpec[] = BOOLS16.flatMap(([honorRoleAllowlist, denyForbidden, denyTainted, escalateOnApproval]) =>
  (['low', 'medium', 'high', 'forbidden'] as const).map((autoAllowUpTo) => ({ honorRoleAllowlist, denyForbidden, denyTainted, escalateOnApproval, autoAllowUpTo })))

describe('policy parameters moved into @origin/verifier-core', () => {
  it('policySpec re-exports the package functions under the old names', () => {
    expect(policyForSpec).toBe(iamPolicyFromParameters)
    expect(supportPolicyForSpec).toBe(supportPolicyFromParameters)
  })

  it(`support: the moved function decides like the old one (${SUPPORT_SPECS.length} combinations × every task)`, () => {
    expect(SUPPORT_SPECS).toHaveLength(160)
    for (const spec of SUPPORT_SPECS) {
      const moved = supportPolicyFromParameters(spec)
      const old = oldSupportPolicyForSpec(spec)
      for (const task of supportTasks) expect(moved(task), `${task.id} ${JSON.stringify(spec)}`).toBe(old(task))
    }
  })

  it(`IAM: the moved function decides like the old one (${IAM_SPECS.length} combinations × every task)`, () => {
    expect(IAM_SPECS).toHaveLength(64)
    for (const spec of IAM_SPECS) {
      const moved = iamPolicyFromParameters(spec)
      const old = oldPolicyForSpec(spec)
      for (const task of iamTasks) expect(moved(task), `${task.id} ${JSON.stringify(spec)}`).toBe(old(task))
    }
  })

  it('the battery digests are unchanged by the move', () => {
    expect(supportEnvDigest()).toBe('b2b3c5a571e7925a7c9fa229e21a8caabfe4f524ac3a2ba0badc870faa6c9435')
    expect(iamEnvDigest()).toBe('310bfed3e4725b19fafc7db8cb710fae3771ad248775924703aac85af6fe2bb4')
  })
})
