// Header account control: a "Sign in" link (→ the dedicated /auth.html page) when
// signed out, or an account chip + dropdown (Account settings · Sign out) when signed in.
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthProvider'
import './auth.css'

// Loaded on demand — Account Settings pulls the credential broker UI + viem, which must
// not sit in the critical bundle of either entry. It only renders when a user opens it.
const AccountSettings = lazy(() => import('./AccountSettings').then((m) => ({ default: m.AccountSettings })))

const AUTH_URL = '/auth.html'

export function AccountMenu() {
  const auth = useAuth()
  const [menu, setMenu] = useState(false) // dropdown
  const [settings, setSettings] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menu])

  if (!auth.enabled) return null

  // Signed in → account chip + dropdown
  if (auth.user) {
    const label = auth.user.name || auth.user.email
    const initial = (label || '?').trim().charAt(0).toUpperCase()
    return (
      <div className="acct" ref={wrapRef}>
        <button className="acct-chip" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu}>
          <span className="acct-avatar">{initial}</span>
          <span className="acct-name">{label}</span>
        </button>
        {menu && (
          <div className="acct-menu" role="menu">
            <div className="acct-menu-head">
              <strong>{auth.user.name || 'Signed in'}</strong>
              <span>{auth.user.email}</span>
            </div>
            <button className="acct-menu-item neutral" role="menuitem" onClick={() => { setMenu(false); setSettings(true) }}>
              Account settings
            </button>
            <button className="acct-menu-item" role="menuitem" onClick={async () => { setMenu(false); await auth.signOut() }}>
              Sign out
            </button>
          </div>
        )}
        {settings && (
          <Suspense fallback={null}>
            <AccountSettings onClose={() => setSettings(false)} />
          </Suspense>
        )}
      </div>
    )
  }

  // Signed out → navigate to the dedicated auth page.
  return <a className="acct-signin" href={AUTH_URL}>Sign in</a>
}
