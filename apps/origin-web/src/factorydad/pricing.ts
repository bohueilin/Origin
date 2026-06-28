// Cost inputs for the "Cost vs readiness" panel.
//
// IMPORTANT: these are the *providers'* published list prices (USD per 1M
// tokens), not Origin pricing — Origin is model-agnostic and runs whatever model
// you bring. List prices move; treat them as illustrative and verify against the
// provider before quoting. Last reviewed 2026-06.
//
// The per-test projection below is grounded in a measured number: the FactoryDad-1
// prompt averages ~686 input tokens/case across the 32 cases (measured from the
// real prompt template). Output is a stated assumption (~250 tokens/case) since a
// licensed answer is a short action list. Cost is therefore an honest estimate of
// running the full readiness test once, not a billed figure.

export interface ModelPrice {
  inPerM: number // USD per 1M input tokens (provider list price)
  outPerM: number // USD per 1M output tokens (provider list price)
}

// Keyed by substring match against the model id (case-insensitive). Public list
// prices, USD / 1M tokens, reviewed 2026-06 — verify before quoting.
export const PRICES: { match: string; price: ModelPrice }[] = [
  { match: 'gpt', price: { inPerM: 2.5, outPerM: 10.0 } }, // ChatGPT (GPT-4o)
  { match: 'gemini', price: { inPerM: 0.3, outPerM: 2.5 } }, // Gemini 2.5 Flash
  { match: 'gemma', price: { inPerM: 0.1, outPerM: 0.3 } }, // Gemma 3 27B (open-weight serving)
  { match: 'opus', price: { inPerM: 15.0, outPerM: 75.0 } }, // Claude Opus 4
  { match: 'command', price: { inPerM: 2.5, outPerM: 10.0 } }, // Cohere Command R+
  { match: 'cohere', price: { inPerM: 2.5, outPerM: 10.0 } },
  { match: 'llama', price: { inPerM: 0.13, outPerM: 0.4 } }, // Llama 3.3 70B (open-weight serving)
  { match: 'deepseek', price: { inPerM: 0.27, outPerM: 1.1 } }, // DeepSeek-V3.2
  { match: 'qwen', price: { inPerM: 0.2, outPerM: 0.6 } }, // Qwen3-235B (open-weight serving)
  { match: 'sonnet', price: { inPerM: 3.0, outPerM: 15.0 } }, // Claude Sonnet 4.6
  { match: 'haiku', price: { inPerM: 1.0, outPerM: 5.0 } }, // Claude Haiku 4.5
  { match: 'minimax', price: { inPerM: 0.2, outPerM: 1.1 } }, // MiniMax-Text-01
  { match: 'glm', price: { inPerM: 1.4, outPerM: 4.4 } }, // GLM 5.2 (743B MoE, Fireworks serverless)
]

export function priceFor(id: string): ModelPrice | null {
  const k = id.toLowerCase()
  return PRICES.find((p) => k.includes(p.match))?.price ?? null
}

// Measured / assumed workload for one full 32-case readiness test.
export const TEST_CASES = 48
export const IN_TOKENS_PER_CASE = 686 // measured average from the prompt template
export const OUT_TOKENS_PER_CASE = 250 // stated assumption: a short action list

/** Projected USD to run the full 32-case readiness test once at list price. */
export function costPerTest(price: ModelPrice): number {
  const inCost = (TEST_CASES * IN_TOKENS_PER_CASE * price.inPerM) / 1_000_000
  const outCost = (TEST_CASES * OUT_TOKENS_PER_CASE * price.outPerM) / 1_000_000
  return inCost + outCost
}

/** Projected USD per 1,000 licensed decisions (one prompt → one verdict each). */
export function costPer1kDecisions(price: ModelPrice): number {
  const inCost = (1000 * IN_TOKENS_PER_CASE * price.inPerM) / 1_000_000
  const outCost = (1000 * OUT_TOKENS_PER_CASE * price.outPerM) / 1_000_000
  return inCost + outCost
}

export function usd(x: number): string {
  if (x < 0.01) return `$${x.toFixed(4)}`
  if (x < 1) return `$${x.toFixed(3)}`
  return `$${x.toFixed(2)}`
}
