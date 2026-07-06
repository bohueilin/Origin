// Cloudflare Turnstile — invisible, execute-on-demand bot check for the live endpoint.
// This is the PRODUCTION site key (public by design). The matching TURNSTILE_SECRET_KEY
// must be set as a Cloudflare Pages secret for the server-side check to actually enforce.
// See docs/SECURITY.md / docs/OPERATIONS.md.

const TURNSTILE_SITE_KEY = '0x4AAAAAADtg5Ixb2AHzBWgy'

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  execute: (id: string, opts?: Record<string, unknown>) => void
  reset: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | null = null
let widgetId: string | null = null
let pending: ((token: string) => void) | null = null

function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('turnstile failed to load'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

function settle(token: string) {
  const resolver = pending
  pending = null
  resolver?.(token)
}

// Returns a fresh single-use token, or '' if Turnstile is unavailable (the server's
// header/origin gates still apply, so '' just means "no bot-check token this run").
export async function getTurnstileToken(): Promise<string> {
  try {
    await loadScript()
    const ts = window.turnstile
    if (!ts) return ''

    if (widgetId === null) {
      // Visible corner anchor so that, with real keys, an interactive challenge can
      // render if needed. With test/managed keys it stays invisible (interaction-only).
      const host = document.createElement('div')
      host.style.position = 'fixed'
      host.style.bottom = '16px'
      host.style.right = '16px'
      host.style.zIndex = '70'
      document.body.appendChild(host)
      widgetId = ts.render(host, {
        sitekey: TURNSTILE_SITE_KEY,
        appearance: 'interaction-only',
        execution: 'execute',
        callback: (token: string) => settle(token),
        'error-callback': () => settle(''),
        'timeout-callback': () => settle(''),
      })
    } else {
      ts.reset(widgetId)
    }

    return await new Promise<string>((resolve) => {
      pending = resolve
      ts.execute(widgetId as string)
      window.setTimeout(() => {
        if (pending) settle('')
      }, 8000)
    })
  } catch {
    return ''
  }
}
