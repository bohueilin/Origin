// Type surface for origin-env-core.mjs — the OpenEnv-style reset/step/peek kernel
// over the deterministic warehouse gym (P2). Pure and stateless: `state` is opaque.
// Hand-written declarations; keep in lockstep with origin-env-core.mjs.

import type { WarehouseTask, WarehouseAction } from '../src/warehouse.ts'

/** Minimal policy-facing observation — never affects the score (recorded actions are authoritative). */
export interface WarehouseObservation {
  position: { x: number; y: number }
  steps: number
  battery: number
  unsafe: boolean
  terminal: string | null
  [key: string]: unknown
}

export interface EnvResetResult {
  observation: WarehouseObservation
  allowedActions: WarehouseAction[]
  verifierRules: string
  done: boolean
  /** Opaque simulation state — pass back into step()/peek(), never mutate. */
  state: unknown
}

export interface EnvStepResult {
  observation: WarehouseObservation
  action: WarehouseAction
  done: boolean
  terminal: string | null
  state: unknown
}

export interface EnvPeekResult {
  observation: WarehouseObservation
  done: boolean
  terminal: string | null
}

export interface WarehouseEnvCore {
  task_id: string
  allowedActions: WarehouseAction[]
  verifierRules: string
  reset(): EnvResetResult
  /** Pure: returns a NEW state, never mutating its input. */
  step(state: unknown, action: WarehouseAction): EnvStepResult
  /** Read without advancing the simulation. */
  peek(state: unknown): EnvPeekResult
}

export function createWarehouseEnvCore(args: { task: WarehouseTask }): WarehouseEnvCore
