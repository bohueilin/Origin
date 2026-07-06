import type { ProviderLatency } from './schemas'

function round(value: number, places = 1) {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

export function maybeSecondsToMs(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null
  }

  return value < 1000 ? round(value * 1000) : round(value)
}

export function computeTokensPerSecond(
  completionTokens: number | null | undefined,
  completionMs: number | null | undefined,
) {
  if (!completionTokens || !completionMs || completionMs <= 0) {
    return null
  }

  return round(completionTokens / (completionMs / 1000), 1)
}

export function aggregateLatencies(
  provider: string,
  label: string,
  model: string,
  mode: ProviderLatency['mode'],
  status: ProviderLatency['status'],
  calls: ProviderLatency[],
  note: string,
): ProviderLatency {
  const totalMs = round(calls.reduce((sum, call) => sum + call.totalMs, 0))
  const queueMs = calls.some((call) => call.queueMs !== null)
    ? round(calls.reduce((sum, call) => sum + (call.queueMs ?? 0), 0))
    : null
  const completionMs = calls.some((call) => call.completionMs !== null)
    ? round(calls.reduce((sum, call) => sum + (call.completionMs ?? 0), 0))
    : null
  const promptTokens = calls.some((call) => call.promptTokens !== null)
    ? calls.reduce((sum, call) => sum + (call.promptTokens ?? 0), 0)
    : null
  const completionTokens = calls.some((call) => call.completionTokens !== null)
    ? calls.reduce((sum, call) => sum + (call.completionTokens ?? 0), 0)
    : null

  return {
    provider,
    label,
    model,
    mode,
    status,
    totalMs,
    queueMs,
    completionMs,
    promptTokens,
    completionTokens,
    tokensPerSecond: computeTokensPerSecond(completionTokens, completionMs),
    note,
  }
}

// Project a real single-call live baseline up to the same generated-token budget as
// the Cerebras repair loop, so the race compares equal work (loop vs loop) instead of
// Cerebras's 5-call loop vs the baseline's 1 call. Without this the live race can show
// the GPU "winning" purely because it did one-fifth of the work. Simulation/recorded
// baselines are already loop-scaled and pass through unchanged.
export function projectBaselineToLoop(
  baseline: ProviderLatency,
  loopCompletionTokens: number | null,
): ProviderLatency {
  if (!baseline.tokensPerSecond || !loopCompletionTokens) {
    return baseline
  }

  const completionMs = round(loopCompletionTokens / (baseline.tokensPerSecond / 1000))
  const queueMs = baseline.queueMs ?? 0
  const overhead = Math.max(
    0,
    baseline.totalMs - (baseline.completionMs ?? baseline.totalMs) - queueMs,
  )
  const totalMs = round(completionMs + queueMs + overhead)

  return {
    ...baseline,
    label: `${baseline.label} · projected to loop`,
    completionTokens: loopCompletionTokens,
    completionMs,
    totalMs,
    note: `${baseline.note} Measured at ${baseline.tokensPerSecond} tok/s on one call; projected to the loop's ${loopCompletionTokens}-token budget for a like-for-like comparison.`,
  }
}

export function computeSpeedup(cerebrasMs: number, baselineMs: number) {
  if (cerebrasMs <= 0 || baselineMs <= 0) {
    return 1
  }

  return round(baselineMs / cerebrasMs, 1)
}

export function formatMs(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'n/a'
  }

  if (value >= 1000) {
    return `${round(value / 1000, 2)}s`
  }

  return `${Math.round(value)}ms`
}

export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'n/a'
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value < 100 ? 1 : 0,
  }).format(value)
}
