// The capability catalog — the vocabulary of what an agent may be authorized to do.
//
// Two classes:
//  - read / prepare  → granted to the agent (gated by the CapabilityGrant).
//  - commit (sideEffecting) → NEVER granted; the agent cannot invoke these on its own.
//    They are unlocked only by an explicit, one-shot, approved ApprovalPacket — and even
//    then run in simulation, performing no real-world action. This is how Passport makes
//    "capability is not permission" concrete.

import type { Capability, RiskLevel } from './types'

export interface CapabilitySpec {
  id: Capability
  label: string
  description: string
  risk: RiskLevel
  /** commit / side-effecting: gated by approval, never by the grant. */
  sideEffecting: boolean
}

const SPECS: CapabilitySpec[] = [
  // ---- read / prepare (granted) ----
  { id: 'calendar.read', label: 'Read calendar', description: 'See free/busy and event titles to find availability.', risk: 'low', sideEffecting: false },
  { id: 'events.search', label: 'Search events', description: 'Discover events on Luma / Eventbrite / Meetup (read-only).', risk: 'low', sideEffecting: false },
  { id: 'events.registration.prepare', label: 'Prepare registration', description: 'Draft an event registration for review. Does not submit.', risk: 'medium', sideEffecting: false },
  { id: 'contacts.read.limited', label: 'Read contacts (limited)', description: 'Read a named group only — never the full address book.', risk: 'medium', sideEffecting: false },
  { id: 'messages.draft', label: 'Draft message', description: 'Compose a message for review. Does not send.', risk: 'low', sideEffecting: false },
  { id: 'calendar.write.proposed', label: 'Propose calendar event', description: 'Draft a calendar event for approval. Does not write.', risk: 'low', sideEffecting: false },
  { id: 'location.estimate', label: 'Estimate travel', description: 'Estimate travel time / feasibility between places.', risk: 'low', sideEffecting: false },
  { id: 'location.read.current_event', label: 'Read current location', description: "Read the location of the user's current calendar event.", risk: 'low', sideEffecting: false },
  { id: 'sports.search.spoiler_safe', label: 'Find game (spoiler-safe)', description: 'Look up game metadata without revealing the result.', risk: 'low', sideEffecting: false },
  { id: 'streaming.search', label: 'Search streaming', description: 'Find where a game / title is available to watch.', risk: 'low', sideEffecting: false },
  { id: 'device.prepare.proposed', label: 'Prepare device', description: 'Draft a TV / device hand-off plan. Does not control devices.', risk: 'low', sideEffecting: false },
  { id: 'food.recommend', label: 'Recommend food', description: 'Suggest food / delivery options based on history.', risk: 'low', sideEffecting: false },
  { id: 'delivery.order.prepare', label: 'Prepare delivery order', description: 'Build a delivery cart for review. Does not order.', risk: 'medium', sideEffecting: false },
  { id: 'reminders.write.proposed', label: 'Propose reminders', description: 'Draft reminders for approval. Does not set them.', risk: 'low', sideEffecting: false },
  { id: 'flight.search', label: 'Check flight status', description: 'Read flight status / arrival terminal (read-only).', risk: 'low', sideEffecting: false },
  { id: 'ride.estimate', label: 'Estimate ride', description: 'Estimate ride cost / ETA. Does not book.', risk: 'low', sideEffecting: false },
  { id: 'ride.booking.prepare', label: 'Prepare ride booking', description: 'Build a ride request for review. Does not book.', risk: 'high', sideEffecting: false },
  { id: 'safety_share.prepare', label: 'Prepare safety share', description: 'Draft trip / safety details to share. Does not share live.', risk: 'medium', sideEffecting: false },
  { id: 'restaurant.search', label: 'Search restaurants', description: 'Find restaurants (read-only).', risk: 'low', sideEffecting: false },
  { id: 'reservation.prepare', label: 'Prepare reservation', description: 'Draft a reservation for review. Does not book.', risk: 'medium', sideEffecting: false },
  { id: 'credential.scoped_request', label: 'Request scoped credential', description: 'Ask Passport to broker a scoped, opaque handle to a saved login. Never sees the secret.', risk: 'medium', sideEffecting: false },

  // ---- commit / side-effecting (denied to the agent; approval-only; simulated) ----
  { id: 'messages.send', label: 'Send message', description: 'Actually send a message to a real contact.', risk: 'high', sideEffecting: true },
  { id: 'calendar.write.commit', label: 'Write calendar event', description: 'Actually add the event to the calendar.', risk: 'medium', sideEffecting: true },
  { id: 'events.registration.submit', label: 'Submit registration', description: 'Actually register for the event externally.', risk: 'high', sideEffecting: true },
  { id: 'delivery.order.submit', label: 'Place delivery order', description: 'Actually place the order and charge a card.', risk: 'high', sideEffecting: true },
  { id: 'ride.booking.submit', label: 'Book ride', description: 'Actually book a ride and authorize payment.', risk: 'critical', sideEffecting: true },
  { id: 'reservation.submit', label: 'Confirm reservation', description: 'Actually confirm the restaurant reservation.', risk: 'medium', sideEffecting: true },
  { id: 'snaplii.purchase', label: 'Buy via Snaplii (brokered, capped)', description: 'Make ONE specific, capped, human-approved purchase through the Snaplii broker. Scoped + one-shot — never free spend.', risk: 'high', sideEffecting: true },
  { id: 'reminders.write.commit', label: 'Set reminders', description: 'Actually create the reminders.', risk: 'low', sideEffecting: true },
  { id: 'social.post.commit', label: 'Post to Discord', description: 'Actually post a message to a real Discord group.', risk: 'high', sideEffecting: true },
  { id: 'device.control.live', label: 'Control device (live)', description: 'Take live control of a TV / device.', risk: 'high', sideEffecting: true },
  { id: 'streaming.purchase', label: 'Purchase streaming', description: 'Buy / rent streaming content.', risk: 'high', sideEffecting: true },
  { id: 'location.share.live', label: 'Share live location', description: 'Share the user’s live location continuously.', risk: 'high', sideEffecting: true },
  { id: 'contacts.export.all', label: 'Exfiltrate all contacts', description: 'Export the entire address book to an external party. Never justified by a triage intent.', risk: 'high', sideEffecting: true },
  { id: 'payment.spend', label: 'Spend money', description: 'Move money / authorize a charge.', risk: 'critical', sideEffecting: true },

  // ---- always forbidden, never requested ----
  { id: 'credential.unrestricted', label: 'Unrestricted credentials', description: 'Hand the agent a raw, unscoped secret. Never permitted.', risk: 'critical', sideEffecting: true },
]

const BY_ID = new Map<Capability, CapabilitySpec>(SPECS.map((s) => [s.id, s]))

/** Capabilities that are categorically forbidden — Passport never grants these. */
export const GLOBAL_FORBIDDEN: Capability[] = ['credential.unrestricted', 'payment.spend']

export function getCapability(id: Capability): CapabilitySpec {
  const spec = BY_ID.get(id)
  if (spec) return spec
  // Unknown capability → treat as high-risk + side-effecting (fail safe).
  return { id, label: id, description: 'Unknown capability.', risk: 'high', sideEffecting: true }
}

export function isSideEffecting(id: Capability): boolean {
  return getCapability(id).sideEffecting
}

export function capabilityRisk(id: Capability): RiskLevel {
  return getCapability(id).risk
}

export function capabilityLabel(id: Capability): string {
  return getCapability(id).label
}

export const RISK_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 }

export function maxRisk(levels: RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>((acc, l) => (RISK_ORDER[l] > RISK_ORDER[acc] ? l : acc), 'low')
}

export const ALL_CAPABILITY_SPECS = SPECS
