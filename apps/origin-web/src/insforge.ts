// InsForge client — initialized from PUBLIC values only (the anon key is safe to
// ship in the client bundle; the admin API key never leaves the server / CLI).
// Auth is optional: if the env values are absent the client is null and the app
// runs fully anonymously (floor plans stay in localStorage).
import { createClient } from '@insforge/sdk'

const url = (import.meta.env.VITE_INSFORGE_URL as string | undefined)?.trim()
const anonKey = (import.meta.env.VITE_INSFORGE_ANON_KEY as string | undefined)?.trim()

export const AUTH_ENABLED = Boolean(url && anonKey)

// Capture the OAuth callback BEFORE createClient() runs: the SDK's detectAuthCallback()
// strips `insforge_code` from the URL synchronously on init, so a later read would miss
// it. AuthProvider uses this to know it must load the session after a Google round-trip.
export const OAUTH_RETURN =
  typeof window !== 'undefined' && /[?&](insforge_code|code)=/.test(window.location.search)

// `functionsUrl` pins edge-function calls to the project base host
// (`${VITE_INSFORGE_URL}/functions/<slug>`) instead of the SDK's default `…functions.insforge.app`
// subdomain, whose CORS rejects the app origin (verified from prod — it blocked EVERY function).
// With this set, `insforge.functions.invoke(...)` is CORS-correct for all functions and carries
// the SDK's own session bearer automatically.
export const insforge = AUTH_ENABLED
  ? createClient({ baseUrl: url!, anonKey: anonKey!, functionsUrl: `${url!.replace(/\/+$/, '')}/functions` })
  : null

export type InsforgeClient = NonNullable<typeof insforge>
