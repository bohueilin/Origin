// IntentParser — turns a raw request into a normalized UserIntent.
//
// Deterministic + scenario-driven (no model spend). The demo runs known scenarios, so the
// parser reads the scenario's declared understanding. Free-text could slot an LLM behind the
// same interface later; here we keyword-match to the closest scenario for robustness.

import type { RiskLevel, UserIntent } from '../types'
import type { ScenarioSpec } from '../scenarios/types'
import type { IdFactory } from './ids'

export const IntentParser = {
  parse(scenario: ScenarioSpec, idf: IdFactory, now: number, risk: RiskLevel): UserIntent {
    return {
      intent_id: idf.next('intent'),
      raw_user_request: scenario.prompt,
      normalized_intent: scenario.normalized_intent,
      user_goal: scenario.user_goal,
      success_criteria: scenario.success_criteria,
      constraints: scenario.constraints,
      time_window: scenario.time_window,
      risk_level: risk,
      created_at: now,
    }
  },

  /** Best-effort match of free text to a scenario id (used by the request box). */
  match(text: string, scenarios: ScenarioSpec[]): ScenarioSpec | null {
    const t = text.toLowerCase()
    const score = (s: ScenarioSpec): number => {
      const hay = `${s.title} ${s.prompt} ${s.normalized_intent}`.toLowerCase()
      // Title words PLUS scenario-discriminating keywords. Each keyword only scores when it appears
      // in BOTH the request and that scenario's haystack — so shared words (e.g. "night") don't
      // misroute "plan a game night, order dinner, invite friends" away from enrich-my-life.
      return s.title
        .toLowerCase()
        .split(/\s+/)
        .concat([
          'airport', 'uber', 'flight', 'ride', 'pickup', 'driver', // airport-pickup
          'hackathon', 'event', 'register', 'build', 'meetup', // fill-my-night
          'fifa', 'game', 'dinner', 'order', 'food', 'doordash', 'discord', 'invite', 'friends', 'sports', 'watch', // enrich-my-night
        ])
        .filter((w) => w.length > 3 && t.includes(w) && hay.includes(w)).length
    }
    let best: ScenarioSpec | null = null
    let bestScore = 0
    for (const s of scenarios) {
      const sc = score(s)
      if (sc > bestScore) {
        bestScore = sc
        best = s
      }
    }
    return bestScore > 0 ? best : null
  },
}
