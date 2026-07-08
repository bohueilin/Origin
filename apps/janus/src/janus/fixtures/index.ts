// Local demo fixtures — fictional but believable. No real PII, no real endpoints.
// All values are static so every run is deterministic and reproducible.

export interface CalendarEvent {
  id: string
  day: string
  start: string
  end: string
  title: string
  location?: string
  busy: boolean
}

export const CALENDAR: CalendarEvent[] = [
  { id: 'cal_1', day: 'Today', start: '09:00', end: '17:00', title: 'AGI House Agent Identity Build Day', location: 'AGI House, SF', busy: true },
  { id: 'cal_2', day: 'Tomorrow', start: '10:00', end: '16:30', title: 'Hackathon — build block', location: 'Downtown SF', busy: true },
  { id: 'cal_3', day: 'Tomorrow', start: '17:00', end: '21:00', title: '(free)', busy: false },
  { id: 'cal_4', day: 'Wed', start: '19:00', end: '20:00', title: 'Gym', busy: true },
  { id: 'cal_5', day: 'Thu', start: '18:30', end: '22:00', title: '(free)', busy: false },
  { id: 'cal_6', day: 'Fri', start: '20:00', end: '23:00', title: '(free)', busy: false },
]

export interface DiscoverableEvent {
  id: string
  source: 'Luma' | 'Eventbrite' | 'Meetup'
  title: string
  organizer: string
  day: string
  start: string
  end: string
  neighborhood: string
  distance_mi: number
  travel_min: number
  tags: string[]
  buildable: boolean
  familiar_organizer: boolean
  blurb: string
}

export const EVENTS: DiscoverableEvent[] = [
  {
    id: 'ev_1', source: 'Luma', title: 'AGI House — Agent Security & Identity Build Night',
    organizer: 'AGI House', day: 'Tomorrow', start: '17:30', end: '21:00',
    neighborhood: 'SoMa, SF', distance_mi: 0.8, travel_min: 9,
    tags: ['AI agents', 'security', 'identity', 'build'], buildable: true, familiar_organizer: true,
    blurb: 'Hands-on build night on agent identity, scoped authorization, and safe delegation.',
  },
  {
    id: 'ev_2', source: 'Luma', title: 'RL Environments & RSI — HUD × YC Builder Social',
    organizer: 'HUD', day: 'Tomorrow', start: '18:00', end: '21:30',
    neighborhood: 'Mission, SF', distance_mi: 1.9, travel_min: 16,
    tags: ['RL environments', 'AI agents', 'build'], buildable: true, familiar_organizer: true,
    blurb: 'Build + demo RL environments with the HUD SDK. Bring a laptop.',
  },
  {
    id: 'ev_3', source: 'Meetup', title: 'SF Smart Wearables Tinker Meetup',
    organizer: 'Wearables SF', day: 'Tomorrow', start: '19:00', end: '21:00',
    neighborhood: 'SoMa, SF', distance_mi: 1.1, travel_min: 11,
    tags: ['robotics', 'wearables', 'hardware'], buildable: true, familiar_organizer: false,
    blurb: 'Casual hardware tinkering — wearables and edge devices.',
  },
  {
    id: 'ev_4', source: 'Eventbrite', title: 'Founders & Funders Downtown Mixer',
    organizer: 'SV Founders', day: 'Tomorrow', start: '18:30', end: '20:30',
    neighborhood: 'FiDi, SF', distance_mi: 1.4, travel_min: 13,
    tags: ['startup', 'networking'], buildable: false, familiar_organizer: false,
    blurb: 'Networking mixer for founders and investors. No building.',
  },
]

export interface AttendedEvent {
  id: string
  title: string
  organizer: string
  when: string
  tags: string[]
}

export const ATTENDED_HISTORY: AttendedEvent[] = [
  { id: 'past_1', title: 'AGI House Agent Identity Build Day', organizer: 'AGI House', when: '2 weeks ago', tags: ['AI agents', 'identity', 'build'] },
  { id: 'past_2', title: 'Nebius / Vapi / InsForge Build Day', organizer: 'AGI House', when: '5 weeks ago', tags: ['AI agents', 'infra', 'build'] },
  { id: 'past_3', title: 'HUD × YC RL Environments Hackathon', organizer: 'HUD', when: '3 weeks ago', tags: ['RL environments', 'safeguards', 'build'] },
]

export interface Hackmate {
  id: string
  name: string
  handle: string
  in_sf_tomorrow_night: boolean
  skills: string[]
  group: 'hackmates'
}

export const HACKMATES: Hackmate[] = [
  { id: 'hm_1', name: 'Ari', handle: '@ari', in_sf_tomorrow_night: true, skills: ['backend', 'RL'], group: 'hackmates' },
  { id: 'hm_2', name: 'Jules', handle: '@jules', in_sf_tomorrow_night: true, skills: ['frontend', 'design'], group: 'hackmates' },
  { id: 'hm_3', name: 'Sam', handle: '@sam', in_sf_tomorrow_night: false, skills: ['infra'], group: 'hackmates' },
  { id: 'hm_4', name: 'Devi', handle: '@devi', in_sf_tomorrow_night: true, skills: ['ML', 'evals'], group: 'hackmates' },
]

export interface Game {
  id: string
  competition: string
  home: string
  away: string
  kickoff_local: string
  status: 'upcoming' | 'in_progress' | 'finished'
  // result is intentionally withheld from spoiler-safe surfaces.
  result_hidden: true
}

export const GAMES: Game[] = [
  {
    id: 'game_1', competition: 'FIFA World Cup — Round of 16',
    home: 'Argentina', away: 'Netherlands', kickoff_local: 'Yesterday 11:00',
    status: 'finished', result_hidden: true,
  },
]

export interface StreamingOption {
  id: string
  provider: string
  type: 'replay' | 'live'
  spoiler_safe_path: boolean
  cost: { amount: number; currency: string } | null
}

export const STREAMING: StreamingOption[] = [
  { id: 'str_1', provider: 'FuboTV (replay)', type: 'replay', spoiler_safe_path: true, cost: null },
  { id: 'str_2', provider: 'Peacock (full match replay)', type: 'replay', spoiler_safe_path: true, cost: { amount: 0, currency: 'USD' } },
]

export interface Restaurant {
  id: string
  name: string
  cuisine: string
  distance_mi: number
  good_for: string[]
}

export const RESTAURANTS: Restaurant[] = [
  { id: 'rest_1', name: 'La Taqueria', cuisine: 'Mexican', distance_mi: 0.6, good_for: ['game night', 'casual'] },
  { id: 'rest_2', name: 'Pizzeria Delfina', cuisine: 'Pizza', distance_mi: 0.9, good_for: ['game night', 'group'] },
  { id: 'rest_3', name: 'Marufuku Ramen', cuisine: 'Ramen', distance_mi: 1.3, good_for: ['dinner', 'date'] },
]

export interface PriorDeliveryOrder {
  id: string
  vendor: string
  items: string[]
  last_total: { amount: number; currency: string }
}

export const PRIOR_DELIVERY: PriorDeliveryOrder[] = [
  { id: 'do_1', vendor: 'La Taqueria (DoorDash)', items: ['2x Carne asada burrito', 'Chips & guac', 'Jarritos x2'], last_total: { amount: 38.5, currency: 'USD' } },
]

export interface FlightStatus {
  id: string
  flight: string
  airline: string
  origin: string
  destination: string
  status: 'on_time' | 'delayed' | 'landed'
  scheduled_arrival: string
  estimated_arrival: string
  terminal: string
  gate: string
}

export const FLIGHTS: FlightStatus[] = [
  {
    id: 'fl_1', flight: 'UA 1882', airline: 'United', origin: 'JFK', destination: 'SFO',
    status: 'on_time', scheduled_arrival: '14:55', estimated_arrival: '14:48',
    terminal: 'Terminal 3', gate: 'F12',
  },
]

export interface RideEstimate {
  id: string
  product: string
  from: string
  to: string
  est_cost: { amount: number; currency: string }
  eta_min: number
  duration_min: number
}

export const RIDES: RideEstimate[] = [
  { id: 'ride_1', product: 'UberX', from: 'SFO Terminal 3', to: 'Hackathon — Downtown SF', est_cost: { amount: 47, currency: 'USD' }, eta_min: 6, duration_min: 28 },
  { id: 'ride_2', product: 'Uber Comfort', from: 'SFO Terminal 3', to: 'Hackathon — Downtown SF', est_cost: { amount: 58, currency: 'USD' }, eta_min: 5, duration_min: 27 },
]

export interface PickupPerson {
  id: string
  name: string
  handle: string
  relationship: string
}

export const PICKUP_PERSON: PickupPerson = {
  id: 'person_1', name: 'Priya', handle: '@priya', relationship: 'co-founder',
}

export const USER_PREFERENCES = {
  name: 'You',
  home_base: 'Downtown SF / SoMa',
  loves: ['hackathons', 'AI agents', 'RL environments', 'safeguards', 'security', 'identity', 'robotics', 'smart wearables', 'startup founder events'],
  event_style: 'practical builder events where I can build and demo',
  food: ['Mexican', 'pizza', 'ramen'],
  avoid: ['pure networking with no building'],
}
