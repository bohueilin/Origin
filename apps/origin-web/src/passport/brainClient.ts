// Client seam to the Origin brain. Posts a transcript to the server (GMI Cloud,
// key server-side) and maps the result to a scenario. Degrades to the deterministic
// keyword matcher when the server/key is absent, so voice routing always works.

import { SCENARIOS } from './scenarios'
import { IntentParser } from './engine/intentParser'
import type { ScenarioSpec } from './scenarios/types'

export interface BrainRoute {
  scenario: ScenarioSpec
  summary: string
  personalization: string
  source: 'gmi' | 'keyword'
  model?: string
}

interface IntentReply {
  ok?: boolean
  intent?: { scenario_id: string; summary: string; personalization: string; confidence: number }
  model?: string
}

export async function classifyIntent(transcript: string): Promise<BrainRoute | null> {
  const t = transcript.trim()
  if (!t) return null
  try {
    const res = await fetch('/api/passport/intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transcript: t }),
    })
    if (res.ok) {
      const data = (await res.json()) as IntentReply
      if (data.ok && data.intent) {
        const scenario = SCENARIOS.find((s) => s.id === data.intent!.scenario_id)
        if (scenario) {
          return {
            scenario,
            summary: data.intent.summary,
            personalization: data.intent.personalization,
            source: 'gmi',
            model: data.model,
          }
        }
      }
    }
  } catch {
    /* network/server down — fall through to keyword */
  }
  const m = IntentParser.match(t, SCENARIOS)
  return m ? { scenario: m, summary: '', personalization: '', source: 'keyword' } : null
}
