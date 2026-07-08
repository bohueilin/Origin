// Janus core data models + service contracts.
//
// Everything here is local, deterministic, and side-effect-free. No type carries a
// raw secret: the SecretBroker returns opaque handles + redacted metadata only.

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

/** A capability is a dotted permission string, e.g. `calendar.read`, `ride.booking.submit`. */
export type Capability = string

// ---------------------------------------------------------------------------
// Spec data models (field names match the product spec verbatim).
// ---------------------------------------------------------------------------

export interface UserIntent {
  intent_id: string
  raw_user_request: string
  normalized_intent: string
  user_goal: string
  success_criteria: string[]
  constraints: string[]
  time_window: string | null
  risk_level: RiskLevel
  created_at: number
}

export type GrantStatus = 'active' | 'expired' | 'revoked'

export interface CapabilityGrant {
  grant_id: string
  intent_id: string
  agent_id: string
  allowed_capabilities: Capability[]
  denied_capabilities: Capability[]
  scope: string
  ttl: number // seconds
  budget_limit: { amount: number; currency: string } | null
  requires_approval_for: Capability[]
  status: GrantStatus
  created_at: number
  expires_at: number
  revoked_at: number | null
}

export type PlanStepKind = 'tool' | 'approval' | 'note'
export type PlanStepStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'done'
  | 'denied'
  | 'blocked'
  | 'skipped'

export interface PlanStep {
  step_id: string
  index: number
  title: string
  description: string
  kind: PlanStepKind
  tool_name?: string
  capability?: Capability
  approval_ref?: string // approval_id for kind: 'approval'
  status: PlanStepStatus
  output_summary?: string
  /** Worker agent that owns this step (for the collaboration view). */
  agent_id?: string
}

/** Live status of one agent in the collaborating team. */
export type AgentStatus = 'idle' | 'thinking' | 'working' | 'waiting' | 'done'
export interface AgentView {
  id: string
  name: string
  role: string
  mono: string
  hue: number
  status: AgentStatus
}

/** One hand-off message in the live collaboration stream. */
export type CollabKind = 'assign' | 'request' | 'grant' | 'deny' | 'result' | 'escalate' | 'approved' | 'note'
export interface CollabMsg {
  id: string
  ts: number
  from: string // agent id
  to: string // agent id
  text: string
  kind: CollabKind
}

export interface AgentPlan {
  plan_id: string
  intent_id: string
  steps: PlanStep[]
  tools_required: string[]
  approval_points: string[] // step_ids that are approval gates
  risk_notes: string[]
  fallback_plan: string
}

export type ToolCallStatus = 'ok' | 'denied' | 'awaiting_approval' | 'error'

export interface ToolCall {
  tool_call_id: string
  intent_id: string
  grant_id: string
  tool_name: string
  capability_required: Capability
  input_summary: string
  output_summary: string
  status: ToolCallStatus
  timestamp: number
}

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'consumed'

export interface ApprovalPacket {
  approval_id: string
  intent_id: string
  action_type: string
  description: string
  external_party: string | null
  estimated_cost: { amount: number; currency: string } | null
  data_shared: string[]
  irreversible: boolean
  expires_at: number
  approve_button_label: string
  deny_button_label: string
  status: ApprovalStatus
  // demo metadata (not in the minimal spec, but used to wire the gated commit):
  capability: Capability
  tool_name: string
  tool_input: Record<string, unknown>
}

export type AuditActor = 'user' | 'agent' | 'passport' | 'tool'
export type AuditDecision = 'allow' | 'deny' | 'approve' | 'reject' | 'info'

export interface AuditEvent {
  event_id: string
  ts: number
  actor: AuditActor
  kind: string
  summary: string
  capability?: Capability
  decision: AuditDecision
  detail?: Record<string, unknown>
}

export interface AuditTrace {
  trace_id: string
  intent_id: string
  events: AuditEvent[]
  digest: string
  created_at: number
}

// ---------------------------------------------------------------------------
// Tool adapter contract.
// ---------------------------------------------------------------------------

export interface ToolExecutionContext {
  intent: UserIntent
  grant: CapabilityGrant
  broker: SecretBroker
  now: () => number
  /** Approval packet that unlocked this call, if it is a gated commit. */
  approval?: ApprovalPacket
}

export interface ToolResult {
  /** One-line, secret-free summary rendered in the UI + audit. */
  summary: string
  /** Structured, secret-free data for the UI (rankings, options, drafts...). */
  data?: Record<string, unknown>
  /** True when this is a simulated side effect that performed NO real action. */
  simulated?: boolean
}

export interface ToolAdapter<Input = Record<string, unknown>, Output extends ToolResult = ToolResult> {
  name: string
  requiredCapability: Capability
  riskLevel: RiskLevel
  /** Commit adapters are gated by an approved ApprovalPacket, not by the grant. */
  sideEffecting?: boolean
  execute(input: Input, context: ToolExecutionContext): Promise<Output>
}

// ---------------------------------------------------------------------------
// Secret broker (scoped, never exposes the raw secret).
// ---------------------------------------------------------------------------

export interface ScopedSecretRequest {
  item_ref: string
  capability: Capability
  intent_id: string
  grant_id: string
  /** Field labels the caller needs (e.g. ['username']); values are NEVER returned. */
  fields?: string[]
}

export interface ScopedSecretResult {
  /** Opaque, task-scoped handle. Cannot be exchanged for the secret. */
  handle: string
  /** Redacted metadata only: title, category, and field LABELS — never values. */
  metadata: { title: string; category: string; field_labels: string[] }
  scope: string
  expires_at: number
}

export interface SecretBroker {
  readonly id: string
  isAvailable(): Promise<boolean>
  requestScopedSecret(request: ScopedSecretRequest): Promise<ScopedSecretResult>
}
