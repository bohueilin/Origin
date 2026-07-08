// Type surface for executor.mjs — the provider-agnostic execution seam (P4):
// in-process Tier-1 and the FakeDaytona snapshot/fork/reset provider (CONTRACT
// only — NOT real isolation). Hand-written; keep in lockstep with executor.mjs.

import type { WarehouseTask, WarehouseAction } from '../src/warehouse.ts'
import type { WarehouseObservation, EnvPeekResult } from './origin-env-core.mjs'

export interface ExecutorHandle {
  env_bundle_digest: string
}

/** An isolated, deterministic rollout session (fields are provider-internal). */
export interface RolloutSession {
  steps: number
  done: boolean
  terminal: string | null
  [key: string]: unknown
}

export interface ExecutorStepResult {
  observation: WarehouseObservation
  done: boolean
  terminal: string | null
  /** false when the session was already done (the action was NOT applied). */
  applied: boolean
}

/** sandbox_seconds is a DETERMINISTIC synthetic clock (= applied steps), never wall-clock. */
export interface ExecutorMeter {
  sandbox_seconds: number
  wall_ms: number
  tier: string
}

export interface Executor {
  kind: string
  /** FakeDaytona only — honest provenance: proven:false, contract-only isolation. */
  provider?: { name: string; isolation: string; proven: boolean; note: string }
  /** Guards bundleDigest(bundle) === bundle.env_bundle_digest (throws on tamper). */
  prepare(bundle: { env_bundle_digest: string; [key: string]: unknown }): ExecutorHandle
  forkRollout(handle: ExecutorHandle, opts: { task: WarehouseTask; seed?: number }): RolloutSession
  step(session: RolloutSession, action: WarehouseAction): ExecutorStepResult
  state(session: RolloutSession): EnvPeekResult
  /** Restore to the golden snapshot (deterministic episode boundary). */
  reset(session: RolloutSession): EnvPeekResult
  meter(session: RolloutSession): ExecutorMeter
  teardown(handle: ExecutorHandle): void
}

export function InProcessExecutor(): Executor
export function FakeDaytona(): Executor
export function makeExecutor(tier?: string): Executor
