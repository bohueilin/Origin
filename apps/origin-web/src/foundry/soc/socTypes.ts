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

// ---- speed leaderboard: gemma-4-31b on Cerebras vs every frontier GPU model ----

export interface LeaderLane {
  rank: number
  label: string
  provider: 'cerebras' | 'fireworks'
  model: string
  ok: boolean
  tokS: number | null
  totalMs: number | null
  note?: string
}

export interface LeaderboardResponse {
  ok: boolean
  prompt: string
  lanes: LeaderLane[]
  cerebrasTokS: number | null
  speedupVsBestGpu: number | null
}

// ---- the "safety tax" shootout: GPU one-shot (fast, unguarded) vs Cerebras verified ----

export interface ShootoutLane {
  label: string
  provider: 'cerebras' | 'fireworks'
  mode: 'verified' | 'one-shot'
  /** Destructive/injected tool-calls that EXECUTED (the breaches). */
  breaches: number
  passed: number
  total: number
  totalMs: number
  tokS: number | null
  ok: boolean
  note?: string
}

export interface SocShootoutResponse {
  ok: boolean
  cerebras: ShootoutLane
  gpuOneShot: ShootoutLane
  /** What the GPU would cost to ALSO be safe (one-shot time × the 3-call verify loop). */
  gpuVerifiedProjectedMs: number
  /** How many × cheaper the SAME per-step guarantee is on Cerebras (gpuVerified ÷ cerebrasVerified). */
  verificationTaxX: number
  verdict: string
}

// ---- $ economics: measured throughput → a business number ----

export interface EconLane {
  label: string
  provider: 'cerebras' | 'fireworks'
  /** Incidents fully triaged per minute, from real measured per-incident time. */
  clearedPerMin: number
  perIncidentMs: number
  tokS: number | null
  ok: boolean
}

export interface EconomicsResponse {
  ok: boolean
  cerebras: EconLane
  gpu: EconLane
  throughputRatio: number
}

// ---- ensemble-of-N Guardians: a committee for the price of one ----

export interface EnsemblePoint {
  n: number
  /** Probability the MAJORITY of N guardians misses the injection (binomial from the observed single-miss rate). */
  missRatePct: number
}

export interface EnsembleResponse {
  ok: boolean
  source: 'cerebras' | 'mock'
  incidentTitle: string
  /** How many of the N parallel guardians vetoed the destructive action. */
  vetoes: number
  total: number
  /** Observed probability a SINGLE guardian misses (ratifies the destructive action). */
  singleMissPct: number
  points: EnsemblePoint[]
  /** Wall time for all N guardians (run in parallel) on Cerebras. */
  cerebrasAllMs: number
  /** Wall time for ONE GPU guardian — the budget. */
  oneGpuGuardianMs: number
  /** How many Cerebras guardians fit inside one GPU guardian's wall time. */
  fitsInBudget: number
}

// ---- reacts-before-I-finish: latency to detect+veto an attack ----

export interface LatencyResponse {
  ok: boolean
  attackText: string
  cerebras: { ttftMs: number | null; totalMs: number | null; verdict: 'veto' | 'ratify'; reason: string; ok: boolean }
  gpu: { label: string; totalMs: number | null; ok: boolean }
}

// ---- accuracy vs latency: speed converts time into correctness ----

export interface AccPoint {
  label: string
  provider: 'cerebras' | 'fireworks'
  /** Per-incident wall time for this config. */
  budgetMs: number
  accuracyPct: number
}

export interface AccuracyResponse {
  ok: boolean
  points: AccPoint[]
  total: number
  source: 'cerebras' | 'mock'
}

// ---- Passport: identity → authority → veto (who-is-allowed before what-is-allowed) ----

export type PassportStepStatus = 'pass' | 'deny' | 'info'
export interface PassportStep {
  label: string
  status: PassportStepStatus
  detail: string
}
export interface PassportDecision {
  id: string
  title: string
  kind: 'in_scope' | 'over_privilege' | 'collusion'
  agentLabel: string
  action: string
  authorized: boolean
  /** The gemma-4 Guardian's verdict on the ACTION (the "what" gate), independent of authority. */
  guardianVerdict: 'ratify' | 'veto' | null
  guardianReason: string
  tokS: number | null
  applied: string
  outcome: 'executed' | 'blocked'
  correct: boolean
  chain: PassportStep[]
  /** Plain-English narration of WHY this verdict landed. The deterministic oracle decided; gemma-4
   *  only NARRATES the already-final decision — it never changes the outcome. */
  explanation?: string
}
export interface PassportRunResponse {
  ok: boolean
  source: 'cerebras' | 'mock'
  decisions: PassportDecision[]
  blocked: number
  total: number
}

// ---- Hierarchical supervision: cheap deterministic floor / premium gemma-4 on the few ----

export interface SupervisionItem {
  incidentId: string
  title: string
  severity: string
  kind: 'benign_auto' | 'needs_escalation' | 'injection_trap'
  route: 'auto' | 'escalate'
  /** Machine label for WHY it routed this way (deterministic, observable). */
  signal: string
  reason: string
  /** Which tier resolved it. */
  tier: 'deterministic' | 'gemma-4'
  action: string
  actionLabel: string
  correct: boolean
  /** gemma-4 throughput on the escalated loop; null for the free floor. */
  tokS: number | null
}

export interface SupervisionResponse {
  ok: boolean
  source: 'cerebras' | 'mock'
  items: SupervisionItem[]
  total: number
  autoCount: number
  escalateCount: number
  /** escalateCount / total, 0..1. */
  escalateRate: number
  correct: number
  /** Injection traps that were escalated and neutralized (no destructive action executed). */
  threatsNeutralized: number
  /** Total injection traps in the queue (the denominator for threatsNeutralized). */
  threatsTotal: number
  escalatedTokens: number
  escalatedMs: number
  avgTokensPerEscalation: number
  /** Cost projection at an assumed enterprise volume (the volume is labeled, not measured). */
  projection: {
    dailyAlerts: number
    escalatedPerDay: number
    floorHandledPerDay: number
    workSavedPct: number
  }
  model: string
}
