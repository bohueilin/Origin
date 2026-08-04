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
