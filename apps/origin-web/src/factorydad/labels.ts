// Small display helpers shared across dashboard components.

// The curated lineup → buyer-recognizable names. (Underlying eval model id is
// shown as precise sub-text where space allows; see modelSubLabel.)
export function modelLabel(id: string): string {
  const k = id.toLowerCase()
  if (k.includes('gpt') || k.includes('chatgpt')) return 'ChatGPT'
  if (k.includes('gemini')) return 'Gemini'
  if (k.includes('gemma')) return 'Gemma'
  if (k.includes('opus')) return 'Opus'
  if (k.includes('cohere') || k.includes('command')) return 'Cohere'
  if (k.includes('llama')) return 'Llama'
  if (k.includes('deepseek')) return 'DeepSeek'
  if (k.includes('qwen')) return 'Qwen'
  if (k.includes('sonnet')) return 'Sonnet'
  if (k.includes('haiku')) return 'Haiku'
  if (k.includes('minimax')) return 'MiniMax'
  if (k.includes('glm')) return 'GLM'
  return id
}

/** The exact model evaluated, shown small under the friendly label for precision. */
export function modelSubLabel(id: string): string {
  const k = id.toLowerCase()
  // Cerebras-served lineup — flagged so the speed/cost wedge reads at a glance.
  if (k.includes('gemma-4-31b')) return 'Gemma 4 31B · Cerebras'
  if (k.includes('gpt-oss')) return 'GPT-OSS 120B · Cerebras'
  if (k.includes('glm-4')) return 'GLM 4.7 · Cerebras'
  if (k.includes('gpt-5.5')) return 'GPT-5.5'
  if (k.includes('gpt-4o')) return 'GPT-4o'
  if (k.includes('gemini-2.5')) return 'Gemini 2.5 Flash'
  if (k.includes('gemini-2.0')) return 'Gemini 2.0 Flash'
  if (k.includes('gemini')) return 'Gemini'
  if (k.includes('gemma-3-27b')) return 'Gemma 3 27B'
  if (k.includes('opus')) return 'Claude Opus 4.8'
  if (k.includes('command-r-plus')) return 'Command R+'
  if (k.includes('llama-3.3-70b')) return 'Llama 3.3 70B'
  if (k.includes('deepseek')) return 'DeepSeek V4'
  if (k.includes('qwen3-235b')) return 'Qwen3-235B'
  if (k.includes('sonnet')) return 'Claude Sonnet 4.6'
  if (k.includes('haiku')) return 'Claude Haiku 4.5'
  if (k.includes('minimax')) return 'MiniMax-Text-01'
  if (k.includes('glm')) return 'GLM 5.2'
  return id
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`
}

export const TERMINAL_COLOR: Record<string, string> = {
  finish: 'var(--pos)',
  escalate: 'var(--warn)',
  refuse: 'var(--neg)',
}

export const SEVERITY_COLOR: Record<string, string> = {
  none: 'var(--muted)',
  low: 'var(--pos)',
  medium: 'var(--warn)',
  high: 'var(--neg)',
  critical: 'var(--neg)',
}

// Tier -> semantic color (safety reading: higher = greener).
export function tierColor(tier: string): string {
  if (tier === 'L4' || tier === 'L3') return 'var(--pos)'
  if (tier === 'L2') return 'var(--warn)'
  return 'var(--neg)'
}
