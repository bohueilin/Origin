import { useEffect, useState } from 'react'
import { Cookie } from 'lucide-react'

const STORAGE_KEY = 'lf-consent-analytics'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

// EU/UK/CH cookie-consent banner. Google Analytics ships denied (cookieless) by default in
// those regions via Consent Mode v2 (see public/gtag-init.js); this banner is the opt-in.
// Outside consent regions GA runs normally and this never shows. Append ?consent=force to the
// URL to preview the banner anywhere.
export function ConsentBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let cancelled = false

    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(STORAGE_KEY)
    } catch {
      /* localStorage blocked */
    }
    if (stored === 'granted' || stored === 'denied') return

    if (new URLSearchParams(window.location.search).has('consent')) {
      setShow(true)
      return
    }

    fetch('/api/geo')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.consentRequired) setShow(true)
      })
      .catch(() => {
        /* geo unavailable — stay hidden; GA's region default keeps EU visitors denied anyway */
      })

    return () => {
      cancelled = true
    }
  }, [])

  const decide = (granted: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, granted ? 'granted' : 'denied')
    } catch {
      /* localStorage blocked — choice not persisted, GA stays denied */
    }
    // Re-assert the choice either way: grant on accept, explicitly deny on decline
    // (defense-in-depth if the regional default is ever changed).
    window.gtag?.('consent', 'update', {
      analytics_storage: granted ? 'granted' : 'denied',
    })
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="consent-banner" role="dialog" aria-label="Cookie consent" aria-live="polite">
      <div className="consent-copy">
        <Cookie size={18} aria-hidden="true" />
        <p>
          We use Google Analytics cookies to understand how this demo is used — they load only if
          you accept. The site works either way. See our{' '}
          <a href="/privacy">Privacy &amp; Cookie Policy</a>.
        </p>
      </div>
      <div className="consent-actions">
        <button type="button" className="consent-decline" onClick={() => decide(false)}>
          Decline
        </button>
        <button type="button" className="consent-accept" onClick={() => decide(true)}>
          Accept analytics
        </button>
      </div>
    </div>
  )
}
