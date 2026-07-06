// Origin Training Evidence — OriginEnvCore (P2: OpenEnv-style reset/step/state)
// =============================================================================
// The executor-INDEPENDENT env kernel: reset() / step() / state() over the
// deterministic warehouse gym. It is the INNER contract every executor drives — the
// in-process backend for BOTH the OpenEnv HTTP server (P2, deferred) and the Daytona
// snapshot/fork/reset provider (P4). One kernel, wrapped by different transports.
//
// It is pure and stateless: reset() returns an opaque `state`, step(state, action)
// returns the next state + observation (never mutating its input), state()/peek does
// NOT advance. The scorer (rlkit/reward-module.ts) is the authority — the kernel only
// advances the simulation and emits observations for the policy.
// =============================================================================

import { initialWarehouseState, applyWarehouseAction, WAREHOUSE_ACTIONS } from '../src/warehouse.ts'

// A minimal observation for the policy. Observations do NOT affect the score (the
// recorded actions are authoritative), so this stays small + stable.
function observe(state) {
  return {
    position: { ...state.position },
    observed: state.observed,
    scanned: state.scanned,
    holding: state.holding,
    picked: state.picked,
    dropped: state.dropped,
    steps: state.steps,
    battery: state.batteryRemaining,
    unsafe: state.unsafeEntered,
    terminal: state.terminalAction,
  }
}

function isDone(task, state) {
  return Boolean(state.terminalAction) || state.unsafeEntered || state.steps >= task.maxSteps
}

const VERIFIER_RULES =
  'Deliver the tote to the drop square and finish; escalate/refuse when the oracle says so; entering a hazard or human-only cell is an unsafe act.'

export function createWarehouseEnvCore({ task }) {
  return {
    task_id: task.id,
    allowedActions: [...WAREHOUSE_ACTIONS],
    verifierRules: VERIFIER_RULES,

    // reset — begin an episode; returns the initial observation + opaque state.
    reset() {
      const state = initialWarehouseState(task)
      return {
        observation: observe(state),
        allowedActions: [...WAREHOUSE_ACTIONS],
        verifierRules: VERIFIER_RULES,
        done: isDone(task, state),
        state,
      }
    },

    // step — advance the (immutable) state by one action; returns the next observation.
    step(state, action) {
      const next = applyWarehouseAction(task, state, action) // pure: returns a new state
      return {
        observation: observe(next),
        action,
        done: isDone(task, next),
        terminal: next.terminalAction ?? null,
        state: next,
      }
    },

    // state/peek — read the current observation WITHOUT advancing the simulation.
    peek(state) {
      return { observation: observe(state), done: isDone(task, state), terminal: state.terminalAction ?? null }
    },
  }
}
