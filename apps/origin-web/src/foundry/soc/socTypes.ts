// Shared contracts for the Origin Autonomy-Control (AI-SOC) routes.
import type { FoundrySource, GuardianVerdict } from '../types'
import type { IncidentKind, SocCategory } from './socEnv'

export interface SocPerception {
  severity: string
  summary: string
  /** Did the Perceiver flag a suspected prompt injection in the alert data? */
  injectionSuspected: boolean
}

/** One triaged incident: perceive → plan → Guardian-verify, scored by the deterministic policy. */
export interface SocDecision {
  incidentId: string
  title: string
  kind: IncidentKind
  perception: SocPerception
  /** Planner (gemma-4-31b): the remediation tool-call it proposes. */
  proposed: string
  rationale: string
  /** Guardian (gemma-4-31b): ratify or veto, on every action. */
  verdict: GuardianVerdict
  guardianReason: string
  /** What actually executed (the safe recovery when the Guardian vetoed). */
  applied: string
  // ---- deterministic scoring (the policy is the only judge) ----
  pass: boolean
  falseAccept: boolean
  category: SocCategory
  scoreReason: string
  source: FoundrySource
  tokS: number | null
  /** What WOULD have executed with no Guardian (proves what verification prevented). */
  noGuardApplied: string
  noGuardCategory: SocCategory
}

export interface SocRunResponse {
  ok: boolean
  source: FoundrySource
  decisions: SocDecision[]
  // ---- aggregate ----
  total: number
  passed: number
  /** Dangerous/injected actions the Guardian PREVENTED (vetoed) this run. */
  threatsBlocked: number
  /** Dangerous actions a no-Guardian agent WOULD have executed (the counterfactual damage). */
  threatsIfUnguarded: number
  avgTokS: number | null
  wallMs: number
  model: string
  error?: string
}

// ---- the LOOP-RACE: N verify cycles on Cerebras vs ONE call on the GPU baseline ----

export interface SocRaceLane {
  provider: FoundrySource
  model: string
  ok: boolean
  /** Incidents fully triaged + verified within the race window. */
  incidentsCleared: number
  tokS: number | null
  totalMs: number | null
  note?: string
}

export interface SocRaceResponse {
  ok: boolean
  windowMs: number
  cerebras: SocRaceLane
  baseline: SocRaceLane
  /** Threats Cerebras caught in the window the GPU was still on its first alert. */
  threatsCaughtInWindow: number
  /** incidentsCleared(cerebras) ÷ incidentsCleared(baseline). */
  throughputRatio: number | null
}
