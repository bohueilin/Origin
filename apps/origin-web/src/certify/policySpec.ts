// Shared least-privilege policy spec — used by the buyer UI (/reference-check) AND the
// verification-substrate API (/v1/certify). A buyer declares their IAM posture as a few
// guards; policyForSpec turns it into a deterministic allow/deny/escalate policy the gym
// scores. Each guard left OFF is a way the agent over-grants, which the oracle catches.
import type { iamTasks } from '@origin/verifier-core/iamGym'

export type Decision = 'allow' | 'deny' | 'escalate'
export type Classification = 'low' | 'medium' | 'high' | 'forbidden'
export type IamTask = (typeof iamTasks)[number]

export interface PolicySpec {
  honorRoleAllowlist: boolean
  denyForbidden: boolean
  denyTainted: boolean
  escalateOnApproval: boolean
  autoAllowUpTo: Classification
}

export interface AgentConfig {
  model: string
  tools: string[]
  context: string
  harness: string
}

const CLASS_ORDER: Record<Classification, number> = { low: 0, medium: 1, high: 2, forbidden: 3 }

export function policyForSpec(spec: PolicySpec) {
  return (task: IamTask): Decision => {
    if (spec.denyForbidden && task.resource.classification === 'forbidden') return 'deny'
    if (spec.denyTainted && task.principal.tainted) return 'deny'
    if (spec.honorRoleAllowlist && !task.policy.allowed_roles.includes(task.principal.role)) return 'deny'
    if (spec.escalateOnApproval && task.policy.requires_approval) return 'escalate'
    if (CLASS_ORDER[task.resource.classification as Classification] > CLASS_ORDER[spec.autoAllowUpTo]) return 'escalate'
    return 'allow'
  }
}

export const PRESETS: Record<string, { label: string; blurb: string; spec: PolicySpec }> = {
  'least-privilege': {
    label: 'Least-privilege (recommended)',
    blurb: 'Every guard on; auto-allow only up to medium. The posture that earns a high Verified Readiness Level.',
    spec: { honorRoleAllowlist: true, denyForbidden: true, denyTainted: true, escalateOnApproval: true, autoAllowUpTo: 'medium' },
  },
  moderate: {
    label: 'Moderate',
    blurb: 'Role allow-list + forbidden + tainted enforced, but auto-allows high-value actions without escalation.',
    spec: { honorRoleAllowlist: true, denyForbidden: true, denyTainted: false, escalateOnApproval: false, autoAllowUpTo: 'high' },
  },
  permissive: {
    label: 'Permissive (the dangerous baseline)',
    blurb: 'Guards off — the naive over-granting agent. Expect catastrophic over-grants and a capped level.',
    spec: { honorRoleAllowlist: false, denyForbidden: false, denyTainted: false, escalateOnApproval: false, autoAllowUpTo: 'forbidden' },
  },
}

// ── Support-agent scenario (the relatable hero: refunds / PII / bank changes) ──
export interface SupportPolicySpec {
  refundCap: number // dollars the agent may auto-refund without approval
  denyPii: boolean // refuse to disclose personal data
  denyForbidden: boolean // refuse destructive / bulk actions
  denyTainted: boolean // route fraud-flagged accounts to review
  requireApprovalHigh: boolean // escalate over-cap refunds + high-risk changes (e.g. bank details)
}

export interface SupportTaskShape {
  amount: number | null
  pii: boolean
  forbidden: boolean
  tainted: boolean
  requires_approval: boolean
}

export function supportPolicyForSpec(spec: SupportPolicySpec) {
  return (task: SupportTaskShape): Decision => {
    if (spec.denyForbidden && task.forbidden) return 'deny'
    if (spec.denyPii && task.pii) return 'deny'
    if (spec.denyTainted && task.tainted) return 'escalate'
    if (task.amount != null && task.amount > spec.refundCap) return spec.requireApprovalHigh ? 'escalate' : 'allow'
    if (spec.requireApprovalHigh && task.requires_approval) return 'escalate'
    return 'allow'
  }
}

export const SUPPORT_PRESETS: Record<string, { label: string; blurb: string; spec: SupportPolicySpec }> = {
  'least-privilege': {
    label: 'Least-privilege (recommended)',
    blurb: 'Refund cap $100, never disclose PII, no destructive actions, fraud + bank changes go to a human. Earns a high Verified Readiness Level.',
    spec: { refundCap: 100, denyPii: true, denyForbidden: true, denyTainted: true, requireApprovalHigh: true },
  },
  moderate: {
    label: 'Moderate',
    blurb: 'Refuses PII + destructive actions, but auto-approves fraud-flagged refunds and bank-detail changes — real over-grants.',
    spec: { refundCap: 100, denyPii: true, denyForbidden: true, denyTainted: false, requireApprovalHigh: false },
  },
  permissive: {
    label: 'Permissive (the dangerous baseline)',
    blurb: 'Guards off — the naive agent discloses PII, changes bank details, and deletes accounts. Expect catastrophic over-grants and a capped level.',
    spec: { refundCap: 100000, denyPii: false, denyForbidden: false, denyTainted: false, requireApprovalHigh: false },
  },
}

// Normalize a loosely-typed agent config from an API body into the bound config.
export function normalizeAgentConfig(input: Partial<AgentConfig> & { tools?: string[] | string }): AgentConfig {
  const tools = Array.isArray(input.tools)
    ? input.tools
    : String(input.tools ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  return {
    model: (input.model ?? '').trim() || 'unnamed-agent',
    tools,
    context: (input.context ?? '').trim() || 'none',
    harness: (input.harness ?? '').trim() || 'none',
  }
}
