import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  computeTokensPerSecond,
  projectBaselineToLoop,
} from '../src/lib/latency'
import type { ProviderLatency } from '../src/lib/schemas'

test('computeTokensPerSecond derives rounded generation throughput', () => {
  assert.equal(computeTokensPerSecond(125, 500), 250)
  assert.equal(computeTokensPerSecond(123, 456), 269.7)
  assert.equal(computeTokensPerSecond(0, 500), null)
  assert.equal(computeTokensPerSecond(125, 0), null)
  assert.equal(computeTokensPerSecond(null, 500), null)
})

test('projectBaselineToLoop projects completion time while preserving queue and overhead', () => {
  const baseline: ProviderLatency = {
    provider: 'baseline',
    label: 'Reference GPU',
    model: 'reference-model',
    mode: 'live',
    status: 'complete',
    totalMs: 1500,
    queueMs: 100,
    completionMs: 1000,
    promptTokens: 50,
    completionTokens: 50,
    tokensPerSecond: 50,
    note: 'Measured live.',
  }

  const projected = projectBaselineToLoop(baseline, 200)

  assert.equal(projected.label, 'Reference GPU · projected to loop')
  assert.equal(projected.completionTokens, 200)
  assert.equal(projected.completionMs, 4000)
  assert.equal(projected.totalMs, 4500)
  assert.match(projected.note, /projected to the loop's 200-token budget/)
})

test('projectBaselineToLoop leaves unprojectable baselines unchanged', () => {
  const baseline: ProviderLatency = {
    provider: 'baseline',
    label: 'Recorded baseline',
    model: 'reference-model',
    mode: 'recorded',
    status: 'complete',
    totalMs: 2500,
    queueMs: null,
    completionMs: null,
    promptTokens: null,
    completionTokens: null,
    tokensPerSecond: null,
    note: 'Already loop-scaled.',
  }

  assert.equal(projectBaselineToLoop(baseline, 200), baseline)
  const missingLoopBudget = { ...baseline, tokensPerSecond: 50 }
  assert.equal(projectBaselineToLoop(missingLoopBudget, null), missingLoopBudget)
})
