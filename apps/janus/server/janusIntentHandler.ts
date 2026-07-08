// ----------------------------------------------------------------------------
// The Origin / Janus brain — server-side intent understanding via GMI Cloud.
//
// Runs ONLY in the Node process (Hono server). The GMI_API_KEY lives here and is
// never sent to the browser. The frontend posts only a short spoken/typed
// transcript; this file calls a GMI-hosted model (OpenAI-compatible) to classify
// it into ONE of the three Janus scenarios and restate what it heard.
//
// It never executes anything — it only routes intent. The deterministic Janus
// engine still owns grants, approvals, and execution.
// ----------------------------------------------------------------------------

export interface GmiIntentConfig {
  apiKey?: string
  model?: string
  baseUrl?: string
  timeoutMs?: number
}

export type IntentScenarioId = 'fill-my-night' | 'enrich-my-life' | 'airport-pickup'

export interface IntentResult {
  scenario_id: IntentScenarioId
  /** One warm sentence restating what the user asked for. */
  summary: string
  /** One concrete personalization the agent will honor (e.g. "repeat your usual DoorDash"). */
  personalization: string
  confidence: number
}

export type IntentErrorCode = 'no_key' | 'bad_request' | 'timeout' | 'upstream' | 'parse' | 'unknown'

export type IntentReply =
  | { ok: true; intent: IntentResult; model: string }
  | { ok: false; code: IntentErrorCode; error: string }

const SCENARIO_IDS: IntentScenarioId[] = ['fill-my-night', 'enrich-my-life', 'airport-pickup']

const DEFAULT_BASE_URL = 'https://api.gmi-serving.com/v1'
// Fallback only — the real model comes from GMI_MODEL. Must be a valid GMI catalog id.
const DEFAULT_MODEL = 'anthropic/claude-opus-4.8'
const MAX_TRANSCRIPT = 800

const SYSTEM_PROMPT = `You are Origin — the intent brain for Janus, a control plane for delegated agent autonomy.
A person speaks (or types) a real-life request. Route it to EXACTLY ONE of these three scenarios:

- "fill-my-night": find a hackathon or builder/tech EVENT to attend tonight, check the calendar, prepare an event registration, draft a message to hackmates. (Going OUT to an organized event.)
- "enrich-my-life": plan a GAME NIGHT / sports night at home — pick a free evening, set up a spoiler-safe FIFA match replay, ORDER DINNER (e.g. a usual DoorDash order), and INVITE FRIENDS to a Discord group. Choose this for "plan a game night", "order dinner", "invite my friends", "watch the game".
- "airport-pickup": coordinate a ride / airport pickup (e.g. from SFO) to an event without leaving, track a flight, share safety details, optionally plan dinner.

Pick the single best fit even if the request is loose. Then:
- "summary": one warm, natural sentence restating what you heard (first person, e.g. "Got it — you want a relaxed FIFA night with your usual DoorDash, no spoilers.").
- "personalization": one concrete thing you'll honor for them (e.g. "repeat your last DoorDash order", "avoid match spoilers", "keep you at the event until 5pm").
- "confidence": 0.0–1.0.

Return ONLY JSON, no markdown, no prose:
{"scenario_id":"fill-my-night|enrich-my-life|airport-pickup","summary":"...","personalization":"...","confidence":0.0}`

function stripFences(s: string): string {
  const t = s.trim()
  return t.startsWith('```') ? t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim() : t
}

function normalize(raw: unknown): IntentResult | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = String(o.scenario_id ?? '').trim() as IntentScenarioId
  if (!SCENARIO_IDS.includes(id)) return null
  let confidence = Number(o.confidence)
  if (!Number.isFinite(confidence)) confidence = 0.6
  confidence = Math.max(0, Math.min(1, confidence))
  const summary = String(o.summary ?? '').slice(0, 280)
  const personalization = String(o.personalization ?? '').slice(0, 200)
  return { scenario_id: id, summary, personalization, confidence }
}

/**
 * Classify a transcript into a Janus scenario via GMI. Never throws — always
 * resolves to a typed IntentReply. On any failure the caller falls back to the
 * deterministic keyword matcher, so voice routing degrades gracefully.
 */
export async function classifyIntent(body: unknown, cfg: GmiIntentConfig): Promise<IntentReply> {
  const transcript = typeof (body as { transcript?: unknown } | undefined)?.transcript === 'string'
    ? (body as { transcript: string }).transcript.trim().slice(0, MAX_TRANSCRIPT)
    : ''
  if (!transcript) {
    return { ok: false, code: 'bad_request', error: 'Empty transcript.' }
  }
  if (!cfg.apiKey) {
    return { ok: false, code: 'no_key', error: 'GMI is not configured on the server.' }
  }

  const model = cfg.model || DEFAULT_MODEL
  const baseUrl = (cfg.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const timeoutMs = cfg.timeoutMs ?? 18000

  // GMI occasionally returns a transient error on a cold model — one quick retry
  // smooths it out. Terminal codes (parse) are returned immediately.
  let last: IntentReply = { ok: false, code: 'unknown', error: 'No attempt made.' }
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 350 * attempt))
    last = await attemptClassify(transcript, model, baseUrl, cfg.apiKey, timeoutMs)
    if (last.ok || last.code === 'parse') return last
  }
  return last
}

async function attemptClassify(
  transcript: string,
  model: string,
  baseUrl: string,
  apiKey: string,
  timeoutMs: number,
): Promise<IntentReply> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: transcript },
        ],
      }),
      signal: controller.signal,
    })
    if (!resp.ok) {
      console.error(`[gmi] upstream ${resp.status} ${resp.statusText}`)
      return { ok: false, code: 'upstream', error: 'The inference service returned an error.' }
    }
    const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data?.choices?.[0]?.message?.content
    if (!content) return { ok: false, code: 'upstream', error: 'Empty response from the model.' }
    let parsed: unknown
    try {
      parsed = JSON.parse(stripFences(content))
    } catch {
      return { ok: false, code: 'parse', error: 'Model response was not valid JSON.' }
    }
    const intent = normalize(parsed)
    if (!intent) return { ok: false, code: 'parse', error: 'Model response did not match the schema.' }
    return { ok: true, intent, model }
  } catch (err) {
    const aborted = (err as { name?: string } | undefined)?.name === 'AbortError'
    console.error('[gmi] request failed:', aborted ? 'timeout' : err)
    return aborted
      ? { ok: false, code: 'timeout', error: 'The inference service took too long.' }
      : { ok: false, code: 'unknown', error: 'Could not reach the inference service.' }
  } finally {
    clearTimeout(timer)
  }
}
