import { computeTokensPerSecond } from './latency'
import type { ProviderLatency } from './schemas'

type BaselineConfig = {
  provider: string
  apiKey?: string
  baseUrl?: string
  model?: string
}

type BaselineResponse = {
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
  }
}

function nowMs() {
  return globalThis.performance?.now() ?? Date.now()
}

function defaultBaseUrl(provider: string) {
  if (provider === 'fireworks') {
    return 'https://api.fireworks.ai/inference/v1/chat/completions'
  }

  return 'https://api.openai.com/v1/chat/completions'
}

// Projected from a real measured Fireworks gpt-oss-120b GPU run (2026-06-29, ~150 tok/s
// sustained), normalized to the same generated-token budget as the Cerebras repair loop.
// Used only when no live baseline key is configured; always labeled as a projection.
export function baselineSimulation(note = 'No live baseline provider configured.'): ProviderLatency {
  return {
    provider: 'GPU baseline',
    label: 'OpenAI gpt-oss-120b (projected)',
    model: 'gpt-oss-120b',
    mode: 'simulation',
    status: 'complete',
    totalMs: 8_963,
    queueMs: 920,
    completionMs: 7_370,
    promptTokens: 3290,
    completionTokens: 1474,
    tokensPerSecond: 200,
    note,
  }
}

export async function runBaselineComparison(config: BaselineConfig): Promise<ProviderLatency> {
  const provider = config.provider || 'simulation'
  const apiKey = config.apiKey
  const model =
    config.model ||
    (provider === 'fireworks' ? 'accounts/fireworks/models/gpt-oss-120b' : '')

  if (!apiKey || !model || provider === 'simulation') {
    return baselineSimulation('Baseline simulation: configure BASELINE_API_KEY and BASELINE_MODEL, or FIREWORKS_API_KEY, to run a live comparison.')
  }

  const started = nowMs()

  try {
    const response = await fetch(config.baseUrl || defaultBaseUrl(provider), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Return compact JSON only. You are a baseline provider for latency comparison.',
          },
          {
            role: 'user',
            content:
              'Cluster this support failure: customers canceled subscriptions but were charged again; current agent over-escalates instead of checking identity, posted charge status, and dispute eligibility. Return {"cluster": string, "root_cause": string, "patch": string}.',
          },
        ],
      }),
    })

    const measuredMs = Math.round(nowMs() - started)
    const text = await response.text()

    if (!response.ok) {
      return {
        ...baselineSimulation(`Live baseline request failed with HTTP ${response.status}; showing baseline simulation.`),
        mode: 'fallback',
        status: 'fallback',
      }
    }

    let parsed: BaselineResponse = {}

    try {
      parsed = JSON.parse(text) as BaselineResponse
    } catch {
      parsed = {}
    }

    const completionTokens = parsed.usage?.completion_tokens ?? null
    const completionMs = measuredMs

    return {
      provider: provider === 'fireworks' ? 'Fireworks' : 'Baseline',
      label: 'Live GPU baseline',
      model,
      mode: 'live',
      status: 'complete',
      totalMs: measuredMs,
      queueMs: null,
      completionMs,
      promptTokens: parsed.usage?.prompt_tokens ?? null,
      completionTokens,
      tokensPerSecond: computeTokensPerSecond(completionTokens, completionMs),
      note: 'Live baseline measured through an OpenAI-compatible provider.',
    }
  } catch {
    return {
      ...baselineSimulation('Live baseline request failed; showing baseline simulation.'),
      mode: 'fallback',
      status: 'fallback',
    }
  }
}
