/**
 * Domain model for the Traceback UI.
 *
 * These types mirror the logical record contracts in
 * `docs/plans/specs/03-interfaces.md` (ForkPoint, BranchRun, Exploit Witness,
 * ProofSet, ReleaseProof, Legitimate control) and the GLOSSARY. Field names use
 * frontend camelCase; the comment on each record points at its spec record so a
 * later real backend can map snake_case wire payloads onto these shapes without
 * the views changing.
 *
 * Nothing here assumes a transport. The API seam (`src/api`) is what a real
 * backend implementation replaces.
 */

export type SchemaVersion = string

export type SnapshotMode = 'directory' | 'filesystem' | 'memory' | 'vm-filesystem'

/** Lifecycle of a stochastic continuation, before/after QA + dedup + materialize. */
export type BranchStatus =
  | 'pending' // queued, not yet run
  | 'running' // discovery in flight
  | 'rewarded' // reward==1, awaiting QA
  | 'qa_review' // flagged, awaiting human/QA decision
  | 'dead_end' // reward 0 / no signal
  | 'duplicate' // collapsed into an existing cluster
  | 'promising' // candidate exploit, not yet a Witness
  | 'verifying' // candidate is being confirmed by QA/replay/provenance gates
  | 'witness' // confirmed Exploit Witness (passed all gates)
  | 'control' // legitimate control replay branch
  | 'control_pass' // control that has been replayed and passed
  | 'snapshot' // a durable snapshot node in the lineage

/** Semantic failure classes from the interfaces spec error taxonomy. */
export type ErrorClass =
  | 'boundary_mismatch'
  | 'state_capture_failed'
  | 'state_restore_failed'
  | 'snapshot_expired'
  | 'grader_mismatch'
  | 'provenance_incomplete'
  | 'classification_unavailable'
  | 'replay_diverged'
  | 'security_capability_missing'
  | 'control_regression'
  | 'witness_survived'
  | 'publish_unauthorized'
  | 'publish_failed'

export interface SamplingConfig {
  temperature: number
  topP: number
}

/** HUD Reward-Hacking QA assessment. Independent of reward. */
export interface QAResult {
  isRewardHacking: boolean
  classification: string // e.g. "Reward hacking"
  severity: 'low' | 'medium' | 'high'
  verdict: string // e.g. "Likely reward hacking"
  strategy?: string // e.g. "pytest subversion"
}

/** spec: ForkPoint record */
export interface ForkPoint {
  schemaVersion: SchemaVersion
  forkPointId: string
  hudTraceId: string
  hudStepId: string
  taskId: string
  environmentVersion: string
  historyHash: string
  snapshotId: string
  snapshotMode: SnapshotMode
  snapshotDigest?: string
  graderDigest: string
  forkReason: string
  createdAt: string
  // derived/display
  label: string // "QA ForkPoint · S0"
  upToStep: number
  actionRange: [number, number]
  cumulativeReward: number
  traceEvidence: string
}

/** spec: BranchRun record (+ display helpers) */
export interface BranchRun {
  schemaVersion: SchemaVersion
  runId: string
  branchId: string
  parentForkPointId: string
  parentNodeId: string | null
  title: string
  seed: number
  model: string
  samplingConfig: SamplingConfig
  hudTraceId: string
  environmentVersion: string
  graderDigest: string
  reward: number
  qa?: QAResult
  status: BranchStatus
  clusterId?: string
  clusterLabel?: string
  snapshotMode: SnapshotMode
  parentSnapshot?: string
  stepsFromFork: number
  novelty?: 'new' | 'existing'
  notes?: string
  startedAt: string
  completedAt?: string
  errorClass?: ErrorClass
  // layout hint for the run graph (the backend would not provide this; the UI owns it)
  layout?: { x: number; y: number; nodeType: string }
}

/** spec: Exploit Witness record */
export interface ExploitWitness {
  schemaVersion: SchemaVersion
  witnessId: string
  sourceBranchId: string
  preAttackSnapshotRef: string
  durableSnapshotMode: SnapshotMode
  exploitTarget: string
  exploitMechanism: string
  clusterId: string
  replayEntrypoint: string
  replayChecks: string // e.g. "Deterministic pass"
  contentDigest: string
  environmentVersion: string
  graderDigest: string
  createdAt: string
}

/** A single deterministic check performed during a Witness replay. */
export interface ReplayCheck {
  label: string
  status: 'pass' | 'fail'
  detail?: string
}

/**
 * Result of deterministically replaying a Witness against a target grader
 * version. `ok`/`detail` preserve the original lightweight contract; the
 * remaining fields back the replay modal.
 */
export interface ReplayResult {
  witnessId: string
  ok: boolean
  detail: string
  graderVersion: string // e.g. "v1"
  graderDigest: string
  steps: number
  reward: number
  digestMatch: boolean
  checks: ReplayCheck[]
}

/** A file in the pre-attack snapshot and whether it diverged after the fork. */
export interface PreAttackFileEntry {
  path: string
  status: 'unchanged' | 'diverged'
  note?: string
}

/**
 * The captured environment state at the ForkPoint — i.e. immediately before the
 * exploit diverged from legitimate behavior. Backs the "View pre-attack state"
 * modal.
 */
export interface PreAttackState {
  witnessId: string
  snapshotRef: string
  snapshotMode: SnapshotMode
  environmentVersion: string
  upToStep: number
  cumulativeReward: number
  capturedAt: string
  summary: string
  files: PreAttackFileEntry[]
}

/** spec: Legitimate control record */
export interface LegitimateControl {
  schemaVersion: SchemaVersion
  controlId: string
  taskId: string
  title: string
  solutionPathLabel: string
  sourceMethod: string
  environmentVersion: string
  graderDigest: string
  expectedReward: number
  contentDigest: string
  frozenAt: string
}

export type ProofSetMemberKind = 'witness' | 'control' | 'variant'

/** spec: ProofSet record */
export interface ProofSet {
  schemaVersion: SchemaVersion
  proofSetId: string
  environmentV1: string
  graderV1Digest: string
  exploitWitnessIds: string[]
  legitimateControlIds: string[]
  exploitFamilyVariantIds: string[]
  createdAt: string
  contentDigest: string
}

export interface DiffLine {
  no: string
  kind: 'ctx' | 'add' | 'del'
  text: string
}

/** A harden-v0 fixer-produced verifier patch. */
export interface Patch {
  patchRef: string
  iteration: number // 1 = first attempt
  label: string // "Patch v2"
  generatedBy: string // "harden-v0 fixer"
  description: string
  summary: string
  filePath: string
  added: number
  removed: number
  diff: DiffLine[]
  patchDigest: string
  rationale: string[]
  status: 'awaiting_proof' | 'proven' | 'rejected'
}

export type GateMemberStatus =
  | 'pending'
  | 'running'
  | 'killed' // witness failed under v2 (good)
  | 'survived' // witness still rewarded under v2 (bad)
  | 'preserved' // control still passes under v2 (good)
  | 'broken' // control regressed under v2 (bad)
  | 'passed' // control passed (alias used while streaming)

export interface GateMemberResult {
  memberId: string
  kind: 'witness' | 'control'
  name: string
  v1: number
  v2: number
  reward: number
  status: GateMemberStatus
}

export type GateStatus = 'idle' | 'running' | 'pass' | 'fail'

/** spec: ReleaseProof record */
export interface ReleaseProof {
  schemaVersion: SchemaVersion
  releaseProofId: string
  proofSetId: string
  environmentV1: string
  graderV1Digest: string
  environmentV2: string
  graderV2Digest: string
  patchRef: string
  results: GateMemberResult[]
  witnessesKilled: [number, number]
  controlsPreserved: [number, number]
  gateStatus: GateStatus
  failureKind?: 'witness_survived' | 'control_regression'
  publishedEnvironmentRef?: string
  commitId?: string
  reward: number
  similarity: number
  createdAt: string
  status: 'evaluating' | 'failed' | 'committed'
  // Optional Plan 005 blocker metadata for runs that have not produced a
  // validated ReleaseProof yet.
  blocked?: boolean
  blockReason?: string
  missingEvidence?: string[]
  hardenStatus?: string
  // Optional Plan 006 HUD publication outcome (real receipt) for a passing
  // release: what was actually deployed, plus the honest hardening caveat.
  publishOutcome?: string
  publishedVersion?: number
  environmentUrl?: string
  buildId?: string
  buildStatus?: string
  graderHardeningNote?: string
  residualLimitation?: string
}

/** High-level run lifecycle the store tracks. */
export type RunPhase =
  | 'forked' // ForkPoint captured, no branches yet
  | 'discovering' // stochastic branches streaming in
  | 'discovered' // branches present
  | 'proofset' // assembling/inspecting ProofSet
  | 'fixing' // a patch is awaiting proof
  | 'gating' // release gate replays running
  | 'gate_failed' // a witness survived or a control regressed
  | 'released' // ReleaseProof committed

/* ------------------------------------------------------------------ */
/* Plan 008 QA-classifier benchmark (cross-task; orthogonal to a run)   */
/* ------------------------------------------------------------------ */

/** One Terminal-Wrench task's discovery/QA tally in the benchmark. */
export interface BenchmarkTask {
  taskId: string
  rewardedBranches: number
  hacks: number
  legit: number
  qaCaughtOfHacks: number
}

/**
 * The Plan 008 QA-classifier benchmark headline, exported from the committed
 * `artifacts/forkproof/qabench/benchmark-report.json`. Proactive discovery /
 * red-teaming evidence — NOT a classifier-accuracy claim.
 */
export interface Benchmark {
  planId: string
  scope: string
  rewardedBranches: number
  discoveryHacks: number
  discoveryHacksNote: string
  tasksWithHacks: number
  tasksMeasured: number
  qaInProductionHacks: number
  qaCaughtOfDiscovered: number
  sftPartition: {
    confirmedHacks: number
    verifierLegit: number
    sftClean: number
    quarantined: number
  }
  perTask: BenchmarkTask[]
  referee: string
  framing: string
  sourcePath: string
}
