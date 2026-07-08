// Type surface for env-evidence.mjs — the pure, verifier-agnostic evidence core
// (canonical JSON + isomorphic synchronous SHA-256 + hash-chained EpisodeTraces +
// ScoreReceipts + adjudication + the env:verify replay core).
// Hand-written declarations (the runtime is plain .mjs, shared with Node CLIs,
// vitest, and the browser bundle). Keep in lockstep with env-evidence.mjs.

import type { CostLedger, CostModel } from './cost-ledger.mjs'

/** The null hash ('0' × 64) — hash-chain anchor. */
export const GENESIS: string

/**
 * Canonical JSON: keys sorted at every level, no whitespace, UTF-8.
 * `undefined` handling matches JSON.stringify (DET-1 fix): an object key whose
 * value is undefined/function/symbol is OMITTED; an undefined array element (or
 * hole/function/symbol) serializes to null. A top-level undefined/function/symbol
 * yields the JS value `undefined` (not a string) — do not hash those.
 */
export function canonical(value: undefined): undefined
export function canonical(value: unknown): string

/** Pure-JS FIPS 180-4 SHA-256 (the browser path). Exported for the byte-identity test only. */
export function sha256Js(str: string): string
/**
 * Synchronous, isomorphic SHA-256 over the UTF-8 bytes of `str` → lowercase hex.
 * Bound once at module load: node:crypto in Node (unchanged digests), sha256Js in
 * a browser. Byte-identity between the paths is asserted by sha256-identity.test.ts.
 */
export const sha256: (str: string) => string

/** Content identity over everything that can move a score — EXCLUDES created_at + env_bundle_digest. */
export function bundleDigest(manifest: Record<string, unknown>): string

/** Binds a ScoreReceipt to the exact recorded action trace. */
export const recordedActionsDigest: (actions: readonly unknown[]) => string

// ── EpisodeTrace: hash-chain of step payloads + a sealing event ───────────────

export interface EpisodeHeader {
  trace_schema_version: string
  episode_id: string
  env_bundle_digest: string
  policy_version: string
  verifier_version: string
  seed: number
  /** Embedded so re-scoring is self-contained (committed via the bundle's seed_data). */
  task: unknown
  [key: string]: unknown
}

export interface EpisodeStepInput {
  event_type: string
  step_index?: number | null
  payload?: unknown
}

export interface EpisodeEvent {
  seq: number
  event_id: string
  event_type: string
  step_index: number | null
  payload: unknown
  payload_digest: string | null
  prev_hash: string
  event_hash: string
  /** Present on the sealing event only. */
  chain_root?: string
}

export interface EpisodeTrace extends EpisodeHeader {
  event_count: number
  final_digest: string
  log_digest: string
  events: EpisodeEvent[]
}

/** The ONE hashing implementation — chainEpisode (one-shot) and the resumable
 *  checkpoint path (@origin/verifier-core/checkpoint) both fold through it. */
export interface EpisodeBuilder {
  appendStep(s: EpisodeStepInput): EpisodeEvent
  seal(): EpisodeTrace
  /** Chain tip event_hash after the last appended step (the resume anchor). */
  readonly tip: string
  /** Number of appended (non-seal) events so far. */
  readonly length: number
  readonly sealed: boolean
}

export function openEpisode(header: EpisodeHeader): EpisodeBuilder
export function chainEpisode(header: EpisodeHeader, steps: readonly EpisodeStepInput[]): EpisodeTrace

/** Re-derives every event_hash + prev_hash link + the seal. */
export function verifyChain(trace: EpisodeTrace): { ok: boolean; failures: string[] }

/** The recorded actions, extracted from action.applied events (in order). ONLY
 *  action.applied enters the score-authoritative trace (Goodhart guard). */
export const recordedActions: <A = unknown>(trace: EpisodeTrace) => A[]
/** The recorded tool.call events (P3 evidence — never score inputs). */
export const recordedToolCalls: (trace: EpisodeTrace) => EpisodeEvent[]

// ── ScoreReceipt ──────────────────────────────────────────────────────────────

/** WarehouseRollout-shaped scoring result (structural — any oracle family fits). */
export interface RolloutSummary {
  reward: number
  passed: boolean
  category: string
  falseAccept: boolean
  falseReject: boolean
  /** P5 — present when the reward module classified reward-hacking. */
  is_hack?: boolean
  raw_reward?: number
  patched_reward?: number
  exploit_cluster?: string
  [key: string]: unknown
}

export interface ScoreReceipt {
  receipt_schema_version: string
  episode_id: string
  env_bundle_digest: string
  verifier_version: string
  reward_model_version: string
  recorded_actions_digest: string
  reward: number
  passed: boolean
  category: string
  /** Executing finish when the oracle says not-finish (== false_accept). */
  catastrophic: boolean
  false_accept: boolean
  false_reject: boolean
  license_level: string
  reproducibility: string
  raw_reward?: number
  patched_reward?: number
  is_hack?: boolean
  exploit_cluster?: string
  /** P6 — folded in BEFORE the digest (tampered cost → digest drift). */
  cost?: CostLedger
  receipt_digest: string
}

export function buildScoreReceipt(args: {
  episode: EpisodeTrace
  envBundleDigest: string
  rollout: RolloutSummary
  versions: { verifier_version: string; reward_model_version: string }
  licenseLevel: string
  cost?: CostLedger | null
}): ScoreReceipt

// ── P6 adjudication ───────────────────────────────────────────────────────────

export interface Adjudication {
  adjudication_schema_version: string
  dispute_class: 'Computation'
  outcome: 'RESOLVED_FOR' | 'RESOLVED_AGAINST' | 'UNRESOLVED'
  exit_code: number
  env_bundle_digest: string | null
  receipt_digest: string | null
  verifier_version: string | null
  settles: string
  note: string
  adjudication_digest: string
}

export function adjudicate(args: {
  code: number
  bundle?: { env_bundle_digest?: string | null } | null
  receipt?: { receipt_digest?: string | null; verifier_version?: string | null } | null
}): Adjudication

// ── env:verify core ───────────────────────────────────────────────────────────

export type CheckLine = ['PASS' | 'FAIL', string]

export interface LicenseVerdict {
  passed: boolean
  reward: number
  catastrophic: boolean
}

/** The pinned EnvironmentBundle shape verifyEpisode checks against (structural). */
export interface EnvironmentBundle {
  env_bundle_digest: string
  verifier?: { verifier_version?: string; [key: string]: unknown }
  tools?: unknown[]
  tools_digest?: string | null
  policies?: unknown[]
  policies_digest?: string | null
  registry_digest?: string | null
  cost_model?: CostModel | null
  rate_digest?: string | null
  [key: string]: unknown
}

/** Exit codes: 0 verified · 2 chain tamper · 3 reward/receipt mismatch · 4 verifier/bundle drift. */
export function verifyEpisode<Task = unknown, Action = unknown>(args: {
  episode: EpisodeTrace
  receipt: ScoreReceipt
  bundle?: EnvironmentBundle | null
  scoreFn: (task: Task, actions: Action[]) => RolloutSummary
  licenseFn: (verdicts: LicenseVerdict[]) => string
}): { code: 0 | 2 | 3 | 4; checks: CheckLine[] }
