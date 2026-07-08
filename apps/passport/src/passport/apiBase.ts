// ----------------------------------------------------------------------------
// Where the Janus client sends its /api calls.
//
// Local dev: VITE_API_BASE is unset, so paths stay RELATIVE ('/api/passport/...') and the
// Vite dev proxy forwards them to the Node server on :8787 — same-origin, no CORS.
//
// Deployed (static Cloudflare Pages) build: VITE_API_BASE is baked in at build time as the
// public origin of the running backend (a cloudflared tunnel), so the same calls become
// absolute and cross the network to the local Node server. Nothing else in the client changes.
//
// The base is normalized (no trailing slash) and only used as a prefix — every caller still
// passes a leading-slash path, so api('/x') is correct whether or not a base is set.
// ----------------------------------------------------------------------------

const RAW = (import.meta.env.VITE_API_BASE ?? '').trim()
const BASE = RAW.replace(/\/+$/, '')

/** Resolve an API path against the configured backend base. `path` must start with '/'. */
export function api(path: string): string {
  return BASE ? BASE + path : path
}

/** True when the client targets a remote backend (a deployed build pointed at a tunnel). */
export const usingRemoteApi = BASE.length > 0
