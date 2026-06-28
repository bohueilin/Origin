// Core domain types for the Autonomy Trace Console.
// The whole app is a deterministic eval loop:
//   Scenario -> agent action -> deterministic verifier -> reward -> trace -> license level.

export type Action = 'act' | 'ask' | 'escalate' | 'stop'

export type Domain = 'commerce' | 'business_ops' | 'robotics'

export type RiskLevel = 'low' | 'medium' | 'high'

/** Eval-corpus difficulty tier — how hard the scenario is to get right. */
export type Difficulty = 'easy' | 'medium' | 'hard'

/** Which corpus split a scenario belongs to. Held-out is reserved for
 * generalization checks and is excluded from the default train eval. */
export type ScenarioSplit = 'train' | 'heldout'

/** A single visible signal the agent is allowed to see before deciding. */
export interface VisibleSignal {
  label: string
  value: string
}

/**
 * A scenario the agent must respond to.
 *
 * `visibleSignals` + `visibleRiskScore` are everything the agent sees.
 * `hiddenRisk`, `correctAction`, and `rationale` are withheld from the agent
 * (see the policy views below) and revealed in the UI only after the verifier
 * scores the episode — this is what makes "earn autonomy before you exercise it"
 * demonstrable.
 */
export interface Scenario {
  id: string
  domain: Domain
  title: string
  situation: string
  visibleSignals: VisibleSignal[]
  /** Risk implied by the visible signals alone, 0..1. Drives the mock policy. */
  visibleRiskScore: number
  /** The true risk level, used by the verifier for asymmetric penalties. */
  riskLevel: RiskLevel
  /** Eval-corpus difficulty tier (metadata only — not read by the verifier). */
  difficulty: Difficulty
  /** Train vs held-out split (metadata only — not read by the verifier). */
  split: ScenarioSplit
  /** The action a competent operator should take. The verifier rewards this. */
  correctAction: Action
  /** Withheld from the agent. Revealed in the UI only after scoring. */
  hiddenRisk: string
  /** Plain-English reason the correct action is correct. */
  rationale: string
}

/**
 * What the LOCAL MOCK policy sees. Includes `visibleRiskScore` — a mock-only
 * explainability artifact used by the threshold policy and the UI band bar.
 * Still structurally excludes `hiddenRisk` / `correctAction` / `rationale`.
 */
export type MockPolicyView = Pick<
  Scenario,
  'id' | 'domain' | 'title' | 'situation' | 'visibleSignals' | 'visibleRiskScore'
>

/**
 * What a real MODEL-under-test (e.g. Nebius) sees. Strictly the visible scenario
 * fields a model should reason over. Deliberately omits `visibleRiskScore` (a
 * mock artifact that would leak a heuristic answer) and, like all views,
 * structurally excludes `hiddenRisk` / `correctAction` / `rationale`.
 */
export type ModelPolicyView = Pick<
  Scenario,
  'id' | 'domain' | 'title' | 'situation' | 'visibleSignals'
>

/** Which policy produced a decision (and the selectable /api/run-episode mode). */
export type AgentSource = 'mock' | 'nebius'

/**
 * Provenance of persisted EVIDENCE, which is a superset of `AgentSource`. The gym
 * `/v1` path records `external` for agents that drive the env from outside the
 * server (their action is verified identically). This is evidence-only: `external`
 * is never a selectable `/api/run-episode` policy mode.
 */
export type EvidencePolicySource = 'mock' | 'nebius' | 'external'

/**
 * What the agent decides, given only the visible signals. Either the local mock
 * policy or the Nebius model-under-test produces this shape; the deterministic
 * verifier only ever reads `action`, so the source is irrelevant to scoring.
 */
export interface AgentDecision {
  action: Action
  confidence: number
  rationale: string
  source: AgentSource
  /** Mock-policy explainability — present only when source === 'mock'. */
  policySignal?: number
  /** Human-readable threshold band — present only when source === 'mock'. */
  policyBand?: string
  /** Nebius model id — present only when source === 'nebius'. */
  model?: string
  /** Optional question/verification the model requested — Nebius only. */
  requestedInfo?: string
}

/** How the verifier classified a decision. Drives reward and the license gate. */
export type VerdictCategory =
  | 'correct'
  | 'over_cautious'
  | 'under_cautious'
  | 'catastrophic'

/** Deterministic verifier output for one (scenario, decision) pair. */
export interface VerifierResult {
  passed: boolean
  reward: number
  category: VerdictCategory
  expectedAction: Action
  chosenAction: Action
  /** null when passed. */
  failureReason: string | null
  /**
   * True only when the agent would have EXECUTED an irreversible, unsafe action
   * on a high-risk scenario (chose `act` where the situation required holding
   * back). This — not mere under-caution — is what caps the license.
   */
  catastrophic: boolean
  /** Step-by-step breakdown of how the verifier reached the reward. */
  checks: string[]
}

/**
 * Where a trace's evidence comes from.
 * - `server_authoritative_episode`: computed by the server-owned episode path
 *   (canonical scenario + deterministic verifier), suitable as license evidence.
 * - `demo_client_trace`: generated in the browser for the local demo — NOT
 *   authoritative evidence.
 */
export type TraceAuthority = 'server_authoritative_episode' | 'demo_client_trace'

/**
 * Attribution stamped onto every server-owned trace + persisted row so an
 * evaluation can be replayed against the exact environment that produced it.
 */
export interface EvalVersions {
  environmentName: string
  scenarioRegistryVersion: string
  scenarioVersion: string
  verifierVersion: string
  rewardModelVersion: string
  licensePolicyVersion: string
  appCommit: string | null
}

/** Requested-vs-actual policy provenance (distinguishes Nebius fallbacks). */
export interface TraceProvenance {
  requestedPolicyMode: EvidencePolicySource
  actualPolicySource: EvidencePolicySource
  fallback: boolean
  fallbackCode: string | null
}

/** One full episode through the loop, stored for the trace viewer. */
export interface Trace {
  id: string
  /** Server-authoritative episode index within its run. Never mutated for UI. */
  episode: number
  scenario: Scenario
  decision: AgentDecision
  result: VerifierResult
  /** How this episode nudged the license signal. */
  licenseSignal: string
  /** Defaults to demo_client_trace when omitted (browser-authored). */
  authority?: TraceAuthority
  /** Present on server-owned traces — attribution for replay. */
  versions?: EvalVersions
  /** Present on server-owned traces — requested vs actual policy. */
  provenance?: TraceProvenance
  /** UI-only display order in the mixed client list. Never persisted. */
  displayIndex?: number
}

export type LicenseLevelId = 'L0' | 'L1' | 'L2' | 'L3' | 'L4'

export interface LicenseLevel {
  id: LicenseLevelId
  name: string
  blurb: string
  permission: string
  color: string
}

export interface LicenseState {
  level: LicenseLevel
  episodes: number
  passes: number
  passRate: number
  avgReward: number
  totalReward: number
  catastrophicCount: number
  /** Why the loop landed on this level (gate explanation). */
  reason: string
}

// ---------------------------------------------------------------------------
// Server-owned episode + InsForge persistence (client-facing shapes).
// ---------------------------------------------------------------------------

/** UI persistence status for a server-owned episode. */
export type PersistenceStatus = 'idle' | 'saving' | 'saved' | 'local_only' | 'unavailable'

/** Persistence outcome returned by the server for one episode. */
export interface PersistenceInfo {
  /** Whether InsForge credentials are configured on the server. */
  configured: boolean
  status: 'saved' | 'local_only' | 'unavailable'
  /** InsForge record id when saved. */
  recordId?: string | null
  /** Failure code when status === 'unavailable' (never a raw error). */
  code?: string
  /** Storage table used. */
  table: string
}

/** Response from POST /api/run-episode. */
export interface ServerEpisodeResponse {
  trace: Trace
  license: LicenseState
  persistence: PersistenceInfo
  runId: string
}

/** Where the evidence status was sourced from. */
export type HistorySource = 'memory' | 'insforge' | 'local_only' | 'unavailable' | 'error'

/**
 * Tamper-evidence status of a read-back row:
 * - `valid`: a digest was present and recomputing it over the row matches.
 * - `missing`: no digest (legacy/unknown — NOT counted as digest-verified).
 * - `mismatched`: a digest was present but recomputation differs (excluded from
 *   trusted evidence + current license).
 */
export type DigestStatus = 'valid' | 'missing' | 'mismatched'

/** A compact, browser-safe row in the evidence status (no snapshots / inputs). */
export interface CompactRun {
  traceId: string
  episodeIndex: number
  runSequence: number
  scenarioId: string
  scenarioTitle: string
  requestedPolicyMode: EvidencePolicySource
  actualPolicySource: EvidencePolicySource
  fallback: boolean
  fallbackCode: string | null
  action: Action
  passed: boolean
  reward: number
  catastrophic: boolean
  licenseLevel: string
  createdAt: string
  versionMismatch: boolean
  /** Schema version of the persisted row (null for legacy rows). */
  rowSchemaVersion: string | null
  /** Whether the persisted row carried an integrity digest. */
  digestPresent: boolean
  /** Tamper-evidence status from recomputing the digest on read-back. */
  digestStatus: DigestStatus
}

export type HistoryScope = 'global_recent' | 'run'

/** Compact server evidence status from GET /api/evidence/status. */
export interface EvidenceStatus {
  runId: string | null
  serverEpisodeCount: number
  currentLicenseSummary: {
    level: string
    name: string
    passRate: number
    avgReward: number
    catastrophicCount: number
    episodes: number
  } | null
  latestServerTraceId: string | null
  latestPersistedRecordId: string | null
  historySource: HistorySource
  historyScope: HistoryScope
  /** Read-back row limit actually applied (clamped). */
  limit: number
  rehydratedFromInsForge: boolean
  rehydratedCount: number
  rejectedMalformedCount: number
  versionMismatchCount: number
  /** Rows whose versions are compatible with the current eval code (digest-independent). */
  compatibleEvidenceCount: number
  digestPresentCount: number
  digestValidCount: number
  digestMissingCount: number
  digestMismatchedCount: number
  /**
   * Compatible AND digest-valid (digest-verified). A strict subset of
   * compatibleEvidenceCount — they differ whenever missing-digest (legacy) or
   * mismatched-digest rows are present. Missing-digest rows are version-compatible
   * but NOT digest-verified.
   */
  trustedEvidenceCount: number
  lastRehydratedAt: string | null
  lastRefreshAttemptAt: string | null
  /** Sanitized read-back error code (never a raw error). */
  readBackErrorCode: string | null
  persistence: {
    configured: boolean
    status: 'configured' | 'local_only' | 'unavailable' | 'error'
    table: string
  }
  recentCompactRuns: CompactRun[]
}

// ---------------------------------------------------------------------------
// Gym /v1 reset/step (client-facing shapes).
//
// The browser only PROPOSES an action; the ENVIRONMENT verifies it, computes the
// reward, and computes the license. The client never runs the verifier or the
// license math for this path — it renders what /v1 returns.
// ---------------------------------------------------------------------------

/** Observation from POST /v1/episodes — the visible view, no hidden risk. */
export interface GymObservation {
  scenarioId: string
  domain: string
  title: string
  situation: string
  visibleSignals: VisibleSignal[]
  /** Mock-only explainability signal (0..1). Never a hidden answer field. */
  visibleRiskScore: number
}

/** Successful POST /v1/episodes (reset) result. */
export interface GymResetResult {
  episodeId: string
  runId: string
  agentId: string
  observation: GymObservation
  allowedActions: Action[]
  verifierRules: string
}

/** Deterministic verifier outcome inside a /v1 step result. */
export interface GymStepInfo {
  passed: boolean
  category: VerdictCategory
  catastrophic: boolean
  expectedAction: Action
  actualAction: Action
  reason: string | null
}

/** Run-scoped license summary returned by a /v1 step. */
export interface GymRunLicense {
  level: string
  name: string
  passRate: number
  avgReward: number
  catastrophicCount: number
  episodes: number
}

/** Successful POST /v1/episodes/:episodeId/step result. */
export interface GymStepResult {
  episodeId: string
  runId: string
  agentId: string
  reward: number
  done: boolean
  info: GymStepInfo
  license: GymRunLicense
  persisted: boolean
  recordId: string | null
}

/**
 * Successful POST /v1/reference-episodes result. The server-owned reference agent
 * (mock or Nebius) drove the gym env: it proposed the `decision`, the env scored
 * `step`, and `provenance` records requested-vs-actual policy (incl. Nebius
 * fallback). The browser renders these — it runs no verifier/license math.
 */
export interface GymReferenceResult {
  step: GymStepResult
  decision: AgentDecision
  provenance: TraceProvenance
}

/** A compact row from GET /api/runs/recent. */
export interface RecentRun {
  id: string
  episode: number
  scenarioTitle: string
  source: AgentSource
  action: Action
  passed: boolean
  reward: number
  category: VerdictCategory
  catastrophic: boolean
  authority: TraceAuthority
  persistedId?: string | null
  createdAt: string
}
