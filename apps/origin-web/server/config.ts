// ----------------------------------------------------------------------------
// Typed configuration for the standalone server.
//
// Loads from process.env, falling back to a .env.local file (dependency-free, so
// no dotenv needed). Validates required values and collects human-readable
// warnings instead of crashing — the server should boot in a degraded mode
// (e.g. no InsForge) for local dev, and fail loudly only on hard prod errors.
// ----------------------------------------------------------------------------

import fs from 'node:fs'
import path from 'node:path'

export interface NebiusConfig {
  apiKey?: string
  model?: string
  baseUrl?: string
}

export interface InsforgeConfig {
  baseUrl?: string
  apiKey?: string
}

export interface MinimaxConfig {
  apiKey?: string
  model?: string
  baseUrl?: string
}

/**
 * Cerebras Inference (gemma-4-31b) — the FAST model that powers Origin Foundry's Quorum loop
 * (Perceiver / Planner / Guardian) and the floor-image → environment parse. OpenAI-compatible
 * Chat Completions; ~1,500 tok/s makes per-step verification free. Server-side key only.
 */
export interface CerebrasConfig {
  apiKey?: string
  model: string
  baseUrl: string
}

/**
 * The GPU-baseline provider for the side-by-side speed/loop race (the "slow lane").
 * Provider-agnostic OpenAI-compatible config — defaults to Fireworks (a real GPU inference API),
 * falling back to Gemini, then to a labeled illustrative figure when no key is valid. `label` is
 * what the UI shows (e.g. "Fireworks · llama-3.3-70b"). (Field name kept `gemini` for compat.)
 */
export interface GeminiConfig {
  apiKey?: string
  model: string
  baseUrl: string
  label?: string
}

export interface AppConfig {
  port: number
  isProd: boolean
  nebius: NebiusConfig
  insforge: InsforgeConfig
  /** MiniMax voice-intake structuring (server-side key only). */
  minimax: MinimaxConfig
  /** Cerebras gemma-4-31b — Foundry's fast agent/verifier model. */
  cerebras: CerebrasConfig
  /** Gemini — GPU baseline for the speed race only. */
  gemini: GeminiConfig
  /** HMAC secret for signing stateless episode tokens. */
  episodeSecret: string
  /** Non-fatal configuration warnings to log at startup. */
  warnings: string[]
}

const DEV_EPISODE_SECRET = 'dev-insecure-episode-secret-change-me'

/** Parse a .env.local file into a flat map. Returns {} if absent. */
function readDotEnvLocal(cwd: string): Record<string, string> {
  const file = path.join(cwd, '.env.local')
  if (!fs.existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

export function loadConfig(cwd: string = process.cwd()): AppConfig {
  const file = readDotEnvLocal(cwd)
  // process.env always wins over .env.local (prod injects real env).
  const get = (k: string): string | undefined => process.env[k] ?? file[k] ?? undefined

  const isProd = (get('NODE_ENV') ?? 'development') === 'production'
  const warnings: string[] = []

  const nebius: NebiusConfig = {
    apiKey: get('NEBIUS_API_KEY'),
    model: get('NEBIUS_MODEL'),
    baseUrl: get('NEBIUS_BASE_URL'),
  }
  const insforge: InsforgeConfig = {
    baseUrl: get('INSFORGE_BASE_URL'),
    apiKey: get('INSFORGE_API_KEY'),
  }
  const minimax: MinimaxConfig = {
    apiKey: get('MINIMAX_API_KEY'),
    model: get('MINIMAX_MODEL'),
    baseUrl: get('MINIMAX_BASE_URL'),
  }
  const cerebras: CerebrasConfig = {
    apiKey: get('CEREBRAS_API_KEY'),
    model: get('CEREBRAS_MODEL') || 'gemma-4-31b',
    baseUrl: (get('CEREBRAS_BASE_URL') || 'https://api.cerebras.ai/v1').replace(/\/+$/, ''),
  }
  // The race baseline: prefer Fireworks (real GPU inference, OpenAI-compatible), then Gemini, else
  // illustrative. Override with BASELINE_* to point at any OpenAI-compatible GPU endpoint.
  const fwKey = get('FIREWORKS_API_KEY')
  const geminiKey = get('GEMINI_API_KEY')
  const baselineKey = get('BASELINE_API_KEY')
  let gemini: GeminiConfig
  if (baselineKey) {
    gemini = { apiKey: baselineKey, model: get('BASELINE_MODEL') || 'gpt-4o-mini', baseUrl: (get('BASELINE_BASE_URL') || 'https://api.openai.com/v1').replace(/\/+$/, ''), label: get('BASELINE_LABEL') || 'GPU baseline' }
  } else if (fwKey) {
    gemini = { apiKey: fwKey, model: get('FIREWORKS_BASELINE_MODEL') || 'accounts/fireworks/models/llama-v3p3-70b-instruct', baseUrl: 'https://api.fireworks.ai/inference/v1', label: 'Fireworks · llama-3.3-70b' }
  } else if (geminiKey) {
    gemini = { apiKey: geminiKey, model: get('GEMINI_MODEL') || 'gemini-2.0-flash', baseUrl: (get('GEMINI_BASE_URL') || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/+$/, ''), label: 'Gemini' }
  } else {
    gemini = { model: 'gpu-baseline', baseUrl: 'https://example.invalid', label: 'GPU baseline' }
  }

  if (!nebius.apiKey) warnings.push('NEBIUS_API_KEY not set — the Nebius reference agent will be unavailable.')
  if (!minimax.apiKey) warnings.push('MINIMAX_API_KEY not set — voice intake falls back to the raw transcript.')
  if (!cerebras.apiKey) warnings.push('CEREBRAS_API_KEY not set — Foundry runs gemma-4-31b in MOCK mode (set the key for real, fast inference).')
  if (!insforge.baseUrl || !insforge.apiKey) {
    warnings.push('INSFORGE_* not set — per-run license history falls back to in-memory (single instance).')
  }

  let episodeSecret = get('EPISODE_SIGNING_SECRET') ?? ''
  if (!episodeSecret) {
    if (isProd) {
      throw new Error('EPISODE_SIGNING_SECRET is required in production (signs stateless episode tokens).')
    }
    episodeSecret = DEV_EPISODE_SECRET
    warnings.push('EPISODE_SIGNING_SECRET not set — using an insecure dev secret. Do NOT use in production.')
  }

  const port = Number(get('PORT') ?? '8787')
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${get('PORT')}`)
  }

  return { port, isProd, nebius, insforge, minimax, cerebras, gemini, episodeSecret, warnings }
}
