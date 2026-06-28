// Mock connector layer. Every connector is a ToolAdapter with a required capability and a
// risk level. They are pure + deterministic: they read fixtures and return secret-free
// summaries. None has any real-world egress, so nothing can register, book, order, message,
// or spend. Commit adapters (sideEffecting) return { simulated: true } and only ever run
// behind an approved ApprovalPacket.

import type { ToolAdapter, ToolExecutionContext, ToolResult } from '../types'
import {
  ATTENDED_HISTORY,
  CALENDAR,
  EVENTS,
  FLIGHTS,
  GAMES,
  HACKMATES,
  PICKUP_PERSON,
  PRIOR_DELIVERY,
  RESTAURANTS,
  RIDES,
  STREAMING,
  USER_PREFERENCES,
} from '../fixtures'

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)

// --- read / prepare connectors ----------------------------------------------

const calendarAvailability: ToolAdapter = {
  name: 'calendar.availability',
  requiredCapability: 'calendar.read',
  riskLevel: 'low',
  async execute(input) {
    const day = str(input.day)
    const free = CALENDAR.filter((e) => !e.busy && (!day || e.day === day))
    return {
      summary: `Found ${free.length} free window(s)${day ? ` on ${day}` : ''}.`,
      data: { free_windows: free, scanned: CALENDAR.length },
    }
  },
}

const historyAttended: ToolAdapter = {
  name: 'history.attended',
  requiredCapability: 'events.search',
  riskLevel: 'low',
  async execute() {
    return {
      summary: `Reviewed ${ATTENDED_HISTORY.length} previously attended events to infer preferences.`,
      data: { attended: ATTENDED_HISTORY, loves: USER_PREFERENCES.loves, style: USER_PREFERENCES.event_style },
    }
  },
}

const eventsSearch: ToolAdapter = {
  name: 'events.search',
  requiredCapability: 'events.search',
  riskLevel: 'low',
  async execute(input) {
    const day = str(input.day)
    const found = EVENTS.filter((e) => !day || e.day === day)
    return {
      summary: `Discovered ${found.length} events across Luma / Eventbrite / Meetup.`,
      data: { events: found },
    }
  },
}

const eventsRank: ToolAdapter = {
  name: 'events.rank',
  requiredCapability: 'events.search',
  riskLevel: 'low',
  async execute(input) {
    const day = str(input.day)
    const loves = new Set(USER_PREFERENCES.loves.map((l) => l.toLowerCase()))
    const scored = EVENTS.filter((e) => !day || e.day === day)
      .map((e) => {
        let score = 0
        if (e.familiar_organizer) score += 40
        if (e.buildable) score += 30
        score += e.tags.filter((t) => loves.has(t.toLowerCase())).length * 10
        score -= e.travel_min // closer is better
        return { ...e, score }
      })
      .sort((a, b) => b.score - a.score)
    const top = scored[0]
    return {
      summary: `Ranked ${scored.length} options. Top pick: ${top.title} (${top.organizer}).`,
      data: { ranked: scored, recommended_id: top.id, recommended: top },
    }
  },
}

const locationTravel: ToolAdapter = {
  name: 'location.travel',
  requiredCapability: 'location.estimate',
  riskLevel: 'low',
  async execute(input) {
    const ev = EVENTS.find((e) => e.id === str(input.event_id)) ?? EVENTS[0]
    return {
      summary: `~${ev.travel_min} min (${ev.distance_mi} mi) from your hackathon to ${ev.neighborhood}.`,
      data: { travel_min: ev.travel_min, distance_mi: ev.distance_mi, feasible: ev.travel_min <= 25 },
    }
  },
}

const credentialRequest: ToolAdapter = {
  name: 'credential.request',
  requiredCapability: 'credential.scoped_request',
  riskLevel: 'medium',
  async execute(input, ctx: ToolExecutionContext) {
    const item_ref = str(input.item_ref, 'op://Personal/luma-account')
    const scoped = await ctx.broker.requestScopedSecret({
      item_ref,
      capability: 'credential.scoped_request',
      intent_id: ctx.intent.intent_id,
      grant_id: ctx.grant.grant_id,
      fields: ['username'],
    })
    // Only the opaque handle + redacted metadata cross this boundary — never a value.
    return {
      summary: `Brokered a scoped handle to "${scoped.metadata.title}". The agent never sees the password.`,
      data: {
        handle: scoped.handle,
        title: scoped.metadata.title,
        category: scoped.metadata.category,
        field_labels: scoped.metadata.field_labels,
        broker: ctx.broker.id,
        note: 'Handle is task-scoped and cannot be exchanged for the secret.',
      },
    }
  },
}

const registrationPrepare: ToolAdapter = {
  name: 'registration.prepare',
  requiredCapability: 'events.registration.prepare',
  riskLevel: 'medium',
  async execute(input) {
    const ev = EVENTS.find((e) => e.id === str(input.event_id)) ?? EVENTS[0]
    return {
      summary: `Drafted registration for ${ev.title}. Ready for your approval — not submitted.`,
      data: {
        event: ev.title,
        organizer: ev.organizer,
        ticket: 'Builder (free)',
        fields: { name: USER_PREFERENCES.name, role: 'Builder', team_size: 4 },
        submitted: false,
      },
    }
  },
}

const contactsHackmates: ToolAdapter = {
  name: 'contacts.hackmates',
  requiredCapability: 'contacts.read.limited',
  riskLevel: 'medium',
  async execute() {
    const nearby = HACKMATES.filter((h) => h.in_sf_tomorrow_night)
    return {
      summary: `Read the "hackmates" group only. ${nearby.length} are in SF tomorrow night.`,
      data: { group: 'hackmates', total: HACKMATES.length, nearby: nearby.map((h) => ({ name: h.name, handle: h.handle, skills: h.skills })) },
    }
  },
}

const contactsPerson: ToolAdapter = {
  name: 'contacts.person',
  requiredCapability: 'contacts.read.limited',
  riskLevel: 'medium',
  async execute() {
    return {
      summary: `Read one contact for pickup: ${PICKUP_PERSON.name} (${PICKUP_PERSON.relationship}).`,
      data: { name: PICKUP_PERSON.name, handle: PICKUP_PERSON.handle, relationship: PICKUP_PERSON.relationship },
    }
  },
}

const messagesDraft: ToolAdapter = {
  name: 'messages.draft',
  requiredCapability: 'messages.draft',
  riskLevel: 'low',
  async execute(input) {
    const to = str(input.to, 'your hackmates')
    const body = str(input.body, 'Draft message')
    return {
      summary: `Drafted a message to ${to}. Not sent.`,
      data: { to, body, sent: false },
    }
  },
}

const calendarPropose: ToolAdapter = {
  name: 'calendar.propose',
  requiredCapability: 'calendar.write.proposed',
  riskLevel: 'low',
  async execute(input) {
    return {
      summary: `Proposed a calendar event "${str(input.title, 'Event')}". Awaiting approval — not written.`,
      data: { title: str(input.title, 'Event'), day: str(input.day), start: str(input.start), end: str(input.end), written: false },
    }
  },
}

const sportsFind: ToolAdapter = {
  name: 'sports.find',
  requiredCapability: 'sports.search.spoiler_safe',
  riskLevel: 'low',
  async execute() {
    const g = GAMES[0]
    // Spoiler-safe: surface metadata, NEVER the result.
    return {
      summary: `Found ${g.competition}: ${g.home} vs ${g.away}. Spoiler-safe mode — result hidden.`,
      data: { competition: g.competition, home: g.home, away: g.away, status: g.status, spoiler_safe: true, result: 'hidden' },
    }
  },
}

const streamingFind: ToolAdapter = {
  name: 'streaming.find',
  requiredCapability: 'streaming.search',
  riskLevel: 'low',
  async execute() {
    const safe = STREAMING.filter((s) => s.spoiler_safe_path)
    return {
      summary: `Found ${safe.length} spoiler-safe replay options (no live score shown).`,
      data: { options: safe },
    }
  },
}

const devicePrepare: ToolAdapter = {
  name: 'device.prepare',
  requiredCapability: 'device.prepare.proposed',
  riskLevel: 'low',
  async execute() {
    return {
      summary: 'Drafted a TV hand-off plan (living-room Apple TV → Peacock replay). No device touched.',
      data: { target: 'Living Room Apple TV', app: 'Peacock', action: 'open replay (proposed)', controlled: false },
    }
  },
}

const foodRecommend: ToolAdapter = {
  name: 'food.recommend',
  requiredCapability: 'food.recommend',
  riskLevel: 'low',
  async execute() {
    const prior = PRIOR_DELIVERY[0]
    return {
      summary: `Recommended a reorder from ${prior.vendor} based on your history.`,
      data: { vendor: prior.vendor, items: prior.items, est_total: prior.last_total },
    }
  },
}

const deliveryPrepare: ToolAdapter = {
  name: 'delivery.prepare',
  requiredCapability: 'delivery.order.prepare',
  riskLevel: 'medium',
  async execute() {
    const prior = PRIOR_DELIVERY[0]
    return {
      summary: `Built a DoorDash cart (${prior.items.length} items, ${money(prior.last_total)}). Not ordered.`,
      data: { vendor: prior.vendor, items: prior.items, total: prior.last_total, ordered: false },
    }
  },
}

const remindersPropose: ToolAdapter = {
  name: 'reminders.propose',
  requiredCapability: 'reminders.write.proposed',
  riskLevel: 'low',
  async execute(input) {
    const items = Array.isArray(input.items) ? (input.items as string[]) : ['Start the match replay', 'Avoid sports apps until then']
    return { summary: `Proposed ${items.length} reminders. Not set.`, data: { items, set: false } }
  },
}

const locationCurrentEvent: ToolAdapter = {
  name: 'location.current_event',
  requiredCapability: 'location.read.current_event',
  riskLevel: 'low',
  async execute() {
    const cur = CALENDAR.find((e) => e.day === 'Today' && e.busy) ?? CALENDAR[0]
    return {
      summary: `You're at "${cur.title}" (${cur.location ?? 'unknown'}) until ${cur.end}.`,
      data: { title: cur.title, location: cur.location, until: cur.end },
    }
  },
}

const flightStatus: ToolAdapter = {
  name: 'flight.status',
  requiredCapability: 'flight.search',
  riskLevel: 'low',
  async execute(input) {
    const fl = FLIGHTS.find((f) => f.flight === str(input.flight)) ?? FLIGHTS[0]
    return {
      summary: `${fl.flight} (${fl.origin}→${fl.destination}) ${fl.status}, arriving ${fl.estimated_arrival}, ${fl.terminal} ${fl.gate}.`,
      data: { ...fl },
    }
  },
}

const rideEstimate: ToolAdapter = {
  name: 'ride.estimate',
  requiredCapability: 'ride.estimate',
  riskLevel: 'low',
  async execute() {
    return {
      summary: `Ride estimates ready: ${RIDES.map((r) => `${r.product} ${money(r.est_cost)}`).join(', ')}.`,
      data: { options: RIDES },
    }
  },
}

const ridePrepare: ToolAdapter = {
  name: 'ride.prepare',
  requiredCapability: 'ride.booking.prepare',
  riskLevel: 'high',
  async execute(input) {
    const r = RIDES.find((x) => x.id === str(input.ride_id)) ?? RIDES[0]
    return {
      summary: `Prepared ${r.product}: ${r.from} → ${r.to}, ~${money(r.est_cost)}, ETA ${r.eta_min} min. Not booked.`,
      data: { ...r, booked: false },
    }
  },
}

const safetyPrepare: ToolAdapter = {
  name: 'safety.prepare',
  requiredCapability: 'safety_share.prepare',
  riskLevel: 'medium',
  async execute() {
    return {
      summary: 'Drafted trip + driver details to share with both parties on pickup. Not shared live.',
      data: { shares: ['driver name & plate (on booking)', 'live ETA link (one trip only)', 'destination'], live_share: false },
    }
  },
}

const restaurantSearch: ToolAdapter = {
  name: 'restaurant.search',
  requiredCapability: 'restaurant.search',
  riskLevel: 'low',
  async execute() {
    return { summary: `Found ${RESTAURANTS.length} dinner options near downtown.`, data: { options: RESTAURANTS } }
  },
}

const reservationPrepare: ToolAdapter = {
  name: 'reservation.prepare',
  requiredCapability: 'reservation.prepare',
  riskLevel: 'medium',
  async execute(input) {
    const rest = RESTAURANTS.find((r) => r.id === str(input.restaurant_id)) ?? RESTAURANTS[2]
    return {
      summary: `Drafted a reservation at ${rest.name} for 2 at 7:30 PM. Not confirmed.`,
      data: { restaurant: rest.name, party: 2, time: '7:30 PM', confirmed: false },
    }
  },
}

// --- commit connectors (simulated; approval-gated) --------------------------

function simulated(action: string, detail: Record<string, unknown>): ToolResult {
  return { summary: `Simulated ${action} — no real-world action was taken.`, data: { ...detail, simulated: true }, simulated: true }
}

const registrationSubmit: ToolAdapter = {
  name: 'registration.submit',
  requiredCapability: 'events.registration.submit',
  riskLevel: 'high',
  sideEffecting: true,
  async execute(input) {
    return simulated('event registration', { event: str(input.event, 'event'), confirmation: 'SIM-REG-0001' })
  },
}

const calendarCommit: ToolAdapter = {
  name: 'calendar.commit',
  requiredCapability: 'calendar.write.commit',
  riskLevel: 'medium',
  sideEffecting: true,
  async execute(input) {
    return simulated('calendar write', { title: str(input.title, 'Event'), calendar: 'Personal' })
  },
}

const messagesSend: ToolAdapter = {
  name: 'messages.send',
  requiredCapability: 'messages.send',
  riskLevel: 'high',
  sideEffecting: true,
  async execute(input) {
    return simulated('message send', { to: str(input.to, 'recipient') })
  },
}

const deliverySubmit: ToolAdapter = {
  name: 'delivery.submit',
  requiredCapability: 'delivery.order.submit',
  riskLevel: 'high',
  sideEffecting: true,
  async execute(input) {
    return simulated('delivery order', { vendor: str(input.vendor, 'vendor'), confirmation: 'SIM-DO-0001' })
  },
}

const remindersCommit: ToolAdapter = {
  name: 'reminders.commit',
  requiredCapability: 'reminders.write.commit',
  riskLevel: 'low',
  sideEffecting: true,
  async execute() {
    return simulated('reminders set', { count: 2 })
  },
}

// The engine's commit is simulated + deterministic; the REAL Discord post is fired
// client-side (DiscordShare → /api/passport/discord/send) only after this approval.
const discordPost: ToolAdapter = {
  name: 'discord.post',
  requiredCapability: 'social.post.commit',
  riskLevel: 'medium',
  sideEffecting: true,
  async execute(input) {
    return simulated('Discord message', { channel: str(input.channel, 'Game Night') })
  },
}

const rideSubmit: ToolAdapter = {
  name: 'ride.submit',
  requiredCapability: 'ride.booking.submit',
  riskLevel: 'critical',
  sideEffecting: true,
  async execute(input) {
    return simulated('ride booking', { product: str(input.product, 'UberX'), confirmation: 'SIM-RIDE-0001' })
  },
}

const reservationSubmit: ToolAdapter = {
  name: 'reservation.submit',
  requiredCapability: 'reservation.submit',
  riskLevel: 'medium',
  sideEffecting: true,
  async execute(input) {
    return simulated('reservation', { restaurant: str(input.restaurant, 'restaurant'), confirmation: 'SIM-RES-0001' })
  },
}

function money(c: { amount: number; currency: string }): string {
  return c.currency === 'USD' ? `$${c.amount.toFixed(2)}` : `${c.amount.toFixed(2)} ${c.currency}`
}

export const CONNECTORS: Record<string, ToolAdapter> = Object.fromEntries(
  [
    calendarAvailability,
    historyAttended,
    eventsSearch,
    eventsRank,
    locationTravel,
    credentialRequest,
    registrationPrepare,
    contactsHackmates,
    contactsPerson,
    messagesDraft,
    calendarPropose,
    sportsFind,
    streamingFind,
    devicePrepare,
    foodRecommend,
    deliveryPrepare,
    remindersPropose,
    locationCurrentEvent,
    flightStatus,
    rideEstimate,
    ridePrepare,
    safetyPrepare,
    restaurantSearch,
    reservationPrepare,
    // commits:
    registrationSubmit,
    calendarCommit,
    messagesSend,
    deliverySubmit,
    remindersCommit,
    discordPost,
    rideSubmit,
    reservationSubmit,
  ].map((a) => [a.name, a]),
)

export function getConnector(name: string): ToolAdapter | undefined {
  return CONNECTORS[name]
}
