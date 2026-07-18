import { test, expect, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'

// Collect console errors + page errors so a "clean console" is a hard assertion, not a hope.
function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}
const benign = (e: string) => /devtools|react-refresh|\[vite\]|favicon/i.test(e)

// canonical JSON used by the TR-A002 emitter: keys sorted at every level, no whitespace.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}'
  }
  return JSON.stringify(value)
}
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

test('home carries the agent-evidence thesis, one h1, clean console', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await expect(page).toHaveTitle(/Origin/)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toHaveText(/security review/i)
  await expect(page.getByRole('heading', { name: 'Capability is not permission.' })).toBeVisible()
  await page.waitForTimeout(800)
  expect(errors.filter((e) => !benign(e)), errors.join('\n')).toHaveLength(0)
})

test('home content is in the server HTML (crawler-readable, not client-rendered)', async ({ page }) => {
  const res = await page.request.get('/')
  expect(res.status()).toBe(200)
  const html = await res.text()
  expect(html).toContain('The evidence layer for AI agents')
  expect(html).toContain('Get your agent through security review')
  expect(html).toContain('Book an Agent Evidence Review')
  expect(html).toContain('tamper-evident')
  expect(html).toContain('application/ld+json')
  // the old robotics thesis must be gone
  expect(html).not.toMatch(/work order|no-go zone|AMR-|Aisle \d/i)
})

test('social + SEO meta present on the home', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og-cover\.jpg/)
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{50,}/)
  const res = await page.request.get('/og-cover.jpg')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('image/jpeg')
})

test('signed-out home makes no auth-refresh calls', async ({ page }) => {
  const auth: string[] = []
  page.on('request', (r) => { if (r.url().includes('/auth/refresh')) auth.push(r.url()) })
  await page.goto('/')
  await page.waitForTimeout(1200)
  expect(auth, auth.join('\n')).toHaveLength(0)
})

test('interactive 90-second demo steps and reaches the blocked + sealed states', async ({ page }) => {
  await page.goto('/')
  const demo = page.locator('[data-demo]')
  await expect(demo).toBeVisible()
  // progressive enhancement kicked in
  await expect(demo).toHaveClass(/is-enhanced/)
  // step to the block panel via the rail
  await page.locator('[data-demo-step="7"]').click()
  await expect(page.locator('[data-demo-panel="7"]')).toContainText('BLOCKED')
  await page.locator('[data-demo-step="8"]').click()
  await expect(page.locator('[data-demo-panel="8"]')).toContainText('SEALED')
})

test('reference check communicates selection, verdict, and drift invalidation accessibly', async ({ page }) => {
  await page.goto('/reference-check')
  const support = page.getByRole('button', { name: /Customer-support agent/ })
  const iam = page.getByRole('button', { name: /IAM least-privilege/ })
  await expect(support).toHaveAttribute('aria-pressed', 'true')
  await expect(iam).toHaveAttribute('aria-pressed', 'false')

  await page.getByRole('button', { name: 'Run the reference check' }).click()
  const result = page.getByRole('status')
  await expect(result).toContainText('Verified Readiness Level')
  await expect(page.locator('body')).toContainText('Synthetic pilot battery')

  await page.getByRole('button', { name: /Change a tool/ }).click()
  await expect(page.getByRole('alert')).toContainText('VOID (code 4) — config drift')
})

test('auth page is invite-only private pilot with legal links', async ({ page }) => {
  await page.goto('/auth.html')
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('body')).toContainText(/invite-only/i)
  await expect(page.locator('body')).toContainText('Book an Agent Evidence Review')
  expect((await page.request.get('/legal/terms-of-service.html')).status()).toBe(200)
  expect((await page.request.get('/legal/privacy-policy.html')).status()).toBe(200)
})

test('proof page presents the honest ladder — TR-A001 authored, TR-A002 machine-emitted', async ({ page }) => {
  await page.goto('/proof.html')
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toHaveText(/honest ladder/i)
  // honesty labels are load-bearing
  await expect(page.locator('body')).toContainText('authored')
  await expect(page.locator('body')).toContainText('machine-emitted')
  await expect(page.locator('body')).toContainText('tamper-evident')
  await expect(page.locator('body')).not.toContainText(['tamper', 'proof'].join('-'))
  // the real machine-emitted artifact is one click away
  await expect(page.locator('a[href="/proof/tr-a002.json"]').first()).toBeVisible()
})

test('TR-A002 is a real, tamper-evident SHA-256 hash chain (12 events, verifiable digest)', async ({ page }) => {
  const res = await page.request.get('/proof/tr-a002.json')
  expect(res.status()).toBe(200)
  const trace = await res.json()
  expect(trace.artifact).toBe('TR-A002')
  expect(trace.type).toBe('machine_emitted_sandbox_trace')
  expect(Array.isArray(trace.events)).toBe(true)
  expect(trace.events.length).toBe(12)
  // re-derive the chain independently — this is what proof:verify does
  let prev = '0'.repeat(64)
  for (const e of trace.events) {
    expect(e.prev_hash).toBe(prev)
    expect(e.sandbox).toBe(true)
    const { event_hash, ...payload } = e
    expect(sha256(canonical(payload))).toBe(event_hash)
    prev = event_hash
  }
  // sealed final digest commits the whole chain
  const last = trace.events[trace.events.length - 1]
  expect(last.action).toBe('evidence.digest_sealed')
  expect(trace.final_digest).toBe(last.event_hash)
  // no event claims live money moved
  for (const e of trace.events) {
    if (e.side_effect) expect(e.side_effect.live_money).not.toBe(true)
  }
})

test('the evidence console (/app) is a simulated, scenario-switchable preview', async ({ page }) => {
  await page.goto('/app.html')
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('body')).toContainText(/Evidence Console/i)
  await expect(page.locator('body')).toContainText(/[Ss]imulated|sandbox/)
  await expect(page.locator('body')).toContainText('BLOCKED')
  // no stale React runtime-console mount and no robot language
  const html = await (await page.request.get('/app.html')).text()
  expect(html).not.toMatch(/work order|no-go zone|AMR-|ROS 2/i)
})

test('key routes are served (brief, trust, llms, legal)', async ({ page }) => {
  for (const path of ['/brief.html', '/trust.html', '/llms.txt', '/legal/privacy-policy.html', '/legal/terms-of-service.html']) {
    const res = await page.request.get(path)
    expect(res.status(), path).toBe(200)
  }
})
