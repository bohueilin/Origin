// What a REFUSED account sees.
//
// Origin is owner-only while it is being built: AuthProvider.refresh() signs any other
// account straight back out. That half worked. The other half — telling the person what
// just happened — did not exist. A rejected visitor was handed the exact pixels an
// anonymous visitor gets, down to a "Sign in →" link whose only possible outcome is the
// same silent rejection, and a /auth page that opened in sign-up mode telling them to
// "use the owner Google account" above a Google button that sign-ups being paused had
// disabled. Nothing was broken in a way a test could see, because no test had ever
// looked at the denied state at all.
//
// These specs run against the denied state directly. The denial is carried in
// sessionStorage ('origin.auth.denied') precisely so it survives the /auth → /admin
// document navigation, which also makes it seedable here — no Google round trip needed.

import { test, expect } from '@playwright/test'

const DENIED = 'not-the-owner@example.com'
// The owner address, duplicated here deliberately: a test that imported the constant
// from the module under test could not catch that module changing it.
const OWNER = 'bohueilin@gmail.com'

/** Seed the provider's record of a refused sign-in, as a real denial would leave it. */
async function seedDenial(page: import('@playwright/test').Page, email = DENIED) {
  await page.addInitScript((e) => { window.sessionStorage.setItem('origin.auth.denied', e) }, email)
}

/**
 * Answer the InsForge session-refresh call with `user`, and count every auth call.
 * The browser SDK keeps no token in storage, so a restore always goes through
 * POST /api/auth/refresh — stubbing it is enough to hand the app a live session.
 */
async function stubSession(
  page: import('@playwright/test').Page,
  user: { id: string; email: string } | null,
  opts: { delayMs?: number } = {},
): Promise<string[]> {
  const calls: string[] = []
  await page.route('**/api/auth/**', async (route) => {
    const url = route.request().url()
    calls.push(url)
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs))
    if (user && /\/api\/auth\/refresh/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'stub-access-token', user }),
      })
    }
    await route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' })
  })
  return calls
}

// ---------------------------------------------------------------------------
// /passport — the read-only banner
// ---------------------------------------------------------------------------

test('the passport banner names the account that was refused', async ({ page }) => {
  await seedDenial(page)
  await page.goto('/passport')
  const banner = page.locator('.pp-readonly')
  await expect(banner).toBeVisible()
  // The whole point: the visitor learns WHICH account was turned away. Without this
  // the denied state and the anonymous state are pixel-identical.
  await expect(banner).toContainText(DENIED)
})

test('the passport banner stops offering the sign-in that just failed', async ({ page }) => {
  await seedDenial(page)
  await page.goto('/passport')
  const link = page.locator('.pp-readonly .pp-readonly-link')
  await expect(link).toBeVisible()
  // "Sign in →" after a refusal is a loop: it returns the visitor to the flow that
  // has already rejected them. The only move that can succeed is a different account.
  await expect(link).not.toHaveText(/^\s*sign in/i)
  await expect(link).toHaveText(/different account/i)
})

test('an anonymous visitor still gets the plain read-only banner', async ({ page }) => {
  // The denial copy must not leak into the ordinary signed-out case — no phantom
  // "different account" for someone who never had one.
  await page.goto('/passport')
  const banner = page.locator('.pp-readonly')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText(/sign in as the Origin owner/i)
  await expect(page.locator('.pp-readonly .pp-readonly-link')).toHaveText(/^\s*sign in/i)
})

test('the read-only banner does not flash before the session resolves', async ({ page }) => {
  // With a restorable session the owner check cannot be answered until the server
  // answers. Painting "read-only, sign in" in the meantime tells the owner their own
  // session failed, then silently retracts it.
  const calls = await stubSession(page, { id: 'owner-1', email: OWNER }, { delayMs: 2000 })
  await page.addInitScript(() => { window.localStorage.setItem('origin.auth.session', '1') })
  await page.goto('/passport')
  // Establish the window first: the restore is in flight and the app has painted.
  await expect.poll(() => calls.length, { message: 'the session restore must be in flight' }).toBeGreaterThan(0)
  await expect(page.locator('.pp-top')).toBeVisible()
  // A ONE-SHOT count, deliberately: the retrying form of this assertion passes by
  // waiting out the very flash it is supposed to catch.
  expect(await page.locator('.pp-readonly').count(), 'the banner must not paint before the session resolves').toBe(0)
  // …and once the owner resolves, it must still be absent.
  await expect(page.locator('.pp-readonly')).toHaveCount(0, { timeout: 8000 })
})

// ---------------------------------------------------------------------------
// /auth — the page a refused visitor is sent to
// ---------------------------------------------------------------------------

test('/auth opens in sign-in mode after a denial, with Google actually usable', async ({ page }) => {
  await seedDenial(page)
  await page.goto('/auth')
  await expect(page.locator('.ap-denied')).toContainText(DENIED)
  // Sign-ups are paused, so the sign-up mode this page defaults to disables the very
  // button the denial notice tells the visitor to press.
  await expect(page.locator('.ap-title')).toHaveText(/welcome back/i)
  await expect(page.locator('.ap-google')).toBeEnabled()
})

test('/auth still opens in sign-up mode for an ordinary visitor', async ({ page }) => {
  await page.goto('/auth')
  await expect(page.locator('.ap-title')).toHaveText(/private pilot access/i)
  await expect(page.locator('.ap-paused')).toBeVisible()
})

test('every aria-describedby on /auth points at an element that exists', async ({ page }) => {
  // The paused-signups note is the described element, but it is not rendered when the
  // denial notice wins the ternary — leaving both the Google button and the submit
  // button describing an id that is not in the document.
  await seedDenial(page)
  await page.goto('/auth')
  await expect(page.locator('.ap-denied')).toBeVisible()
  const dangling = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-describedby]')]
      .flatMap((el) => (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean))
      .filter((id) => !document.getElementById(id)),
  )
  expect(dangling, `dangling aria-describedby target(s): ${dangling.join(', ')}`).toEqual([])
})

// ---------------------------------------------------------------------------
// The OAuth destination key
// ---------------------------------------------------------------------------

test('a stranded origin.auth.next is consumed once, not kept', async ({ page }) => {
  // Google returns to /passport when that is the destination, and /passport never
  // mounts AuthPage — so the key AuthPage wrote before leaving is never cleaned up.
  // Months later an unrelated sign-in silently lands on /passport instead of /admin.
  await page.addInitScript(() => { window.sessionStorage.setItem('origin.auth.next', '/passport') })
  await page.goto('/auth')
  await expect.poll(() => page.evaluate(() => document.body.getAttribute('data-auth-default-next')))
    .toBe('/passport')
  const left = await page.evaluate(() => window.sessionStorage.getItem('origin.auth.next'))
  expect(left, 'the destination key must not outlive the round trip it was written for').toBeNull()
})

test('a passport-bound Google sign-in leaves no destination key behind', async ({ page }) => {
  // When the callback returns straight to /passport, that page IS the destination —
  // nothing ever reads the key, so writing it only creates the stale value above.
  await page.goto('/auth?next=/passport')
  await page.locator('.ap-alt .ap-link').click() // sign-ups are paused; switch to sign-in
  await page.locator('.ap-google').click()
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem('origin.auth.next')))
    .toBeNull()
})

test('an admin-bound Google sign-in does persist its destination', async ({ page }) => {
  // The other direction: /auth is the callback landing page and genuinely needs the
  // key to know where to forward. The fix must not delete that.
  await page.goto('/auth?next=/admin')
  await page.locator('.ap-alt .ap-link').click() // sign-ups are paused; switch to sign-in
  await page.locator('.ap-google').click()
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem('origin.auth.next')))
    .toBe('/admin')
})

// ---------------------------------------------------------------------------
// The OAuth retry loop
// ---------------------------------------------------------------------------

test('a refused OAuth return does not spin the retry loop', async ({ page }) => {
  // AuthProvider retries getCurrentUser 8x400ms on an OAuth return, to cover the code
  // exchange still being in flight. A denial is not that case: the server has already
  // said who this is and the app has already signed them back out. Re-asking eight more
  // times fires eight doomed round trips and holds `ready` false — and therefore the
  // denial UI — for 3.2 seconds.
  //
  // Count the calls rather than timing the wait. The banner is gated on `ready`, which
  // the loop holds false until it drains — so "wait for the denial, then watch for more
  // traffic" would sit through the entire storm and then report a quiet line. The call
  // count is the mechanism itself, and it decides the delay: measured before this fix,
  // 10 refreshes and 3.7s to first paint of the denial.
  const calls = await stubSession(page, { id: 'intruder-1', email: DENIED })
  await page.goto('/passport?insforge_code=stub')
  await expect(page.locator('.pp-readonly')).toContainText(DENIED)
  const refreshes = calls.filter((u) => /\/api\/auth\/refresh/.test(u)).length
  // One restore per mount (StrictMode mounts twice in dev), never one per retry.
  expect(refreshes, calls.join('\n')).toBeLessThan(5)
})
