// Type surface for env-promotion.mjs — environment promotion lifecycle (P9):
// authoring → validation → production, gated + human-approved, receipt-sealed.
// Hand-written declarations; keep in lockstep with env-promotion.mjs.

export const EnvStatus: {
  readonly AUTHORING: 'authoring'
  readonly VALIDATION: 'validation'
  readonly PRODUCTION: 'production'
}
export type EnvStatusValue = 'authoring' | 'validation' | 'production'

/** Only an adjacent FORWARD step is legal (no skipping, no going backward). */
export function allowedTransition(from: string, to: string): boolean

/** An ApprovalPacket-shaped human approval: capability-scoped, TTL-aware. */
export interface ApprovalPacket {
  capability: string
  approver: string
  valid?: boolean
  expires_at?: number | null
  now?: number | null
  [key: string]: unknown
}
export function approvalValid(a: ApprovalPacket | null | undefined): boolean

export interface GateResult {
  id: string
  ok: boolean
  detail: string
}

/** The seven gates. Pure: the caller injects the pinned verifier + the P5
 *  gold/exploit corpus + the human approval, so the runner stays env-agnostic. */
export interface PromotionGateArgs<Task = unknown, Action = unknown> {
  bundle: { env_bundle_digest: string; verifier?: { verifier_version?: string }; [key: string]: unknown }
  tasks: readonly Task[]
  scoreFn: (
    task: Task,
    actions: Action[],
  ) => { passed: boolean; falseAccept: boolean; reward: number; patched_reward?: number; is_hack?: boolean; [key: string]: unknown }
  oracleFn: (task: Task) => Action[]
  goldSuite: ReadonlyArray<{ task: Task; actions: Action[]; [key: string]: unknown }>
  exploitSuite: ReadonlyArray<{ task: Task; actions: Action[]; [key: string]: unknown }>
  schema: { required: readonly string[] }
  approval: ApprovalPacket | null | undefined
  versions: { verifier_version: string }
}
export function runEnvPromotionGates<Task = unknown, Action = unknown>(
  args: PromotionGateArgs<Task, Action>,
): { gate_results: GateResult[]; allGreen: boolean; digestOk: boolean }

/** Binds an env_bundle_digest + gate results + approver + rollback target — never a policy version. */
export interface EnvPromotionReceipt {
  receipt_schema_version: string
  kind: 'environment_promotion'
  env_bundle_digest: string
  from_status: string
  to_status: string
  gate_results: GateResult[]
  approver: string
  capability: string
  /** Prior production bundle digest (null on first promotion). */
  rollback_target: string | null
  frozen: boolean
  frozen_note: string
  receipt_digest: string
}

export interface PromotionArgs<Task = unknown, Action = unknown> extends PromotionGateArgs<Task, Action> {
  from: string
  to: string
  rollbackTarget?: string | null
}

/** Exit codes: 0 promoted · 5 tampered digest / gate failed · 6 illegal transition · 7 missing/expired approval. */
export function promoteEnvironment<Task = unknown, Action = unknown>(
  opts: PromotionArgs<Task, Action>,
): { code: 0 | 5 | 6 | 7; receipt: EnvPromotionReceipt | null; reason?: string; gate_results?: GateResult[] }

/** Re-runs the gates on the pinned bundle and confirms the committed receipt reproduces. */
export function verifyEnvPromotionReceipt<Task = unknown, Action = unknown>(
  receipt: EnvPromotionReceipt,
  opts: PromotionGateArgs<Task, Action>,
): { ok: boolean; reason?: string }
