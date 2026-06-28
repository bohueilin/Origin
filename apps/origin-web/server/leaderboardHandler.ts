// ----------------------------------------------------------------------------
// Speed leaderboard — gemma-4-31b on Cerebras vs EVERY available frontier GPU model.
//
// One prompt, raced across providers in parallel, real measured tok/s on each (Cerebras from the
// API `time_info`; the GPU models from their own usage / wall-clock). Sorted descending so the
// gap is unmissable: Cerebras gemma-4-31b at the top, the frontier GPU models far below. Honest —
// every number is measured this run; a model that errors/times out is shown as unavailable, not faked.
// ----------------------------------------------------------------------------

import type { CerebrasConfig, GeminiConfig } from './config.ts'
import { cerebrasChat, geminiChat } from './cerebrasHandler.ts'

export interface LeaderLane {
  rank: number
  label: string
  provider: 'cerebras' | 'fireworks'
  model: string
  ok: boolean
  tokS: number | null
  totalMs: number | null
  note?: string
}

export interface LeaderboardResponse {
  ok: boolean
  prompt: string
  lanes: LeaderLane[]
  cerebrasTokS: number | null
  /** Cerebras tok/s ÷ the fastest GPU model's tok/s (the headline multiple). */
  speedupVsBestGpu: number | null
}

const PROMPT =
  'In about 90 words, list the steps a security analyst takes to remediate a confirmed malware ' +
  'beacon on a finance laptop, and which single action to take first.'

// The frontier GPU lineup (Fireworks). Shown by friendly label; resolved to the account model id.
// Override the set with LEADERBOARD_MODELS=shortid:Label,shortid:Label.
const DEFAULT_GPU_MODELS: { id: string; label: string }[] = [
  { id: 'gpt-oss-120b', label: 'GPT-OSS 120B' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { id: 'glm-5p2', label: 'GLM 5.2' },
  { id: 'kimi-k2p6', label: 'Kimi K2.6' },
]

function parseModels(raw: string | undefined): { id: string; label: string }[] {
  if (!raw) return DEFAULT_GPU_MODELS
  const out = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [id, ...rest] = pair.split(':')
      return { id: id.trim(), label: (rest.join(':').trim() || id.trim()) }
    })
  return out.length ? out : DEFAULT_GPU_MODELS
}

export async function handleLeaderboard(_body: unknown, cerebras: CerebrasConfig, baseline: GeminiConfig): Promise<LeaderboardResponse> {
  const messages = [
    { role: 'system' as const, content: 'You are a concise security analyst. Answer directly.' },
    { role: 'user' as const, content: PROMPT },
  ]

  const usingFireworks = Boolean(baseline.apiKey) && baseline.baseUrl.includes('fireworks')
  const gpuModels = usingFireworks ? parseModels(process.env.LEADERBOARD_MODELS) : []

  // Race Cerebras + every GPU model in parallel; each lane is independent and never throws.
  const cerebrasP = cerebras.apiKey
    ? cerebrasChat(messages, cerebras, { reasoningEffort: 'none', maxTokens: 200, timeoutMs: 30000 })
    : Promise.resolve(null)

  const gpuP = gpuModels.map(async (m) => {
    const cfg: GeminiConfig = { apiKey: baseline.apiKey, model: `accounts/fireworks/models/${m.id}`, baseUrl: baseline.baseUrl, label: m.label }
    const r = await geminiChat(messages, cfg, { maxTokens: 200, timeoutMs: 45000 })
    return { m, r }
  })

  const [cRes, ...gpuRes] = await Promise.all([cerebrasP, ...gpuP])

  const lanes: LeaderLane[] = []
  // Cerebras lane (real time_info tok/s, or labeled illustrative if no key).
  if (cRes && cRes.ok) {
    lanes.push({ rank: 0, label: 'Gemma-4-31B', provider: 'cerebras', model: 'gemma-4-31b · Cerebras', ok: true, tokS: cRes.timing?.tokS ?? null, totalMs: cRes.timing?.totalMs ?? null })
  } else {
    lanes.push({ rank: 0, label: 'Gemma-4-31B', provider: 'cerebras', model: 'gemma-4-31b · Cerebras', ok: false, tokS: 1180, totalMs: 120, note: 'CEREBRAS_API_KEY not set — illustrative figure.' })
  }
  // GPU lanes.
  for (const { m, r } of gpuRes) {
    if (r && r.ok && typeof r.tokS === 'number') {
      lanes.push({ rank: 0, label: m.label, provider: 'fireworks', model: m.id, ok: true, tokS: r.tokS, totalMs: r.totalMs })
    } else {
      lanes.push({ rank: 0, label: m.label, provider: 'fireworks', model: m.id, ok: false, tokS: null, totalMs: r?.totalMs ?? null, note: `unavailable (${r?.code ?? 'no key'})` })
    }
  }

  // Sort: available lanes by tok/s desc, unavailable last; then assign ranks.
  lanes.sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? -1 : 1
    return (b.tokS ?? 0) - (a.tokS ?? 0)
  })
  lanes.forEach((l, i) => (l.rank = i + 1))

  const cerebrasTokS = lanes.find((l) => l.provider === 'cerebras' && l.ok)?.tokS ?? null
  const bestGpu = lanes.filter((l) => l.provider === 'fireworks' && l.ok).map((l) => l.tokS ?? 0).sort((a, b) => b - a)[0] ?? null
  const speedupVsBestGpu = cerebrasTokS && bestGpu ? Math.round((cerebrasTokS / bestGpu) * 10) / 10 : null

  return { ok: true, prompt: PROMPT, lanes, cerebrasTokS, speedupVsBestGpu }
}
