// Dedicated auth page (a real URL: /auth.html), Luma-style split layout: form on the
// left, a brand "imagine" canvas on the right (placeholder for art we design later).
// Default view is "Create with Origin" (sign up). Reuses the InsForge AuthProvider.
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthProvider'

// Account creation is paused while Origin is in private pilots. While this is
// false, the create-account actions (Continue-with-Google in sign-up + the
// Create-account button) are disabled; sign-in still works for existing owners.
// Flip to true to open sign-ups.
const SIGNUPS_OPEN = false

// Password policy for account creation.
const PW_RULES: { id: string; label: string; test: (p: string) => boolean }[] = [
  { id: 'len', label: 'At least 10 characters', test: (p) => p.length >= 10 },
  { id: 'upper', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'num', label: 'One number', test: (p) => /\d/.test(p) },
  { id: 'sym', label: 'One symbol', test: (p) => /[^A-Za-z0-9]/.test(p) },
]

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M22.5 12.2c0-.7-.06-1.4-.18-2.05H12v3.9h5.9a5.05 5.05 0 0 1-2.19 3.31v2.74h3.54c2.07-1.9 3.25-4.71 3.25-7.9z" />
      <path fill="#34A853" d="M12 23c2.95 0 5.43-.98 7.24-2.65l-3.54-2.74c-.98.66-2.24 1.05-3.7 1.05-2.85 0-5.26-1.92-6.12-4.5H2.23v2.83A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.88 14.16a6.6 6.6 0 0 1 0-4.32V7.01H2.23a11 11 0 0 0 0 9.98z" />
      <path fill="#EA4335" d="M12 5.38c1.6 0 3.04.55 4.17 1.63l3.13-3.13C17.43 2.1 14.95 1 12 1A11 11 0 0 0 2.23 7.01l3.65 2.83C6.74 7.3 9.15 5.38 12 5.38z" />
    </svg>
  )
}

type Mode = 'signup' | 'signin'
type Step = 'details' | 'password' | 'verify'

const NEXT_KEY = 'origin.auth.next'

// Where signing in actually takes you. This was '/app.html' — a static page that
// mounts no JS module at all, so a successful sign-in landed on a page with nothing
// account-aware on it and looked like it had failed. The admin portal is the real
// destination for the owner: accounts, review requests, support queue, audit log.
const DEFAULT_NEXT = '/admin'

export function AuthPage() {
  const auth = useAuth()
  // `next` survives the OAuth round trip in sessionStorage, because the redirect URL must
  // stay query-free to match insforge.toml's full-URL allowlist (see googleRedirect).
  const next = useMemo(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('next')
    if (fromUrl) return fromUrl
    try { return sessionStorage.getItem(NEXT_KEY) || DEFAULT_NEXT } catch { return DEFAULT_NEXT }
  }, [])

  // Expose the computed destination so the reachability gate can assert it without a
  // real OAuth session — the sign-in landing page is otherwise only observable by
  // completing a Google round trip, which cannot run headless.
  useEffect(() => { document.body.setAttribute('data-auth-default-next', next) }, [next])

  // The key is a one-shot baton for a single OAuth round trip, so reading it consumes it.
  // It used to be cleared only on the already-signed-in path below, which never runs when
  // the callback lands somewhere that isn't this page — and it doesn't: a passport-bound
  // sign-in returns to /passport, which mounts AuthProvider but not AuthPage. The value
  // then sat in sessionStorage indefinitely, and the next unrelated sign-in silently
  // redirected to /passport instead of /admin. Cleared in an effect rather than inside the
  // useMemo above because StrictMode double-invokes render, and a read that mutates would
  // hand the second pass a different answer than the first.
  useEffect(() => { try { sessionStorage.removeItem(NEXT_KEY) } catch { /* nothing to clean up */ } }, [])
  // OAuth must land on an allowlisted absolute URL that MOUNTS AuthProvider, because the
  // authorization code is exchanged there. /passport does mount it; /app does NOT (app.html
  // carries no module script), so the old `next.includes('passport') ? '/passport' : '/app'`
  // silently dropped every non-Passport Google sign-in — the visitor landed signed out with
  // no error. Return to /auth, which mounts authMain.tsx, exchanges the code, and then
  // forwards to `next` via the effect below, so the destination UX is unchanged.
  //
  // No query string: insforge.toml `allowed_redirect_urls` matches FULL URLs, so the
  // redirect must be exactly an allowlisted origin+path. `next` therefore travels in
  // sessionStorage across the OAuth round trip instead of in the URL.
  const googleRedirect = useMemo(
    () => `${window.location.origin}${next.includes('passport') ? '/passport' : '/auth'}`,
    [next],
  )

  // Until the visitor picks a view, the denial picks it for them: someone who was just
  // refused is here to retry with a different account, not to create one — and with
  // SIGNUPS_OPEN false the sign-up view disables the very Google button the denial notice
  // tells them to press. Derived rather than synced in an effect, so it is right on the
  // FIRST paint and stays right when the denial only arrives later (refresh() rejecting
  // the account mid-flight on an OAuth return). An explicit choice always wins.
  const [chosenMode, setChosenMode] = useState<Mode | null>(null)
  const mode: Mode = chosenMode ?? (auth.deniedEmail ? 'signin' : 'signup')
  const [step, setStep] = useState<Step>('details')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  // Already signed in → go straight to the destination. (The key is already gone by now:
  // the one-shot effect above consumes it on mount, whatever happens next.)
  useEffect(() => {
    if (auth.ready && auth.user) window.location.replace(next)
  }, [auth.ready, auth.user, next])

  const go = () => window.location.assign(next)
  const switchMode = (m: Mode) => { setChosenMode(m); setStep('details'); setError(''); setNote(''); setPassword(''); setConfirm(''); setOtp('') }

  // password strength (sign-up)
  const pwChecks = PW_RULES.map((r) => ({ ...r, ok: r.test(password) }))
  const pwScore = pwChecks.filter((r) => r.ok).length
  const pwValid = pwScore === PW_RULES.length
  const pwStrength = password.length === 0 ? '' : pwScore <= 2 ? 'weak' : pwScore === 3 ? 'fair' : pwScore === 4 ? 'good' : 'strong'
  const pwStrengthLabel = pwStrength ? pwStrength[0].toUpperCase() + pwStrength.slice(1) : ''
  const confirmMatch = confirm.length > 0 && password === confirm
  const createDisabled = mode === 'signup' && step === 'password' && (!SIGNUPS_OPEN || !pwValid || !confirmMatch)

  async function onGoogle() {
    // Hard gate (not just the disabled attribute): no account creation while paused.
    if (mode === 'signup' && !SIGNUPS_OPEN) { setError('Account creation is paused during the closed private pilot.'); return }
    setError(''); setBusy(true)
    // Persist the destination before we leave the origin ONLY when the callback comes back
    // here, since /auth is the page that reads it and forwards. When the callback returns
    // straight to /passport, that page IS the destination — nothing ever reads the key, so
    // writing it would strand exactly the stale value the one-shot read above exists to kill.
    if (googleRedirect.endsWith('/auth')) {
      try { sessionStorage.setItem(NEXT_KEY, next) } catch { /* private mode — falls back to DEFAULT_NEXT */ }
    }
    const { error } = await auth.signInWithGoogle({ redirectTo: googleRedirect })
    setBusy(false)
    if (error) setError(error)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setNote('')

    if (step === 'verify') {
      setBusy(true)
      const { error } = await auth.verifyEmail(email.trim(), otp.trim())
      setBusy(false)
      if (error) return setError(error)
      return go()
    }

    if (mode === 'signup') {
      if (step === 'details') {
        if (!first.trim() || !email.trim()) return setError('Enter your name and email to continue.')
        return setStep('password')
      }
      // step === 'password'
      if (!SIGNUPS_OPEN) return setError('Account creation is paused during the closed private pilot.')
      if (!pwValid) return setError('Please choose a password that meets all the requirements.')
      if (password !== confirm) return setError('Passwords don’t match.')
      setBusy(true)
      const name = `${first.trim()} ${last.trim()}`.trim()
      const { needsVerify, error } = await auth.signUp(email.trim(), password, name)
      setBusy(false)
      if (error) return setError(error)
      if (needsVerify) { setStep('verify'); setNote(`We sent a 6-digit code to ${email.trim()}.`); return }
      return go()
    }

    // mode === 'signin'
    setBusy(true)
    const { error, needsVerify } = await auth.signIn(email.trim(), password)
    setBusy(false)
    if (needsVerify) { setStep('verify'); setNote(`Enter the 6-digit code we sent to ${email.trim()}.`); return }
    if (error) return setError(error)
    go()
  }

  const heading = step === 'verify' ? 'Verify your email'
    : mode === 'signup' ? (step === 'password' ? 'Create a password' : 'Private pilot access')
    : 'Welcome back'
  const sub = step === 'verify' ? note
    : mode === 'signup' ? (step === 'password' ? 'Set a secure password for your account.' : 'Origin Evidence Console access is invite-only during private pilot. Account creation is paused during the closed pilot. Book an Agent Evidence Review to request access.')
    : 'Invited teams use the Console to review policy verdicts, approvals, proxy events, blocked actions, and evidence packages.'

  // `ap-paused-note` is the id of the paused-signups note — and the denial notice takes
  // that note's place in the ternary below. Anything pointing an aria-describedby at it
  // has to agree about when it is on screen, or a screen-reader user is handed a
  // reference to an element that is not in the document and hears nothing.
  const pausedNote = !auth.deniedEmail && mode === 'signup' && !SIGNUPS_OPEN

  return (
    <div className="ap-shell">
      <main className="ap-form-col">
        <a className="ap-brand" href="/" aria-label="Origin home">
          <img className="ap-logo" src="/origin-logo.png" alt="" aria-hidden="true" />
          <span>Origin</span>
        </a>

        <div className="ap-form-wrap">
          <div className="ap-form-card">
            <h1 className="ap-title">{heading}</h1>
            <p className="ap-sub">{sub}</p>

            {auth.deniedEmail ? (
              <div className="ap-denied" role="alert">
                <strong>Access is restricted.</strong> You signed in as <b>{auth.deniedEmail}</b>, which isn’t an
                approved account. Origin is owner-only while we build — use the owner Google account.
              </div>
            ) : pausedNote ? (
              <div className="ap-paused" role="note" id="ap-paused-note">
                🔒 <strong>Private pilot only.</strong> Account creation is paused during the closed pilot. Invited teams use the Console to review policy verdicts, approvals, proxy events, blocked actions, and evidence packages.{' '}
                <a className="ap-link" href="/#offer" data-analytics="auth_return_to_demo">Book an Agent Evidence Review →</a>
              </div>
            ) : (
              <div className="ap-owner-note" role="note">🔒 Owner access only — sign in with the Origin owner Google account.</div>
            )}

            {/* Google + divider only on the first screen of each mode */}
            {step === 'details' && (
              <>
                <button type="button" className="ap-google" onClick={onGoogle} disabled={busy || (mode === 'signup' && !SIGNUPS_OPEN)}
                  aria-describedby={pausedNote ? 'ap-paused-note' : undefined}>
                  <GoogleMark /> Continue with Google
                </button>
                <div className="ap-or"><span>or</span></div>
              </>
            )}

            <form className="ap-fields" onSubmit={submit}>
              {step === 'verify' ? (
                <label className="ap-field">
                  <span>6-digit code</span>
                  <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={6} autoFocus placeholder="123456" required />
                </label>
              ) : mode === 'signup' && step === 'details' ? (
                <>
                  <div className="ap-row">
                    <label className="ap-field">
                      <span>First name</span>
                      <input value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" autoFocus required />
                    </label>
                    <label className="ap-field">
                      <span>Last name</span>
                      <input value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
                    </label>
                  </div>
                  <label className="ap-field">
                    <span>Email</span>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                  </label>
                </>
              ) : mode === 'signup' && step === 'password' ? (
                <>
                  <label className="ap-field">
                    <span>Password</span>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus required aria-describedby="ap-pw-help" />
                  </label>
                  {password && (
                    <div className={`ap-pw-strength ap-pw-${pwStrength}`} aria-hidden="true">
                      <span className="ap-pw-bar"><span style={{ width: `${(pwScore / PW_RULES.length) * 100}%` }} /></span>
                      <span className="ap-pw-label">{pwStrengthLabel}</span>
                    </div>
                  )}
                  <ul className="ap-pw-rules" id="ap-pw-help" aria-label="Password requirements">
                    {pwChecks.map((r) => (
                      <li key={r.id} className={r.ok ? 'is-ok' : ''}>
                        <span aria-hidden="true">{r.ok ? '✓' : '○'}</span>{r.label}
                      </li>
                    ))}
                  </ul>
                  <label className="ap-field">
                    <span>Confirm password</span>
                    <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required aria-invalid={confirm.length > 0 && !confirmMatch} />
                  </label>
                  {confirm.length > 0 && !confirmMatch && <div className="ap-pw-mismatch" role="alert">Passwords don’t match.</div>}
                </>
              ) : (
                <>
                  <label className="ap-field">
                    <span>Email</span>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus required />
                  </label>
                  <label className="ap-field">
                    <span>Password</span>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                  </label>
                </>
              )}

              {error && <div className="ap-error" role="alert">{error}</div>}
              {note && step !== 'verify' && <div className="ap-note">{note}</div>}

              <button className="ap-submit" type="submit" disabled={busy || createDisabled}
                aria-describedby={pausedNote ? 'ap-paused-note' : undefined}>
                {busy ? 'Working…'
                  : step === 'verify' ? 'Verify & continue'
                  : mode === 'signup'
                    ? (step === 'password' ? (SIGNUPS_OPEN ? 'Create account' : 'Sign-ups paused') : 'Continue')
                    : 'Continue'}
              </button>
            </form>

            {step === 'verify' ? (
              <button type="button" className="ap-switch" onClick={async () => { setError(''); const { error } = await auth.resendVerification(email.trim()); setNote(error ? '' : 'Code resent.'); if (error) setError(error) }}>
                Resend code
              </button>
            ) : mode === 'signup' ? (
              <p className="ap-alt">Already have an account? <button type="button" className="ap-link" onClick={() => switchMode('signin')}>Sign in</button></p>
            ) : (
              <p className="ap-alt">New to Origin? <button type="button" className="ap-link" onClick={() => switchMode('signup')}>Create an account</button></p>
            )}
          </div>
        </div>

        {mode === 'signup' && (
          <p className="ap-legal">
            By creating an account, you agree to the{' '}
            <a href="/legal/terms-of-service.html">Terms of Service</a> and{' '}
            <a href="/legal/privacy-policy.html">Privacy Policy</a>.
          </p>
        )}
      </main>

      {/* Imagine space — placeholder brand canvas; real art comes later. */}
      <aside className="ap-art" aria-hidden="true">
        <div className="ap-art-inner">
          <img className="ap-art-mark" src="/origin-logo.png" alt="Origin" />
          <p className="ap-art-line">Enforce, then prove.</p>
          <p className="ap-art-sub">Propose · Gate · Proxy · Verify.</p>
        </div>
      </aside>
    </div>
  )
}
