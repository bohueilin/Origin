// Origin Training Evidence — Executor (P4: provider-agnostic execution seam)
// =============================================================================
// One interface unifies the in-process Tier-1 gym, the OpenEnv HTTP server (P2), and
// the Daytona snapshot/fork/reset provider (P4). The Executor is the OUTER lifecycle;
// OriginEnvCore (./origin-env-core.mjs) is the INNER kernel it drives.
//
//   Executor {
//     prepare(bundle)            -> handle    // guards bundleDigest == env_bundle_digest
//     forkRollout(handle, {task}) -> session  // an ISOLATED, deterministic rollout
//     step(session, action)      -> { observation, done, terminal, applied }
//     state(session)             -> { observation, done, terminal }   // no advance
//     reset(session)             -> initial obs (restore to the golden snapshot)
//     meter(session)             -> { sandbox_seconds, wall_ms, tier }
//     teardown(handle)           -> void
//   }
//
// Daytona mapping: snapshot = golden content-addressed env state (env_bundle_digest);
// fork = a parallel isolated rollout; reset = a deterministic episode boundary.
//
// HONESTY: FakeDaytona is a FAKE. The CONTRACT is real; container/network isolation is
// NOT — real Daytona/Modal is P1. sandbox_seconds is a DETERMINISTIC synthetic clock
// (= applied step count), never wall-clock, so receipts reproduce in vitest.
// =============================================================================

import { bundleDigest } from '@origin/evidence/env-evidence'
import { createWarehouseEnvCore } from './origin-env-core.mjs'

function guardDigest(bundle) {
  if (bundleDigest(bundle) !== bundle.env_bundle_digest) {
    throw new Error('executor.prepare: env_bundle_digest mismatch — refusing to run a tampered bundle')
  }
  return bundle.env_bundle_digest
}

// step/state are identical across providers (both drive the same OriginEnvCore).
function stepSession(session, action) {
  if (session.done) return { observation: session.lastObs, done: true, terminal: session.terminal ?? null, applied: false }
  const r = session.core.step(session.state, action)
  session.state = r.state
  session.steps += 1
  session.done = r.done
  session.terminal = r.terminal
  session.lastObs = r.observation
  return { observation: r.observation, done: r.done, terminal: r.terminal, applied: true }
}
function stateSession(session) {
  return session.core.peek(session.state)
}

// ── Tier-1: in-process, no sandbox (cheap massive parallelism).
export function InProcessExecutor() {
  return {
    kind: 'in_process',
    prepare(bundle) {
      return { env_bundle_digest: guardDigest(bundle) }
    },
    forkRollout(handle, { task }) {
      const core = createWarehouseEnvCore({ task })
      const init = core.reset()
      return { core, golden: init.state, state: init.state, steps: 0, done: false, lastObs: init.observation, terminal: null }
    },
    step: stepSession,
    state: stateSession,
    reset(session) {
      session.state = session.golden
      session.steps = 0
      session.done = false
      session.terminal = null
      return session.core.peek(session.golden)
    },
    meter(session) {
      return { sandbox_seconds: session.steps, wall_ms: 0, tier: 'in_process' }
    },
    teardown() {},
  }
}

// ── Tier-2: Daytona (fake). Content-addressed snapshot map + isolated forks.
export function FakeDaytona() {
  const snapshots = new Map() // env_bundle_digest -> golden marker (the content-addressed snapshot)
  return {
    kind: 'daytona',
    provider: {
      name: 'fake-daytona',
      isolation: 'in-memory-copy',
      proven: false, // CONTRACT only — NOT real container/network isolation (real Daytona is P1)
      note: 'snapshot=golden content-addressed state · fork=parallel isolated rollout · reset=episode boundary',
    },
    prepare(bundle) {
      const digest = guardDigest(bundle)
      snapshots.set(digest, { env_bundle_digest: digest }) // snapshot the golden env state, keyed by its digest
      return { env_bundle_digest: digest }
    },
    forkRollout(handle, { task }) {
      if (!snapshots.has(handle.env_bundle_digest)) throw new Error('forkRollout: no snapshot prepared for this env_bundle_digest')
      const core = createWarehouseEnvCore({ task }) // an isolated deterministic clone of the golden snapshot
      const init = core.reset()
      return { core, golden: init.state, state: init.state, steps: 0, done: false, lastObs: init.observation, terminal: null }
    },
    step: stepSession,
    state: stateSession,
    reset(session) {
      session.state = session.golden // restore to the golden snapshot (deterministic episode boundary)
      session.steps = 0
      session.done = false
      session.terminal = null
      return session.core.peek(session.golden)
    },
    meter(session) {
      return { sandbox_seconds: session.steps, wall_ms: 0, tier: 'daytona-fake' }
    },
    teardown() {},
  }
}

export function makeExecutor(tier) {
  if (tier === 'fake-daytona' || tier === 'daytona') return FakeDaytona()
  return InProcessExecutor()
}
