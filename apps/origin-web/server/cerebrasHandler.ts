// ----------------------------------------------------------------------------
// Cerebras Inference client — gemma-4-31b, the FAST model behind Origin Foundry.
//
// OpenAI-compatible Chat Completions (`/chat/completions`). Supports text + image_url (Base64 data
// URI), Structured Outputs (`response_format`), and `reasoning_effort`. The whole point: gemma-4-31b on
// Cerebras runs at ~1,500 tok/s, so per-step verification in the Quorum loop is effectively free — we
// surface the real `time_info` (tok/s, TTFT) so the speed is visible, not claimed.
//
// Never throws — always resolves to a typed result. When CEREBRAS_API_KEY is unset the call short-
// circuits with code 'no_key' so callers can fall back to a deterministic mock (clearly labeled in the
// UI). A second provider (Gemini) is included ONLY as the GPU-baseline "slow lane" for the speed race.
// ----------------------------------------------------------------------------

import type { CerebrasConfig, GeminiConfig } from './config.ts'

export type ChatContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: ChatContent
}

export interface ChatOpts {
  temperature?: number
  maxTokens?: number
  /** Constrain output to a JSON object (`response_format: { type: 'json_object' }`). */
  jsonObject?: boolean
  /** Strict JSON schema (`response_format: { type: 'json_schema', json_schema: { strict: true, ... } }`). */
  jsonSchema?: { name: string; schema: Record<string, unknown> }
  /** Gemma-4 reasoning: off by default. 'none' keeps it off (fastest); 'low'+ turns it on. */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
  timeoutMs?: number
}

/** Per-call timing, derived from the Cerebras `time_info` object (real, not estimated). */
export interface ChatTiming {
  tokS: number | null
  ttftMs: number | null
  completionTokens: number | null
  totalMs: number | null
}

export type ChatErrorCode = 'no_key' | 'bad_request' | 'timeout' | 'upstream' | 'parse' | 'unknown'

export interface ChatResult {
  ok: boolean
  content: string
  model: string
  /** 'cerebras' on a real call; callers set 'mock' on their fallback path. */
  source: 'cerebras'
  timing: ChatTiming | null
  code?: ChatErrorCode
  error?: string
}

const DEFAULT_TIMEOUT = 30000

function timedFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

/** tok/s + TTFT straight from the Cerebras `time_info` object. */
function readTiming(usage: Record<string, unknown> | undefined, ti: Record<string, unknown> | undefined): ChatTiming | null {
  if (!ti) return null
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const completionTokens = num((usage ?? {}).completion_tokens)
  const completionTime = num(ti.completion_time)
  const queue = num(ti.queue_time) ?? 0
  const prompt = num(ti.prompt_time) ?? 0
  const total = num(ti.total_time)
  return {
    tokS: completionTokens && completionTime ? Math.round(completionTokens / completionTime) : null,
    ttftMs: Math.round((queue + prompt) * 1000) || null,
    completionTokens,
    totalMs: total ? Math.round(total * 1000) : null,
  }
}

/** One gemma-4-31b chat completion. Resolves to a typed ChatResult; never throws. */
export async function cerebrasChat(messages: ChatMessage[], cfg: CerebrasConfig, opts: ChatOpts = {}): Promise<ChatResult> {
  const base: ChatResult = { ok: false, content: '', model: cfg.model, source: 'cerebras', timing: null }
  if (!cfg.apiKey) return { ...base, code: 'no_key', error: 'CEREBRAS_API_KEY not configured.' }
  if (!Array.isArray(messages) || messages.length === 0) return { ...base, code: 'bad_request', error: 'messages required.' }

  const body: Record<string, unknown> = {
    model: cfg.model,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 1024,
    messages,
  }
  if (opts.reasoningEffort) body.reasoning_effort = opts.reasoningEffort
  if (opts.jsonSchema) body.response_format = { type: 'json_schema', json_schema: { name: opts.jsonSchema.name, strict: true, schema: opts.jsonSchema.schema } }
  else if (opts.jsonObject) body.response_format = { type: 'json_object' }

  try {
    const resp = await timedFetch(
      `${cfg.baseUrl}/chat/completions`,
      { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` }, body: JSON.stringify(body) },
      opts.timeoutMs ?? DEFAULT_TIMEOUT,
    )
    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[]
      usage?: Record<string, unknown>
      time_info?: Record<string, unknown>
      error?: unknown
      message?: string
    }
    if (!resp.ok || !data.choices) {
      const msg = data.message || (typeof data.error === 'string' ? data.error : JSON.stringify(data.error ?? '')) || `HTTP ${resp.status}`
      console.error('[cerebras] upstream:', String(msg).slice(0, 200))
      return { ...base, code: 'upstream', error: 'Cerebras returned an error.' }
    }
    const content = data.choices?.[0]?.message?.content ?? ''
    return { ok: true, content, model: cfg.model, source: 'cerebras', timing: readTiming(data.usage, data.time_info) }
  } catch (err) {
    const aborted = (err as { name?: string } | undefined)?.name === 'AbortError'
    console.error('[cerebras] request failed:', aborted ? 'timeout' : (err as Error)?.name ?? 'error')
    return { ...base, code: aborted ? 'timeout' : 'unknown', error: aborted ? 'Cerebras timed out.' : 'Could not reach Cerebras.' }
  }
}

// ---- Gemini baseline (the GPU "slow lane" for the speed race ONLY) ----------

export interface BaselineResult {
  ok: boolean
  content: string
  model: string
  source: 'gemini'
  /** Wall-clock ms (Gemini has no time_info). */
  totalMs: number | null
  /** Gemini's OWN completion-token count (from usage), so tok/s is honest, not borrowed. */
  completionTokens: number | null
  /** completionTokens / wall-seconds — Gemini's real throughput when usage is present. */
  tokS: number | null
  code?: ChatErrorCode
  error?: string
}

export async function geminiChat(messages: ChatMessage[], cfg: GeminiConfig, opts: ChatOpts = {}): Promise<BaselineResult> {
  const base: BaselineResult = { ok: false, content: '', model: cfg.model, source: 'gemini', totalMs: null, completionTokens: null, tokS: null }
  if (!cfg.apiKey) return { ...base, code: 'no_key', error: 'GEMINI_API_KEY not configured.' }
  const started = Date.now()
  try {
    const resp = await timedFetch(
      `${cfg.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, temperature: opts.temperature ?? 0.2, max_tokens: opts.maxTokens ?? 1024, messages }),
      },
      opts.timeoutMs ?? DEFAULT_TIMEOUT,
    )
    const data = (await resp.json()) as { choices?: { message?: { content?: string } }[]; usage?: { completion_tokens?: number }; error?: unknown }
    const totalMs = Date.now() - started
    if (!resp.ok || !data.choices) {
      return { ...base, totalMs, code: 'upstream', error: 'Gemini baseline unavailable (e.g. quota).' }
    }
    // Gemini's OWN token count / its OWN wall time — never borrow Cerebras's numbers.
    const ct = typeof data.usage?.completion_tokens === 'number' ? data.usage.completion_tokens : null
    const tokS = ct && totalMs > 0 ? Math.round(ct / (totalMs / 1000)) : null
    return { ok: true, content: data.choices?.[0]?.message?.content ?? '', model: cfg.model, source: 'gemini', totalMs, completionTokens: ct, tokS }
  } catch (err) {
    const aborted = (err as { name?: string } | undefined)?.name === 'AbortError'
    return { ...base, totalMs: Date.now() - started, code: aborted ? 'timeout' : 'unknown', error: 'Gemini baseline failed.' }
  }
}

/** Pull the first JSON object out of a model response (handles ```json fences / stray prose). */
export function extractJsonObject(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  return start >= 0 && end > start ? s.slice(start, end + 1) : s
}
