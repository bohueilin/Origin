// Scenario script format. A scenario is a deterministic program the DemoScenarioRunner
// plays step by step, pausing at approval gates. No randomness, no network.

import type {
  ApprovalPacket,
  Capability,
  RiskLevel,
  ToolResult,
} from '../types'

export type StepSpec = NoteStep | ToolStep | ApprovalStep

export interface NoteStep {
  kind: 'note'
  title: string
  description: string
}

export interface ToolStep {
  kind: 'tool'
  title: string
  description: string
  tool: string
  input: Record<string, unknown>
}

/** An approval gate: raises a packet, pauses, and on approval runs a simulated commit tool. */
export interface ApprovalStep {
  kind: 'approval'
  title: string
  description: string
  commitTool: string
  commitInput: Record<string, unknown>
  packet: ApprovalPacketSpec
}

export interface ApprovalPacketSpec {
  action_type: string
  description: string
  external_party: string | null
  estimated_cost: { amount: number; currency: string } | null
  data_shared: string[]
  irreversible: boolean
  approve_button_label: string
  deny_button_label: string
  capability: Capability
}

export interface ItineraryLine {
  label: string
  value: string
  tone?: 'default' | 'good' | 'warn'
}

export interface Itinerary {
  title: string
  summary: string
  lines: ItineraryLine[]
  notes: string[]
}

export interface FinalizeContext {
  /** Tool results keyed by tool name (last call wins). */
  results: Record<string, ToolResult>
  approvals: ApprovalPacket[]
}

/** A branded, human-readable tool the agent was granted (for the run-view header). */
export interface ScenarioTool {
  name: string
  /** Plain-English what-for, e.g. "check your free nights". */
  use: string
  /** True if using this tool needs your explicit approval (e.g. a payment). */
  approval?: boolean
  /** The commit capability this tool maps to — lets the chip flip to "done" once you OK it. */
  cap?: Capability
  /** What the chip reads once `cap` is approved/consumed (e.g. "✓ booked"). Defaults to "✓ approved". */
  doneLabel?: string
}

export interface ScenarioSpec {
  id: string
  title: string
  tagline: string
  prompt: string
  /** Friendly, branded tool list shown at the top of the run view ("Tools I can use"). */
  tools?: ScenarioTool[]
  /** Normalized understanding of the request. */
  normalized_intent: string
  user_goal: string
  success_criteria: string[]
  constraints: string[]
  time_window: string | null
  /** Read/prepare capabilities the agent needs (become the grant's allowed list). */
  requested_capabilities: Capability[]
  /** Commit capabilities the plan will attempt — denied to the agent, approval-only. */
  commit_capabilities: Capability[]
  /** Optional spend ceiling shown on the grant. */
  budget_limit?: { amount: number; currency: string }
  ttl_seconds: number
  /** Headline risk for the intent card (the engine also computes one from capabilities). */
  risk_level: RiskLevel
  /** What Passport does if an approval is denied. */
  fallback_plan: string
  steps: StepSpec[]
  finalize: (ctx: FinalizeContext) => Itinerary
  /** "What Passport prevented" bullet points for this scenario. */
  prevented: string[]
}
