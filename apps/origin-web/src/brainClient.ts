// Client for the FactoryCEO brain with a static fallback. The deployed Pages site
// has no brain, so every call falls back to the cached library under /factoryceo/.
// Rule: NEVER throw on a missing/unreachable brain — return cached data or null.

import { BRAIN_ENABLED, brainUrl } from './apiConfig'
import type { BrainRun, BrainStreamEvent, FloorCatalog } from './brainTypes'

const STATIC_CATALOG = '/factoryceo/library.json'
const staticFloor = (id: string) => `/factoryceo/library/${id}.json`

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const resp = await fetch(url, init)
    if (!resp.ok) return null
    return (await resp.json()) as T
  } catch {
    return null
  }
}

/** Floor catalog: prefer the live brain when enabled, else the cached static
 *  catalog; on any failure, fall back to static. */
export async function loadFloorCatalog(): Promise<FloorCatalog> {
  if (BRAIN_ENABLED) {
    const live = await getJson<FloorCatalog>(brainUrl('/library'))
    if (live?.floors?.length) return live
  }
  const cached = await getJson<FloorCatalog>(STATIC_CATALOG)
  return cached ?? { floors: [], count: 0, note: 'unavailable' }
}

/** The exact pre-computed run for a floor (cached, offline-safe). */
export async function loadStaticFloor(id: string): Promise<BrainRun | null> {
  return getJson<BrainRun>(staticFloor(id), { cache: 'no-store' })
}

export interface BrainPlanRequest {
  text: string
  files: { kind: string; content: string; name?: string }[]
}

/**
 * Stream a live plan→verify→repair run from the brain (SSE). Calls `onEvent` for
 * each event; returns the final BrainRun, or null if the brain is disabled /
 * unreachable (caller should fall back to a cached floor).
 */
export async function streamPlanFromInput(
  req: BrainPlanRequest,
  onEvent: (e: BrainStreamEvent) => void,
  signal?: AbortSignal,
): Promise<BrainRun | null> {
  if (!BRAIN_ENABLED) return null
  let resp: Response
  try {
    resp = await fetch(brainUrl('/plan_from_input_stream'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    })
  } catch {
    return null
  }
  if (!resp.ok || !resp.body) return null

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let final: BrainRun | null = null

  const handle = (raw: string) => {
    // SSE frames: lines beginning with "data: ", terminated by a blank line.
    const line = raw.split('\n').find((l) => l.startsWith('data:'))
    if (!line) return
    try {
      const evt = JSON.parse(line.slice(line.indexOf(':') + 1).trim()) as BrainStreamEvent
      onEvent(evt)
      if (evt.data) final = evt.data
    } catch {
      /* ignore malformed frame */
    }
  }

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        handle(buf.slice(0, idx))
        buf = buf.slice(idx + 2)
      }
    }
    if (buf.trim()) handle(buf)
  } catch {
    return final
  }
  return final
}
