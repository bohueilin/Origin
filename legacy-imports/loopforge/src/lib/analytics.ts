type GtagFn = (...args: unknown[]) => void

// Fire a GA4 event. No-op until gtag.js has loaded; Google Consent Mode decides whether
// the hit is cookie-backed or a privacy-safe modeled ping, so this is safe to call in any
// consent state. Accessed via globalThis so the helper needs no DOM lib, and wrapped in
// try/catch because telemetry must never break the app.
export function track(name: string, params?: Record<string, unknown>): void {
  try {
    const gtag = (globalThis as typeof globalThis & { gtag?: GtagFn }).gtag
    gtag?.('event', name, params)
  } catch {
    /* swallow — telemetry is best-effort */
  }
}
