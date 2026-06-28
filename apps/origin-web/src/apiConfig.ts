// Public, build-time config for reaching backends. ONLY public values live here
// (Vite inlines VITE_* into the client bundle), never secrets. See RUNBOOK.md.
//
// - VITE_BRAIN_URL : origin of the optional FastAPI "brain" (live planning). When
//   unset (the static Cloudflare Pages deploy), the app degrades to the cached
//   floor library under /factoryceo/ — brain calls must never throw.
// - VITE_API_BASE_URL : origin of the Hono server (/api, /v1). Empty = same-origin
//   / Vite dev proxy.

const env = import.meta.env as unknown as Record<string, string | undefined>

const strip = (u: string | undefined): string => (u ?? '').trim().replace(/\/+$/, '')

export const BRAIN_URL = strip(env.VITE_BRAIN_URL)
export const API_BASE = strip(env.VITE_API_BASE_URL)

/** True when a live brain origin is configured. False ⇒ cached-static fallback. */
export const BRAIN_ENABLED: boolean = BRAIN_URL.length > 0

/** Prefix a brain path (e.g. '/plan_from_input_stream') with the brain origin. */
export function brainUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${BRAIN_URL}${p}`
}

/** Prefix an /api or /v1 path with the Hono origin (same-origin when unset). */
export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return API_BASE ? `${API_BASE}${p}` : p
}
