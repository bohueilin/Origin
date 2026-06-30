// Auth context for Origin accounts (InsForge). Provides the current user + the
// sign-up / verify / sign-in / Google-OAuth / sign-out actions. When auth is not
// configured (no env), `enabled` is false and the app runs anonymously.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { insforge, AUTH_ENABLED, OAUTH_RETURN } from '../insforge'

// Access is restricted to the Origin owner while features are still being built. Any other
// account that authenticates (Google or email/password) is immediately signed back out in
// refresh(), so ONLY this address ever holds a live session.
export const OWNER_EMAIL = 'bohueilin@gmail.com'
const isOwnerEmail = (e?: string | null): boolean => (e ?? '').trim().toLowerCase() === OWNER_EMAIL

export interface AuthUser {
  id: string
  email: string
  name?: string
}

interface AuthState {
  enabled: boolean
  ready: boolean
  user: AuthUser | null
  /** Set when a non-owner account authenticated and was rejected — the email they used. */
  deniedEmail: string | null
  signUp: (email: string, password: string, name: string) => Promise<{ needsVerify: boolean; error?: string }>
  verifyEmail: (email: string, otp: string) => Promise<{ error?: string }>
  resendVerification: (email: string) => Promise<{ error?: string }>
  signIn: (email: string, password: string) => Promise<{ error?: string; needsVerify?: boolean }>
  signInWithGoogle: (opts?: { redirectTo?: string }) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeUser(raw: any): AuthUser | null {
  const u = raw?.user ?? raw
  if (!u || !u.id) return null
  return { id: u.id, email: u.email ?? '', name: u.name ?? u.nickname ?? u.profile?.name }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function msg(error: any): string {
  return error?.message || error?.error || 'Something went wrong. Please try again.'
}

const REDIRECT = typeof window !== 'undefined' ? `${window.location.origin}/app` : 'https://origin-physical-ai.pages.dev/app'

// Only hit the auth endpoint when there's actually a session to restore: a stored token,
// or an OAuth code in the URL to exchange. Without this, signed-out visitors fire repeated
// /auth/refresh calls that 401 — noisy in devtools and wasteful on every public page load.
function hasRestorableSession(): boolean {
  if (typeof window === 'undefined') return false
  if (OAUTH_RETURN) return true // just came back from a Google round-trip (param captured pre-strip)
  try {
    const ls = window.localStorage
    if (ls.getItem('insforge_access_token') || ls.getItem('insforge-token') || ls.getItem('insforge_refresh_token')) return true
  } catch { /* storage blocked — fall through */ }
  const p = new URLSearchParams(window.location.search)
  return p.has('insforge_code') || p.has('code')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [deniedEmail, setDeniedEmail] = useState<string | null>(null)
  // Ready immediately unless there's a session to restore — so signed-out visitors never
  // block on (or trigger) an auth call.
  const [ready, setReady] = useState(() => !AUTH_ENABLED || !hasRestorableSession())

  const refresh = useCallback(async () => {
    if (!insforge) return false
    try {
      const { data } = await insforge.auth.getCurrentUser()
      const u = normalizeUser(data)
      // Owner-only: any other account that signed in is rejected and signed back out, so it
      // never reaches the app as a live user.
      if (u && !isOwnerEmail(u.email)) {
        setDeniedEmail(u.email)
        setUser(null)
        try { await insforge.auth.signOut() } catch { /* ignore */ }
        return false
      }
      if (u) setDeniedEmail(null)
      setUser(u)
      return Boolean(u)
    } catch {
      setUser(null)
      return false
    }
  }, [])

  // Initial session load. The SDK exchanges an OAuth `insforge_code` on init (async), so on
  // a Google round-trip the token may not be stored yet when we first ask — retry briefly.
  // Skipped entirely for signed-out visitors so the public site makes no auth calls.
  useEffect(() => {
    if (!insforge || !hasRestorableSession()) return
    let alive = true
    ;(async () => {
      let found = await refresh()
      if (!found && OAUTH_RETURN) {
        for (let i = 0; i < 8 && alive && !found; i++) {
          await new Promise((r) => setTimeout(r, 400))
          found = await refresh()
        }
        // Tidy the URL after a successful OAuth login (drop any leftover query/echo) while
        // PRESERVING the page we landed on — OAuth may return to /passport, not just /app.
        if (found && alive) window.history.replaceState({}, '', window.location.pathname)
      }
      if (alive) setReady(true)
    })()
    return () => { alive = false }
  }, [refresh])

  const signUp = useCallback<AuthState['signUp']>(async (email, password, name) => {
    if (!insforge) return { needsVerify: false, error: 'Auth is not configured.' }
    const { data, error } = await insforge.auth.signUp({ email, password, name, redirectTo: REDIRECT })
    if (error) return { needsVerify: false, error: msg(error) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any
    if (d?.requireEmailVerification) return { needsVerify: true }
    await refresh()
    return { needsVerify: false }
  }, [refresh])

  const verifyEmail = useCallback<AuthState['verifyEmail']>(async (email, otp) => {
    if (!insforge) return { error: 'Auth is not configured.' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (insforge.auth as any).verifyEmail({ email, otp })
    if (error) return { error: msg(error) }
    await refresh()
    return {}
  }, [refresh])

  const resendVerification = useCallback<AuthState['resendVerification']>(async (email) => {
    if (!insforge) return { error: 'Auth is not configured.' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (insforge.auth as any).resendVerificationEmail({ email, redirectTo: REDIRECT })
    return error ? { error: msg(error) } : {}
  }, [])

  const signIn = useCallback<AuthState['signIn']>(async (email, password) => {
    if (!insforge) return { error: 'Auth is not configured.' }
    const { error } = await insforge.auth.signInWithPassword({ email, password })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (error) return (error as any).statusCode === 403 ? { needsVerify: true, error: 'Please verify your email first.' } : { error: msg(error) }
    await refresh()
    return {}
  }, [refresh])

  const signInWithGoogle = useCallback<AuthState['signInWithGoogle']>(async (opts) => {
    if (!insforge) return { error: 'Auth is not configured.' }
    try {
      await insforge.auth.signInWithOAuth('google', { redirectTo: opts?.redirectTo ?? REDIRECT, additionalParams: { prompt: 'select_account' } })
      return {}
    } catch (e) {
      return { error: msg(e) }
    }
  }, [])

  const signOut = useCallback<AuthState['signOut']>(async () => {
    if (insforge) { try { await insforge.auth.signOut() } catch { /* ignore */ } }
    setUser(null)
  }, [])

  const value = useMemo<AuthState>(
    () => ({ enabled: AUTH_ENABLED, ready, user, deniedEmail, signUp, verifyEmail, resendVerification, signIn, signInWithGoogle, signOut }),
    [ready, user, deniedEmail, signUp, verifyEmail, resendVerification, signIn, signInWithGoogle, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
