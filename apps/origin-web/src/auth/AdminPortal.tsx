// Addressable account workspace. This presentation gate never replaces database
// authorization: each admin RPC still derives the caller's role server-side.
import { useAuth } from './AuthProvider'
import { AccountSettings } from './AccountSettings'

export function AdminPortal() {
  const auth = useAuth()

  if (auth.ready && auth.user) return <AccountSettings />

  return (
    <div className="ap-shell">
      <main className="ap-form-col">
        <a className="ap-brand" href="/" aria-label="Origin home">
          <img className="ap-logo" src="/brand/origin-mark.svg" alt="" />
          <span>origin</span>
        </a>
        <div className="ap-form-wrap">
          <div className="ap-form-card">
            <p className="ap-kicker">Origin Console</p>
            <h1 className="ap-title">Admin portal</h1>
            {!auth.ready ? (
              <div className="ap-session" role="status">
                <span className="ap-session-dot" aria-hidden="true" />Checking your session…
              </div>
            ) : (
              <>
                <p className="ap-sub">A workspace for permissions, review requests, and the evidence behind each decision.</p>
                {auth.deniedEmail ? (
                  <div className="ap-denied" role="alert">
                    <strong>This account doesn’t have access.</strong>
                    You signed in as <b>{auth.deniedEmail}</b>, which isn’t an approved account. Use the Origin owner account to continue.
                  </div>
                ) : (
                  <div className="ap-owner-note" role="note">Owner access only. Sign in to manage accounts, review requests, and the support queue.</div>
                )}
                <a className="ap-submit" href="/auth?next=/admin">{auth.deniedEmail ? 'Use a different account' : 'Sign in'}</a>
                <a className="ap-back" href="/">Return to Origin</a>
              </>
            )}
          </div>
        </div>
        <p className="ap-legal">Restricted prototype · Account access is restricted.</p>
      </main>
      <aside className="ap-art" aria-hidden="true">
        <img className="ap-art-photo" src="/brand/review.webp" alt="" fetchPriority="high" />
        <div className="ap-art-inner">
          <p className="ap-art-label">Capability is not permission.</p>
          <p className="ap-art-line">Authority with accountability.</p>
          <p className="ap-art-sub">A clear view of who can act, what needs approval, and what the evidence says.</p>
          <span className="ap-art-rule" />
        </div>
      </aside>
    </div>
  )
}
