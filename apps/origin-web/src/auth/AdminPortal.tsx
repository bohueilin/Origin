// The admin portal, as a page.
//
// AccountSettings has always been written as a dialog opened from an account menu.
// That menu was deleted from the marketing shell, which left the whole admin
// surface — accounts, roles, the support queue, review requests, the audit log —
// implemented but mountable from nowhere. Giving it a real URL fixes that at the
// root: an addressable page cannot be orphaned by a shell refactor, and it can be
// bookmarked, linked, and tested.
//
// The gate here is presentational only. Every admin_* RPC re-derives the caller's
// role inside the database (SECURITY DEFINER + RLS), so a signed-out or non-staff
// visitor who reaches the markup still gets nothing back.
import { useAuth } from './AuthProvider'
import { AccountSettings } from './AccountSettings'

export function AdminPortal() {
  const auth = useAuth()

  if (!auth.ready) {
    return (
      <div className="ap-shell ap-shell--solo">
        <main className="ap-form-col">
          <div className="ap-form-wrap"><div className="ap-form-card"><p className="ap-sub">Checking your session…</p></div></div>
        </main>
      </div>
    )
  }

  if (!auth.user) {
    return (
      <div className="ap-shell ap-shell--solo">
        <main className="ap-form-col">
          <a className="ap-brand" href="/" aria-label="Origin home">
            <img className="ap-logo" src="/origin-logo.png" alt="" aria-hidden="true" />
            <span>Origin</span>
          </a>
          <div className="ap-form-wrap">
            <div className="ap-form-card">
              <h1 className="ap-title">Admin portal</h1>
              <p className="ap-sub">
                {auth.deniedEmail
                  ? `You signed in as ${auth.deniedEmail}, which isn’t an approved account.`
                  : 'Sign in with the Origin owner account to manage accounts, review requests, and the support queue.'}
              </p>
              <a className="ap-submit" href="/auth?next=/admin">Sign in</a>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Closing a page-level portal means leaving it, not hiding it.
  return <AccountSettings onClose={() => window.location.assign('/')} />
}
