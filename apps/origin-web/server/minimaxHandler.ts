// ----------------------------------------------------------------------------
// Server-side MiniMax proxy for VOICE INTAKE only.
//
// Runs only in the Node process (called by the Hono server). The MINIMAX_API_KEY
// lives here and is NEVER sent to the browser. The client posts a raw speech
// transcript; this module asks MiniMax to clean it up and structure it into the
// capture form fields, validates/clamps the result against our enums, and returns
// plain JSON.
//
// Trust boundary: this is INTAKE AUTHORING. The structured fields only pre-fill a
// form the human reviews. They never reach the oracle, reward, label, or license —
// the deterministic oracle remains the source of truth.
// ----------------------------------------------------------------------------

import {
  PHYSICAL_DOMAINS,
  ROBOT_EMBODIMENTS,
  type PhysicalDomain,
  type RobotEmbodiment,
} from '../src/environmentPlan.ts'

export interface MinimaxConfig {
  apiKey?: string
  model?: string
  baseUrl?: string
  timeoutMs?: number
}

export interface VoiceFields {
  outcome: string
  description: string
  safetyRules: string[]
  domain: PhysicalDomain
  embodiment: RobotEmbodiment
}

export type VoiceErrorCode = 'no_key' | 'bad_request' | 'timeout' | 'upstream' | 'parse' | 'unknown'

export type VoiceResult =
  | { ok: true; fields: VoiceFields; model: string }
  | { ok: false; code: VoiceErrorCode; error: string }

const DEFAULT_BASE_URL = 'https://api.minimax.io/v1'
const DEFAULT_MODEL = 'MiniMax-Text-01'
const TRANSCRIPT_MAX = 4000
const DEFAULT_DOMAIN: PhysicalDomain = 'manufacturing'
const DEFAULT_EMBODIMENT: RobotEmbodiment = 'humanoid'

const SYSTEM_PROMPT = `You convert a spoken description of a physical workplace into a structured intake form
for a robot-safety evaluation. The speaker may be non-technical (e.g. an elderly owner).

Clean the transcript: drop filler ("um", "uh"), false starts, and self-corrections
(if they say "wait, scratch that, make it X", keep only X). Do not invent facts that
were not said; leave a field empty rather than guessing.

Return STRICT minified JSON, no markdown, no prose, in exactly this shape:
{"outcome":"one-sentence job to be done","description":"what happens in the workflow, plain language","safetyRules":["short rule", "..."],"domain":"<one of the allowed domains>","embodiment":"<one of the allowed embodiments>"}

allowed domains: ${PHYSICAL_DOMAINS.join(', ')}
allowed embodiments: ${ROBOT_EMBODIMENTS.join(', ')}

If the domain or robot type is unclear, choose the closest allowed value. safetyRules
is an array of short imperative rules (may be empty). Output JSON only.`

function clampStr(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** Pull a JSON object out of a model response that may be fenced or chatty. */
export function extractJson(raw: string): string {
  let t = raw.trim()
  if (t.startsWith('```')) {
    t = t
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim()
  }
  if (t.startsWith('{')) return t
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  return start >= 0 && end > start ? t.slice(start, end + 1) : t
}

/** Validate + clamp the model output into safe form fields. Returns null if the
 *  result carries no usable content. Enums are always coerced to a valid value. */
export function normalizeVoiceFields(raw: unknown): VoiceFields | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>

  const outcome = clampStr(o.outcome, 400)
  const description = clampStr(o.description, 1000)

  let safetyRules: string[] = []
  if (Array.isArray(o.safetyRules)) {
    safetyRules = o.safetyRules.map((r) => clampStr(r, 200)).filter(Boolean).slice(0, 12)
  } else if (typeof o.safetyRules === 'string') {
    safetyRules = o.safetyRules
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean)
      .slice(0, 12)
  }

  const domainRaw = clampStr(o.domain, 40)
  const domain = (PHYSICAL_DOMAINS as string[]).includes(domainRaw)
    ? (domainRaw as PhysicalDomain)
    : DEFAULT_DOMAIN
  const embodimentRaw = clampStr(o.embodiment, 40)
  const embodiment = (ROBOT_EMBODIMENTS as string[]).includes(embodimentRaw)
    ? (embodimentRaw as RobotEmbodiment)
    : DEFAULT_EMBODIMENT

  // Require at least some usable content; enums alone aren't enough.
  if (!outcome && !description && safetyRules.length === 0) return null
  return { outcome, description, safetyRules, domain, embodiment }
}

/**
 * Validate the transcript, call MiniMax (`/text/chatcompletion_v2`), and return
 * validated form fields. Never throws — always resolves to a typed VoiceResult the
 * caller can serialize. The key is never echoed and upstream bodies are not surfaced.
 */
export async function handleVoiceStructure(body: unknown, cfg: MinimaxConfig): Promise<VoiceResult> {
  const transcript = clampStr((body as { transcript?: unknown } | undefined)?.transcript, TRANSCRIPT_MAX)
  if (transcript.length < 2) {
    return { ok: false, code: 'bad_request', error: 'A non-empty transcript is required.' }
  }
  if (!cfg.apiKey) {
    return { ok: false, code: 'no_key', error: 'Voice structuring is not configured on the server.' }
  }

  const model = cfg.model || DEFAULT_MODEL
  const baseUrl = (cfg.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const timeoutMs = cfg.timeoutMs ?? 20000

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(`${baseUrl}/text/chatcompletion_v2`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 600,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: transcript },
        ],
      }),
      signal: controller.signal,
    })

    if (!resp.ok) {
      console.error(`[minimax] upstream ${resp.status} ${resp.statusText}`)
      return { ok: false, code: 'upstream', error: 'The voice service returned an error.' }
    }

    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[]
      base_resp?: { status_code?: number; status_msg?: string }
    }
    if (data?.base_resp && data.base_resp.status_code && data.base_resp.status_code !== 0) {
      console.error(`[minimax] base_resp ${data.base_resp.status_code} ${data.base_resp.status_msg ?? ''}`)
      return { ok: false, code: 'upstream', error: 'The voice service returned an error.' }
    }

    const content = data?.choices?.[0]?.message?.content
    if (!content) {
      return { ok: false, code: 'parse', error: 'The voice service returned an empty response.' }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(extractJson(content))
    } catch {
      return { ok: false, code: 'parse', error: 'The voice response was not valid JSON.' }
    }

    const fields = normalizeVoiceFields(parsed)
    if (!fields) {
      return { ok: false, code: 'parse', error: 'The voice response did not contain usable fields.' }
    }
    return { ok: true, fields, model }
  } catch (err) {
    const aborted = (err as { name?: string } | undefined)?.name === 'AbortError'
    // Log a category only — never the raw error object, which sits on a secret-bearing
    // request. (Fetch errors don't include headers, but this is belt-and-suspenders.)
    console.error('[minimax] request failed:', aborted ? 'timeout' : 'network_error')
    return aborted
      ? { ok: false, code: 'timeout', error: 'The voice service took too long to respond.' }
      : { ok: false, code: 'unknown', error: 'Could not reach the voice service.' }
  } finally {
    clearTimeout(timer)
  }
}
