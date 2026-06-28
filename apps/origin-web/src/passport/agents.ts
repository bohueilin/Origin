// The agent roster. Passport orchestrates a small team of specialist agents that collaborate
// to fulfil one intent: a Planner decomposes it, an Orchestrator routes each step to the right
// worker, every worker must request its capability from Passport (the policy broker) before it
// can act, and sensitive acts are escalated to You. This file is the single source of truth for
// who the agents are and which one owns a given tool — the UI renders them and the session
// choreographs their hand-offs.

export interface Agent {
  id: string
  name: string
  role: string
  /** 2–3 char monogram for the avatar. */
  mono: string
  /** HSL hue for the avatar tint. */
  hue: number
}

export const ORCHESTRATOR: Agent = { id: 'orchestrator', name: 'Orchestrator', role: 'Routes each step', mono: 'OR', hue: 38 }
export const PLANNER: Agent = { id: 'planner', name: 'Planner', role: 'Decomposes the intent', mono: 'PL', hue: 268 }
export const PASSPORT: Agent = { id: 'passport', name: 'Passport', role: 'Authorizes · gates · audits', mono: 'PP', hue: 150 }
export const USER: Agent = { id: 'user', name: 'You', role: 'Approves sensitive acts', mono: 'YOU', hue: 8 }

// Domain workers, keyed by the tool namespace (the part before the first dot).
const WORKERS: Record<string, Agent> = {
  calendar: { id: 'calendar', name: 'Calendar Agent', role: 'Reads availability', mono: 'CA', hue: 202 },
  events: { id: 'discovery', name: 'Discovery Agent', role: 'Finds & ranks events', mono: 'DI', hue: 284 },
  history: { id: 'memory', name: 'Memory Agent', role: 'Recalls what you liked', mono: 'ME', hue: 322 },
  maps: { id: 'travel', name: 'Travel Agent', role: 'Estimates door-to-door', mono: 'TR', hue: 188 },
  location: { id: 'travel', name: 'Travel Agent', role: 'Estimates door-to-door', mono: 'TR', hue: 188 },
  contacts: { id: 'contacts', name: 'Contacts Agent', role: 'Reads people (scoped)', mono: 'CO', hue: 24 },
  messages: { id: 'comms', name: 'Comms Agent', role: 'Drafts messages', mono: 'CM', hue: 212 },
  inbox: { id: 'comms', name: 'Comms Agent', role: 'Triages the inbox', mono: 'CM', hue: 212 },
  payment: { id: 'comms', name: 'Comms Agent', role: 'Triages the inbox', mono: 'CM', hue: 212 },
  safety: { id: 'comms', name: 'Comms Agent', role: 'Drafts safety notes', mono: 'CM', hue: 212 },
  registration: { id: 'identity', name: 'Identity Agent', role: 'Prepares registration', mono: 'ID', hue: 158 },
  credential: { id: 'identity', name: 'Identity Agent', role: 'Brokers scoped login', mono: 'ID', hue: 158 },
  flight: { id: 'flight', name: 'Flight Agent', role: 'Tracks the flight', mono: 'FL', hue: 205 },
  ride: { id: 'ride', name: 'Ride Agent', role: 'Plans the ride', mono: 'RI', hue: 44 },
  restaurant: { id: 'reserve', name: 'Reservations Agent', role: 'Finds & books tables', mono: 'RV', hue: 16 },
  reservation: { id: 'reserve', name: 'Reservations Agent', role: 'Finds & books tables', mono: 'RV', hue: 16 },
  sports: { id: 'sports', name: 'Sports Agent', role: 'Game intel (spoiler-safe)', mono: 'SP', hue: 134 },
  streaming: { id: 'media', name: 'Media Agent', role: 'Sets up the viewing', mono: 'MD', hue: 296 },
  device: { id: 'media', name: 'Media Agent', role: 'Hands off to your screen', mono: 'MD', hue: 296 },
  food: { id: 'concierge', name: 'Concierge Agent', role: 'Plans the food', mono: 'CN', hue: 30 },
  delivery: { id: 'concierge', name: 'Concierge Agent', role: 'Preps the order', mono: 'CN', hue: 30 },
  snaplii: { id: 'concierge', name: 'Concierge Agent', role: 'Preps the brokered buy', mono: 'CN', hue: 30 },
  reminders: { id: 'scheduler', name: 'Scheduler Agent', role: 'Sets reminders', mono: 'SC', hue: 254 },
  social: { id: 'squad', name: 'Squad Agent', role: 'Rallies your friends', mono: 'SQ', hue: 268 },
  discord: { id: 'squad', name: 'Squad Agent', role: 'Rallies your friends', mono: 'SQ', hue: 268 },
}

const FALLBACK: Agent = { id: 'worker', name: 'Task Agent', role: 'Executes a step', mono: 'TA', hue: 220 }

/** The worker agent that owns a given tool (e.g. 'calendar.read' → Calendar Agent). */
export function workerForTool(tool: string): Agent {
  return WORKERS[tool.split('.')[0]] ?? FALLBACK
}

/** Look up any agent (core or worker) by id. */
export function agentById(id: string): Agent {
  for (const a of [ORCHESTRATOR, PLANNER, PASSPORT, USER]) if (a.id === id) return a
  for (const w of Object.values(WORKERS)) if (w.id === id) return w
  return FALLBACK
}
