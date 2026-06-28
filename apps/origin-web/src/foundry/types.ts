// ----------------------------------------------------------------------------
// Origin Foundry — shared request/response contracts (server ↔ client).
//
// Foundry turns a floor plan into a trained, reward-hardened robot policy:
//   1. parse-floor : gemma-4-31b (vision) reads a floor image → DescriptiveSiteMap
//   2. quorum-run  : a Planner + Guardian loop on gemma-4-31b proposes & RATIFIES
//                    every step, scored by the deterministic oracle (never an LLM)
//   3. speed-race  : gemma-4-31b on Cerebras vs a GPU baseline, real tok/s on screen
// These types are the single source of truth for both the Hono routes and the React UI.
// ----------------------------------------------------------------------------

import type { DescriptiveSiteMap } from '../workflowDraft'
import type { WarehouseAction, WarehouseTerminal, GridPos } from '../warehouse'

/** Where a result came from. 'mock' is the deterministic offline fallback (always labeled in the UI). */
export type FoundrySource = 'cerebras' | 'gemini' | 'mock'

export interface FoundryTiming {
  tokS: number | null
  ttftMs: number | null
  completionTokens: number | null
  totalMs: number | null
}

// ---- parse-floor ------------------------------------------------------------

export interface ParseFloorResponse {
  ok: boolean
  siteMap: DescriptiveSiteMap | null
  source: FoundrySource
  timing: FoundryTiming | null
  /** Deterministic repairs applied to the model's raw JSON (the Origin trust layer). */
  repairs: string[]
  model: string
  /** Oracle's read of the parsed floor (deterministic): verdict + safe-path length. */
  oracle?: { verdict: WarehouseTerminal; reason: string; pathLength: number }
  error?: string
}

// ---- quorum-run -------------------------------------------------------------

export type GuardianVerdict = 'ratify' | 'veto'
export type QuorumMode = 'verified' | 'reckless'

/** One perceive → plan → verify cycle. */
export interface QuorumStep {
  loop: number
  position: GridPos
  /** Perceiver: compact read of the current state (from the gemma-4 vision parse). */
  observation: string
  /** Planner (gemma-4-31b): the next action it proposes. */
  proposed: WarehouseAction
  rationale: string
  /** Guardian (gemma-4-31b): ratify or veto, on every step. */
  verdict: GuardianVerdict
  guardianReason: string
  /** What actually ran (null when the Guardian vetoed it). */
  applied: WarehouseAction | null
  source: FoundrySource
  /** tok/s for this cycle's model calls (avg of planner+guardian). */
  tokS: number | null
}

export interface QuorumRunResponse {
  ok: boolean
  source: FoundrySource
  mode: QuorumMode
  steps: QuorumStep[]
  actions: WarehouseAction[]
  // ---- deterministic scoring (the oracle is the ONLY judge) ----
  terminalAction: WarehouseTerminal | null
  expected: WarehouseTerminal
  passed: boolean
  reward: number
  falseAccept: boolean
  falseReject: boolean
  category: string
  checks: string[]
  oracleReason: string
  /** What the SAME policy does WITHOUT the Guardian — proves what verification prevented. */
  counterfactual: { category: string; reward: number; unsafeEntered: boolean }
  // ---- aggregate speed ----
  totalCalls: number
  avgTokS: number | null
  wallMs: number
  guardianVetoes: number
  model: string
  error?: string
}

// ---- speed-race -------------------------------------------------------------

export interface SpeedRaceLane {
  provider: FoundrySource
  model: string
  ok: boolean
  tokS: number | null
  ttftMs: number | null
  totalMs: number | null
  completionTokens: number | null
  preview: string
  note?: string
}

export interface SpeedRaceResponse {
  ok: boolean
  prompt: string
  cerebras: SpeedRaceLane
  baseline: SpeedRaceLane
  /** Cerebras tok/s ÷ baseline tok/s (or wall-clock ratio) when both ran. */
  speedup: number | null
}
