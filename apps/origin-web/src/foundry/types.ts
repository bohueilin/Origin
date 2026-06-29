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
import type { WarehouseAction, WarehouseTerminal, GridPos, WarehouseOracle, WarehouseRollout, WarehouseTask } from '../warehouse'

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

// ---- gym-rollout ------------------------------------------------------------

/**
 * A signed Autonomy License artifact: the gym verdict turned into a structured,
 * re-verifiable object instead of an ephemeral number.
 *
 * `seal` is a TAMPER-EVIDENT INTEGRITY SEAL — a SHA-256 hash over the canonical
 * JSON of every other field. It is NOT a PKI/asymmetric signature (there is no
 * private key or signer identity) and NOT a blockchain anchor; it seals the LOCAL
 * verdict only. Recompute it with verifyLicense() to detect post-issuance tampering.
 */
export interface ReadinessLicense {
  /** Content-derived stable id (rl_…), not random. */
  licenseId: string
  /** The rollout category / pass result being licensed (e.g. 'pass', 'unsafe_zone'). */
  verdict: string
  /** Which deterministic oracle ruleset produced the verdict. */
  oracleVersion: string
  /** Robot embodiment the rollout was graded for. */
  embodiment: string
  /** SHA-256 fingerprint of the task/site that was evaluated. */
  floorHash: string
  /** Safe-path length the oracle found. */
  pathLength: number
  /** Reward the oracle assigned the rollout. */
  reward: number
  /** Issue timestamp (epoch ms), supplied at seal time. */
  issuedAt: number
  /** Deterministic nonce derived from floorHash + verdict (NOT random). */
  nonce: string
  /** SHA-256 integrity seal over the canonical JSON of all the above fields. */
  seal: string
}

export type GymRolloutResponse = {
  ok: true
  task: WarehouseTask
  actions: WarehouseAction[]
  oracle: WarehouseOracle
  rollout: WarehouseRollout
  reward: number
  passed: boolean
  category: string
  /** Tamper-evident license artifact sealing this verdict (see ReadinessLicense). */
  license: ReadinessLicense
} | {
  ok: false
  code: 'bad_request'
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
