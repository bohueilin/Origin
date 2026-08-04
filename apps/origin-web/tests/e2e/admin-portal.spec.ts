// Admin portal contract.
//
// WHY THIS FILE EXISTS. The admin surface (accounts, roles, the support queue, the
// audit log) has been fully implemented in AccountSettings.tsx since July, and for a
// month it was unreachable: commit c2fc5b3 deleted the mount point it was rendered
// into, so no page anywhere on the site rendered it. Nothing failed — there was no
// test that said the portal must be reachable, so an orphaned component looked
// exactly like a working one. Meanwhile the schema it talks to had been lost in a
// project migration, so even a reachable portal would have returned errors.
//
// These tests pin the two things that were never pinned:
//   1. /admin EXISTS and mounts the portal (reachability).
//   2. It NEVER renders account data to a signed-out visitor (the gate).
//
// Signed-in coverage is deliberately out of scope here: it needs a real Google OAuth
// session, which cannot run headless. The database is the actual gate — every
// admin_* RPC re-derives the caller's role via SECURITY DEFINER — so what a browser
// test can meaningfully prove is that the page exists and that the signed-out state
// shows a door, not a dashboard.

import { test, expect } from '@playwright/test'

test('/admin is reachable and serves the portal page', async ({ page }) => {
  const response = await page.goto('/admin')
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle(/admin/i)
  // The mount point must exist — its absence is the exact defect this file guards.
  await expect(page.locator('#admin-root')).toBeAttached()
})

test('a signed-out visitor gets a sign-in prompt, never account data', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', /\/auth/)

  // Assert on the portal's CHROME, not on words. The sign-in card legitimately
  // mentions "the support queue" in its explanatory copy — banning the phrase would
  // pass by deleting the explanation, which tests nothing. What must be absent is
  // the rendered portal itself: no settings shell, no admin panel, no section
  // switcher, no per-row status controls.
  await expect(page.locator('.cset-shell')).toHaveCount(0)
  await expect(page.locator('.cset-panel')).toHaveCount(0)
  await expect(page.locator('.cset-subnav')).toHaveCount(0)
  await expect(page.locator('.cset-role-select')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('the admin portal is reachable from the site footer', async ({ page }) => {
  // Discoverability was the other half of the outage: with no link anywhere, the
  // portal existed only for someone who already knew the URL. The footer is the
  // right home for it — the primary nav stays a single-CTA investor path.
  await page.goto('/')
  const link = page.locator('.site-footer a[href="/auth"]')
  await expect(link).toHaveCount(1)
  await expect(link).toBeVisible()
})

// ---------------------------------------------------------------------------
// Session restore across a page load.
//
// The reported bug: sign in with Google, land back on the signed-out /admin card,
// forever. Root cause — AuthProvider.hasRestorableSession() gated session restore on
// three localStorage keys the InsForge BROWSER client never writes (its TokenManager
// is memory-only; persistence is cookies). So on /admin the guard was false, refresh()
// was never called, and the portal could not know a session existed.
//
// Why nothing caught it: the one auth test asserted "signed-out home makes no
// auth-refresh calls" against `/`, a page that loads no auth code at all. It was green
// for a page that CANNOT make an auth call — vacuous in both directions. These tests
// run against /admin, which does mount AuthProvider, and pin BOTH directions so the
// bug cannot return and cannot be "fixed" by making the guard unconditionally true.
// ---------------------------------------------------------------------------

/** Capture every auth call and stub it, so no request leaves the machine. */
async function trapAuthCalls(page: import('@playwright/test').Page): Promise<string[]> {
  const calls: string[] = []
  await page.route('**/api/auth/**', async (route) => {
    calls.push(route.request().url())
    await route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' })
  })
  return calls
}

test('/admin tries to restore a session when the app marked one as live', async ({ page }) => {
  const calls = await trapAuthCalls(page)
  await page.addInitScript(() => { window.localStorage.setItem('origin.auth.session', '1') })
  await page.goto('/admin')
  // Before the fix this is 0: the guard returned false and the effect returned early.
  await expect.poll(() => calls.length, { timeout: 6000, message: 'AuthProvider must attempt a restore' }).toBeGreaterThan(0)
})

test('/admin tries to restore a session from the SDK CSRF cookie alone', async ({ page, context }) => {
  // The app-owned marker can be missing — cleared storage, a session established by
  // another tab — so the SDK's own first-party cookie has to work as a signal too.
  const calls = await trapAuthCalls(page)
  await context.addCookies([{ name: 'insforge_csrf_token', value: 'test-csrf', url: 'http://localhost:5290' }])
  await page.goto('/admin')
  await expect.poll(() => calls.length, { timeout: 6000, message: 'the CSRF cookie must count as a restorable session' }).toBeGreaterThan(0)
})

test('a genuinely signed-out /admin visit still makes no auth calls', async ({ page }) => {
  // The property the original guard was written to protect. Keep it: the fix must be a
  // better SIGNAL, not the removal of the check.
  const calls = await trapAuthCalls(page)
  await page.goto('/admin')
  await page.waitForTimeout(1200)
  expect(calls, calls.join('\n')).toHaveLength(0)
})

test('a stray ?code= query does not trigger an auth storm', async ({ page }) => {
  // OAUTH_RETURN matched a bare `code=`, but the SDK only ever consumes `insforge_code`.
  // A marketing link like /admin?code=SPRING would make a signed-out visitor fire a
  // burst of doomed auth calls.
  const calls = await trapAuthCalls(page)
  await page.goto('/admin?code=SPRING')
  await page.waitForTimeout(1200)
  expect(calls, calls.join('\n')).toHaveLength(0)
})

test('/auth sends an authenticated owner to the admin portal', async ({ page }) => {
  // The post-sign-in destination used to be /app.html — a static page that mounts no
  // JS at all, which is why signing in appeared to lead nowhere.
  await page.goto('/auth')
  const dest = await page.evaluate(() => {
    // The page persists its destination for the OAuth round trip; read the default
    // it computes when no `next` was supplied.
    return document.body.getAttribute('data-auth-default-next')
  })
  expect(dest).toBe('/admin')
})
