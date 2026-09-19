import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Exercise the real auth provider and account components. Only their network boundary
// is replaced: no session, customer record, or mutation leaves this browser test.
const OWNER = { id: 'fixture-owner', email: 'bohueilin@gmail.com', name: 'Review operator' }
const LEAD = {
  id: 'fixture-lead', name: 'Sample reviewer', email: 'reviewer@example.com', company: 'Example team',
  blocker: 'Inspect an approval boundary.', intent: 'evidence_review', cta_source: 'fixture',
  page_path: '/', status: 'new', created_at: '2026-09-18T12:00:00.000Z',
}
const TICKET = {
  id: 'fixture-ticket', user_id: 'fixture-user', email: 'reviewer@example.com',
  subject: 'Sample review question', body: 'How can I inspect the receipt?', category: 'general',
  status: 'open', created_at: '2026-09-18T12:00:00.000Z',
}

async function mockAccount(page: Page, options: {
  signedIn?: boolean
  role?: 'user' | 'admin' | 'super_admin'
  roleGate?: Promise<void>
  failRole?: boolean
} = {}) {
  let roleUnavailable = options.failRole ?? false
  if (options.signedIn !== false) {
    await page.addInitScript(() => localStorage.setItem('origin.auth.session', '1'))
  }
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    const json = (body: unknown, status = 200) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(body),
    })
    if (url.pathname.startsWith('/api/auth/')) {
      if (options.signedIn !== false && url.pathname.endsWith('/refresh')) {
        return json({ accessToken: 'fixture-access-token', user: OWNER })
      }
      return json({ message: 'No session in this fixture.' }, 401)
    }
    if (url.pathname.startsWith('/api/database/')) {
      const rpc = url.pathname.split('/rpc/')[1]
      if (rpc === 'ensure_my_role') {
        await options.roleGate
        if (roleUnavailable) return json({ message: 'Role lookup unavailable.' }, 503)
        return json(options.role ?? 'super_admin')
      }
      if (rpc === 'admin_list_leads') return json([LEAD])
      if (rpc === 'admin_list_tickets') return json([TICKET])
      if (rpc === 'admin_update_lead' || rpc === 'admin_update_ticket') {
        return json({ message: 'Status update unavailable.' }, 503)
      }
      return json([])
    }
    // All unhandled APIs and external origins fail closed, including analytics/fonts.
    if (url.pathname.startsWith('/api/') || !['localhost', '127.0.0.1'].includes(url.hostname)) {
      return route.abort('blockedbyclient')
    }
    return route.continue()
  })
  return { recoverRole: () => { roleUnavailable = false } }
}

test('paused pilot offers a review and sign-in without collecting unusable signup details', async ({ page }) => {
  await mockAccount(page, { signedIn: false })
  await page.goto('/auth')
  await expect(page.locator('.ap-paused')).toBeVisible()
  await expect(page.getByRole('link', { name: /book an agent evidence review/i })).toBeVisible()
  await expect(page.locator('.ap-fields input')).toHaveCount(0)
  await page.locator('.ap-alt .ap-link').click()
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeEnabled()
})

test('signed-in admin is a page that stays open on Escape', async ({ page }) => {
  await mockAccount(page)
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Account workspace', level: 1 })).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Origin home' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
})

test('role remains explicitly unresolved until the role service answers', async ({ page }) => {
  let releaseRole!: () => void
  const roleGate = new Promise<void>((resolve) => { releaseRole = resolve })
  await mockAccount(page, { roleGate })
  try {
    await page.goto('/admin')
    await expect(page.getByRole('status').filter({ hasText: /checking.*role/i })).toBeVisible()
    await expect(page.locator('.cset-role-badge')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0)
  } finally {
    releaseRole()
  }
  await expect(page.getByRole('button', { name: 'Admin', exact: true })).toBeVisible()
})

test('a failed role lookup offers retry while keeping staff tools hidden', async ({ page }) => {
  const fixture = await mockAccount(page, { failRole: true })
  await page.goto('/admin')
  const failure = page.locator('.cset-role-unknown')
  await expect(failure).toContainText(/couldn.t confirm your role/i)
  await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0)
  fixture.recoverRole()
  await failure.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('button', { name: 'Admin', exact: true })).toBeVisible()
  await expect(page.locator('.cset-role-badge')).toHaveText('Super Admin')
})

test('a confirmed regular user never receives staff navigation', async ({ page }) => {
  await mockAccount(page, { role: 'user' })
  await page.goto('/admin')
  await expect(page.locator('.cset-role-badge')).toHaveText('User')
  await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0)
  await expect(page.locator('.cset-subnav')).toHaveCount(0)
})

test('failed review-request status update is visible and keeps the original status', async ({ page }) => {
  await mockAccount(page)
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Admin', exact: true }).click()
  const status = page.getByRole('combobox', { name: 'Status for Sample reviewer' })
  await status.selectOption('contacted')
  await expect(page.getByRole('alert').filter({ hasText: /could not update.*review request/i })).toBeVisible()
  await expect(status).toHaveValue('new')
  await expect(status).toBeEnabled()
})

test('failed ticket status update is visible and keeps the original status', async ({ page }) => {
  await mockAccount(page)
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Admin', exact: true }).click()
  await page.getByRole('button', { name: 'Support queue', exact: true }).click()
  const status = page.getByRole('combobox', { name: 'Ticket status' })
  await status.selectOption('resolved')
  await expect(page.getByRole('alert').filter({ hasText: /could not update.*ticket/i })).toBeVisible()
  await expect(status).toHaveValue('open')
  await expect(status).toBeEnabled()
})

test('account overview remains accessible and fits the viewport', async ({ page }, testInfo) => {
  await mockAccount(page)
  await page.goto('/admin')
  await expect(page.locator('.cset-role-badge')).toHaveText('Super Admin')
  await expect(page.locator('.cset-loading')).toHaveCount(0)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(overflow, 'the account workspace should fit without horizontal page scrolling').toBe(false)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const failures = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(failures.map((v) => `${v.id}: ${v.help}`).join('\n')).toBe('')
  await page.screenshot({ path: testInfo.outputPath('account-overview.png'), fullPage: true })
})
