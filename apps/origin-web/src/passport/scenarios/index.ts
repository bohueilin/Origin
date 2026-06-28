import type { ScenarioSpec } from './types'
import { fillMyNight } from './fillMyNight'
import { enrichMyLife } from './enrichMyLife'
import { airportPickup } from './airportPickup'
import { promptInjection } from './promptInjection'
import { orderDinner } from './orderDinner'

export const SCENARIOS: ScenarioSpec[] = [fillMyNight, enrichMyLife, airportPickup, promptInjection, orderDinner]

export function getScenario(id: string): ScenarioSpec | undefined {
  return SCENARIOS.find((s) => s.id === id)
}

/** Lightweight cards for additional use cases (4–7) shown on the home screen. */
export interface UseCaseCard {
  id: string
  title: string
  prompt: string
  capabilities: string[]
  safety_angle: string
  status: 'live' | 'card'
  maps_to?: string // an interactive scenario that demonstrates the same control
}

export const SECONDARY_USE_CASES: UseCaseCard[] = [
  {
    id: 'recover-evening',
    title: 'Recover My Evening',
    prompt: 'My meeting ran late. Re-plan my evening without losing the important parts.',
    capabilities: ['calendar.read', 'location.estimate', 'reservation.prepare', 'messages.draft', 'reminders.write.proposed'],
    safety_angle: 'The agent can propose reschedules but cannot cancel, message, or rebook without approval.',
    status: 'card',
    maps_to: 'airport-pickup',
  },
  {
    id: 'hackmate-coord',
    title: 'Trusted Hackmate Coordination',
    prompt: 'Find which of my hackmates are near SF tonight, share the event plan, and coordinate who can bring what.',
    capabilities: ['contacts.read.limited', 'messages.draft', 'calendar.read'],
    safety_angle: 'Contacts are private and read by group only. Messages are drafted, never sent without approval.',
    status: 'live',
    maps_to: 'fill-my-night',
  },
  {
    id: 'credentialed-task',
    title: 'Credentialed Task Without Exposure',
    prompt: 'Use my event account to prepare registration, but do not reveal or store my password.',
    capabilities: ['credential.scoped_request', 'events.registration.prepare'],
    safety_angle: 'The agent never sees the raw secret — Passport brokers a scoped, opaque handle.',
    status: 'live',
    maps_to: 'fill-my-night',
  },
  {
    id: 'revoke-access',
    title: 'Revoke Agent Access',
    prompt: 'Stop this agent from doing anything else after this task.',
    capabilities: ['grant.revoke'],
    safety_angle: 'Revocation is obvious, immediate, and verifiable — every later action fails closed.',
    status: 'live',
    maps_to: 'any',
  },
]
