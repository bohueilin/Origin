import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createHash } from 'node:crypto'

// Collect console errors + page errors so a "clean console" is a hard assertion, not a hope.
function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}
const benign = (e: string) => /devtools|react-refresh|\[vite\]|favicon/i.test(e)

async function blockFoundryNetwork(page: Page): Promise<string[]> {
  const attempted: string[] = []
  await page.route(/(?:\/api\/foundry\/|api\.cerebras\.ai|generativelanguage\.googleapis\.com)/i, async (route) => {
    attempted.push(route.request().url())
    await route.abort('blockedbyclient')
  })
  return attempted
}

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
  await expect(page.locator('h1')).toHaveText('Test the policy. Inspect the evidence.')
  await page.waitForTimeout(800)
  expect(errors.filter((e) => !benign(e)), errors.join('\n')).toHaveLength(0)
})

test('home content is in the server HTML (crawler-readable, not client-rendered)', async ({ page }) => {
  const res = await page.request.get('/')
  expect(res.status()).toBe(200)
  const html = await res.text()
  // Strip inline tags before matching. The guard is "this copy is in the SERVER html,
  // not client-rendered" — semantic markup inside a heading (e.g. <em> on one word) does
  // not weaken that, but a raw substring check treats it as a failure. Tags are replaced
  // with nothing rather than a space, so text broken across elements in a way that would
  // change reading order still fails.
  const text = (await res.text()).replace(/<[^>]+>/g, '')
  expect(html).toContain('For teams whose AI agent is waiting in security review')
  expect(text).toContain('Test the policy. Inspect the evidence.')
  expect(html).toContain('Origin does not contact or execute your named agent. Browser evidence is untrusted by default.')
  expect(html).toContain('Book an Agent Evidence Review')
  expect(html).toContain('tamper-evident')
  expect(html).toContain('application/ld+json')
  // the old robotics thesis must be gone
  expect(html).not.toMatch(/work order|no-go zone|AMR-|Aisle \d/i)
  expect(html).not.toMatch(/turn floor work orders|physical-ai autonomy layer/i)
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

// The approved investor-ready design replaced the eight-step runtime-proxy
// walkthrough with the five implemented reference-check stages, so this test now
// pins the same property (the demo steps and reaches its terminal proof states)
// against Attest and Reverify instead of Block and Seal.
test('interactive reference-check demo steps and reaches the attested + VOID states', async ({ page }) => {
  await page.goto('/')
  const demo = page.locator('[data-demo]')
  await expect(demo).toBeVisible()
  // progressive enhancement kicked in
  await expect(demo).toHaveClass(/is-enhanced/)
  await page.locator('[data-demo-step="4"]').click()
  await expect(page.locator('[data-demo-panel="4"]')).toContainText('SIGNED')
  await page.locator('[data-demo-step="5"]').click()
  await expect(page.locator('[data-demo-panel="5"]')).toContainText('VOID')
})

test('reference check communicates selection, verdict, and drift invalidation accessibly', async ({ page }) => {
  await page.goto('/reference-check')
  const explainerLink = page.getByRole('link', { name: /differs from proposed runtime enforcement/i })
  await expect(explainerLink).toBeVisible()
  await expect(explainerLink).toHaveAttribute('href', '/reference-check-vs-runtime')
  expect((await page.request.get('/reference-check-vs-runtime')).status()).toBe(200)
  const support = page.getByRole('button', { name: /Customer-support agent/ })
  const iam = page.getByRole('button', { name: /IAM least-privilege/ })
  await expect(support).toHaveAttribute('aria-pressed', 'true')
  await expect(iam).toHaveAttribute('aria-pressed', 'false')

  await page.getByRole('button', { name: 'Run the reference check' }).click()
  const result = page.getByRole('status')
  await expect(result).toContainText('synthetic decisions match the oracle')
  await expect(page.locator('body')).toContainText('Synthetic demo battery')

  await page.getByRole('button', { name: /Change a tool/ }).click()
  await expect(page.getByRole('alert')).toContainText('VOID (code 4) — config drift')
})

test('reference-check discloses synthetic session-signed unpinned provenance before a run', async ({ page }) => {
  await page.goto('/reference-check')
  const beforeRun = page.locator('main').first()
  await expect(beforeRun).toContainText(/synthetic/i)
  await expect(beforeRun).toContainText(/session-signed/i)
  await expect(beforeRun).toContainText(/unpinned/i)
})

test('public Foundry is local-sample-only and emits no Foundry/provider request', async ({ page }) => {
  const attempted = await blockFoundryNetwork(page)
  await page.goto('/foundry')

  const upload = page.getByRole('button', { name: /Upload a floor image/i })
  await expect(upload).toBeDisabled()
  await expect(page.getByText('local/backend demo only', { exact: false }).first()).toBeVisible()

  // A disabled public control has no React change handler. Programmatically
  // dispatching a file event must therefore do nothing, rather than merely
  // relying on the browser's disabled-input behavior or an in-handler guard.
  await page.locator('input[type="file"]').evaluate((element) => {
    const input = element as HTMLInputElement
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['not-an-image'], 'floor.png', { type: 'image/png' })],
    })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText(/No image left this browser/i)).toHaveCount(0)

  const speed = page.getByRole('button', { name: /Run the speed race/i }).first()
  await expect(speed).toBeDisabled()

  await page.getByRole('button', { name: 'Use the sample floor' }).click()
  await expect(page.getByText(/sample floor — not parsed from an upload/i)).toBeVisible()
  await expect(page.getByText(/No image left this browser/i)).toBeVisible()

  const quorum = page.getByRole('button', { name: /Run the Quorum loop/i })
  await expect(quorum).toBeDisabled()
  await expect(page.getByText('local/backend demo only', { exact: false }).last()).toBeVisible()
  expect(attempted).toEqual([])
})

test('@foundry-local consent gates the local-demo chooser without submitting', async ({ page }) => {
  const attempted = await blockFoundryNetwork(page)
  await page.goto('/foundry')

  const consent = page.getByRole('checkbox', { name: /selected image.*Cerebras/i })
  const upload = page.getByRole('button', { name: /Upload a floor image/i })
  await expect(consent).not.toBeChecked()
  await expect(upload).toBeDisabled()

  await consent.check()
  await expect(upload).toBeEnabled()
  const chooser = page.waitForEvent('filechooser')
  await upload.click()
  await chooser

  expect(attempted).toEqual([])
})

test('/verify bundled reference check completes VALID → tampered → VOID → reset', async ({ page }) => {
  await page.goto('/verify')
  const example = page.getByRole('button', { name: 'Synthetic sandbox reference check' })
  await expect(example).toHaveAttribute('aria-pressed', 'false')
  await example.click()
  await expect(example).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Artifact JSON')).toContainText('SYNTHETIC SANDBOX')
  await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect(page.getByRole('status').locator('.vfy-verdict b')).toHaveText(/^VALID$/)
  await expect(page.getByRole('status').locator('.vfy-verdict')).toContainText('code 0')
  await page.getByLabel('Tamper one field (see it void)').check()
  await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'VOID' })).toContainText('code 3')
  await page.getByRole('button', { name: 'Reset selected example' }).click()
  await expect(page.getByLabel('Tamper one field (see it void)')).not.toBeChecked()
  await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect(page.getByRole('status').locator('.vfy-verdict b')).toHaveText(/^VALID$/)
  await expect(page.getByRole('status').locator('.vfy-verdict')).toContainText('code 0')
})

test('/verify clears selected-example state after a manual edit', async ({ page }) => {
  await page.goto('/verify')
  const example = page.getByRole('button', { name: 'Synthetic sandbox reference check' })
  await example.click()
  await expect(example).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Artifact JSON').pressSequentially(' ')
  await expect(example).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: 'Reset selected example' })).toBeDisabled()
})

test('reference-check versus runtime explainer is crawlable and source-linked', async ({ page }) => {
  const response = await page.request.get('/reference-check-vs-runtime')
  expect(response.status()).toBe(200)
  const html = await response.text()
  expect(html).toContain('Implemented today')
  expect(html).toContain('Proposed architecture')
  const jsonLdSource = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]
  expect(jsonLdSource).toBeTruthy()
  const jsonLd = JSON.parse(jsonLdSource!) as Record<string, unknown>
  expect(jsonLd['@type']).toBe('TechArticle')
  expect(jsonLd.headline).toBe('Reference check vs runtime enforcement')
  expect(jsonLd.url).toBe('https://originphysicalai.com/reference-check-vs-runtime')
  expect(jsonLd.description).toBe("A source-backed explanation of Origin's implemented synthetic pre-access reference check and proposed runtime enforcement architecture, trust boundaries, evidence, verdicts, and limitations.")
  expect(Object.keys(jsonLd).sort()).toEqual(['@context', '@type', 'description', 'headline', 'url'])
  await page.goto('/reference-check-vs-runtime')
  await expect(page).toHaveTitle(/Reference check vs runtime enforcement/)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toHaveText('Reference check vs runtime enforcement')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', String(jsonLd.url))
  for (const href of ['/reference-check', '/verify', '/proof', '/trust']) {
    await expect(page.locator(`main a[href="${href}"]`).first()).toBeVisible()
    expect((await page.request.get(href)).status(), href).toBe(200)
  }
  // The comparison section ends with what Origin does today, limits included.
  const alternatives = page.locator('section[aria-labelledby="alternatives"]')
  await expect(page.locator('#alternatives')).toHaveCount(1)
  await expect(alternatives.locator('h2#alternatives')).toBeVisible()
  await expect(alternatives.locator('h2#alternatives')).toHaveCSS('text-wrap-style', 'balance')
  for (const phrase of ['UNTRUSTED', 'your agent is not run', 're-runs the grading', 'nothing stops re-running']) {
    await expect(alternatives, phrase).toContainText(phrase)
  }
  // The jump nav reaches the new section as 04; provenance moves to 05.
  const jumps = page.locator('.editorial-jumps')
  await expect(jumps.locator('a[href="#alternatives"] span')).toHaveText('04')
  await expect(jumps.locator('a[href="#alternatives"]')).toContainText('Beside your tools')
  await expect(jumps.locator('a[href="#provenance"] span')).toHaveText('05')
  await expect(jumps.locator('a[href="#provenance"]')).toContainText('Evidence provenance')
})

test('auth page is owner-only with legal links', async ({ page }) => {
  await page.goto('/auth.html')
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('body')).toContainText(/owner-only/i)
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

test('proving ground keeps a single h1', async ({ page }) => {
  await page.goto('/proving-ground')
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toHaveText('Draw a floor. Test a fleet. Inspect the evidence.')
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

test('reference-check versus runtime explainer is discoverable from home and sitemap', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('link', { name: 'Reference check vs runtime' }),
  ).toHaveAttribute('href', '/reference-check-vs-runtime')

  const sitemap = await page.request.get('/sitemap.xml')
  expect(sitemap.status()).toBe(200)
  expect(await sitemap.text()).toContain(
    'https://originphysicalai.com/reference-check-vs-runtime',
  )
})

test('key routes are served (brief, trust, llms, legal)', async ({ page }) => {
  for (const path of ['/brief.html', '/trust.html', '/llms.txt', '/legal/privacy-policy.html', '/legal/terms-of-service.html']) {
    const res = await page.request.get(path)
    expect(res.status(), path).toBe(200)
  }
})

test('no sitemap URL is noindex', async ({ page }) => {
  const sitemap = await (await page.request.get('/sitemap.xml')).text()
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)
  expect(locs.length).toBeGreaterThan(0)
  for (const path of locs) {
    const res = await page.request.get(path)
    expect(res.status(), path).toBe(200)
    expect(res.headers()['x-robots-tag'] ?? '', path).not.toMatch(/noindex/i)
    expect(await res.text(), path).not.toMatch(/<meta[^>]*name=["']robots["'][^>]*noindex/i)
  }
})

test('/foundry and /passport carry their scope as text without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto(`${baseURL}/foundry`)
    const foundry = (await page.locator('main').innerText()).trim()
    expect(foundry.length).toBeGreaterThanOrEqual(150)
    expect(foundry).toContain('not robot training')
    // getByText skips <noscript>, so read the rendered text instead.
    expect(foundry).toContain('The interactive floor needs JavaScript.')
    await expect(page.locator('.lab-fallback')).toBeVisible()

    await page.goto(`${baseURL}/passport`)
    const passport = await page.locator('main').innerText()
    expect(passport).toContain('Passport is a local demo of scoped, revocable grants')
    expect(passport).toContain('The interactive demo needs JavaScript.')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  } finally {
    await context.close()
  }
})

test('with JavaScript, /foundry and /passport keep the scope line and drop the no-JS notice', async ({ page }) => {
  await blockFoundryNetwork(page)
  await page.goto('/foundry')
  await expect(page.locator('.fdy-hero__sub').first()).toContainText('not robot training')
  await expect(page.locator('.lab-static-intro')).toBeHidden()
  await expect(page.locator('#root')).not.toBeEmpty()
  expect(await page.locator('main').innerText()).not.toContain('needs JavaScript')
  await page.goto('/passport')
  await expect(page.locator('.pp-static-intro')).toBeHidden()
  await expect(page.locator('.pp-hero-pill')).toContainText('Local demo')
  await expect(page.locator('#passport-root')).not.toBeEmpty()
  expect(await page.locator('main').innerText()).not.toContain('needs JavaScript')
})

test('/security names its six experiments without JavaScript; the app replaces the list', async ({ browser, baseURL, page }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const noJs = await context.newPage()
    await noJs.goto(`${baseURL}/security`)
    const list = noJs.locator('#security-root .onpage-static li')
    await expect(list).toHaveCount(6)
    await expect(list.first()).toHaveText('01 · Signature integrity — Flip one byte and it voids.')
    await expect(noJs.locator('#security-root a[href="/over-grant"]')).toHaveCount(1)
  } finally {
    await context.close()
  }
  await page.goto('/security')
  await expect(page.locator('#signatures')).toBeVisible()
  await expect(page.locator('.onpage-static')).toHaveCount(0)
  await expect(page.locator('#fleet-analysis a[href="/over-grant"]')).toHaveText(/Open the full analyzer/)
  // The same panel renders on /over-grant itself, where it must not link to its own page.
  await page.goto('/over-grant')
  await expect(page.locator('#fleet-analysis')).toBeVisible()
  await expect(page.locator('#fleet-analysis a[href="/over-grant"]')).toHaveCount(0)
})

test('tool pages link onward from their static scope notes, outside the app roots', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    for (const route of ['/verify', '/security']) {
      await page.goto(`${baseURL}${route}`)
      await expect(page.locator('.product-hero__scope a[href="/reference-check-vs-runtime"]'), route).toHaveCount(1)
    }
    for (const route of ['/simulation', '/operations', '/proving-ground']) {
      await page.goto(`${baseURL}${route}`)
      const hero = page.locator('main > section').first()
      await expect(hero.locator('a[href="/labs"]'), route).toHaveCount(1)
      await expect(hero.locator('a[href="/verify"]'), route).toHaveCount(1)
    }
    await page.goto(`${baseURL}/over-grant`)
    await expect(page.locator('.product-hero__scope a[href="/reference-check"]')).toHaveCount(1)
    await page.goto(`${baseURL}/trust`)
    await expect(page.locator('#controls a[href="/over-grant"]')).toHaveCount(1)
  } finally {
    await context.close()
  }
})

// ── Wave 1: claims corrections ──────────────────────────────────────────────
// TR-A002 is a machine-emitted trace of a scripted scenario: no agent, gate, proxy,
// approver or sandbox ran. The /security panel grades a preset, not the oracle itself.

test('wave 1: /proof calls TR-A002 scripted and never a sandbox run or a runtime trace', async ({ page }) => {
  await page.goto('/proof.html')
  const body = page.locator('body')
  await expect(body).toContainText('scripted')
  for (const phrase of ['This one is not authored', 'through the runtime', 'fails if a single byte changed', 'sandbox trace', 'sandboxed']) {
    await expect(body, phrase).not.toContainText(phrase, { ignoreCase: true })
  }
})

test('wave 1: home drops the sandbox chip and the independent-check claim', async ({ page }) => {
  await page.goto('/')
  const body = page.locator('body')
  for (const phrase of ['Available · sandbox', 'independently checkable']) {
    await expect(body, phrase).not.toContainText(phrase, { ignoreCase: true })
  }
})

test('wave 1: the IAM over-grant warning names the IAM rule', async ({ page }) => {
  await page.goto('/reference-check')
  await page.getByRole('button', { name: /IAM least-privilege/ }).click()
  await page.getByRole('button', { name: /Permissive \(the dangerous baseline\)/ }).click()
  await page.getByRole('button', { name: 'Run the reference check' }).click()
  const warning = page.locator('.rc-hint--warn').filter({ hasText: 'catastrophic over-grant' })
  await expect(warning).toContainText('your policy allowed an access request the oracle denies or escalates (forbidden resource, tainted principal or high-sensitivity resource)')
  await expect(warning).not.toContainText('personal data')
})

test('wave 1: /security grades the Least-privilege preset, not the oracle, and calls its re-check a self-check', async ({ page }) => {
  await page.goto('/security')
  const panel = page.locator('#config-binding')
  await panel.getByRole('button', { name: 'Issue a reference check' }).click()
  await expect(panel.locator('.sec-rsl')).toHaveText('11 of 12 synthetic decisions match the oracle')
  const log = panel.locator('.sec-log')
  await expect(log).toContainText('The policy under test is the Least-privilege (recommended) preset, not the oracle itself.')
  await expect(log).toContainText("1 stricter than the oracle (Origin's answer key), 0 looser")
  await expect(log).toContainText('re-checked in this tab')
  await expect(log).not.toContainText('independently re-verified')
})

// ── Wave 2: evidence record and verifier ────────────────────────────────────
// A 1.1.0 record states its result and /verify replays it. The /reference-check link
// carries the record in its fragment, and the published TR-A002 trace loads byte for byte.
// The order is structure, digest, signature, freshness, replay: a decision edited without
// re-signing stops at the digest, and only a record re-signed with another key reaches
// the replay.

const logPill = (page: Page, text: string) => page.locator('.vfy-log li').filter({ hasText: text }).locator('.vfy-pill')

// The /verify action-run example, edited, re-digested and signed with a new key by the
// shipped builder and signer: what anyone can do with a record.
async function resignedExample(edit: (record: Record<string, any>) => void) {
  const { makeExample } = await import('../../src/verify/examples.mjs')
  const { generateSigningKey } = await import('@origin/verifier-core/sigil')
  const { actionRunEvidenceDigest, signActionRunEvidence } = await import('@origin/verifier-core/action-run-evidence')
  const record = structuredClone(await makeExample('action-run')) as Record<string, any>
  edit(record)
  record.signature = null
  record.evidence_digest = actionRunEvidenceDigest(record)
  return signActionRunEvidence(record as Parameters<typeof signActionRunEvidence>[0], await generateSigningKey(), {
    keyId: 'another-signer', keyEpoch: 1, issuer: 'another-signer', signedAt: record.issued_at,
  })
}

async function verifyPasted(page: Page, record: unknown) {
  await page.goto('/verify')
  await page.getByLabel('Artifact JSON', { exact: true }).fill(JSON.stringify(record, null, 2))
  await page.getByRole('button', { name: 'Verify', exact: true }).click()
}

test('wave 2: the reference-check link carries its record to /verify in the fragment', async ({ page }) => {
  await page.goto('/reference-check')
  await page.getByRole('button', { name: 'Run the reference check', exact: true }).click()
  const link = page.getByRole('link', { name: /^Re-verify it on \/verify/ })
  await expect(link).toHaveAttribute('href', /^\/verify#a=[A-Za-z0-9_-]{1000,8000}$/)
  await expect(page.locator('.rc-actions + .rc-hint')).toHaveText("The /verify link carries this record. It travels in the link's fragment, which the browser does not send to Origin's server; the analytics tag on /verify is set not to report it.")
  await link.click()
  const box = page.getByLabel('Artifact JSON', { exact: true })
  await expect(box).toHaveValue(/"schema_version": "1\.1\.0"/)
  await expect(page.getByText('Loaded from a shared link. Nothing was uploaded — the artifact travelled in the URL fragment.')).toBeVisible()
  // Read once, then dropped from the address bar.
  expect(new URL(page.url()).hash).toBe('')

  const verify = page.getByRole('button', { name: 'Verify', exact: true })
  const verdict = page.getByRole('status').locator('.vfy-verdict')
  await verify.click()
  await expect(verdict.locator('b')).toHaveText(/^UNTRUSTED$/)
  await expect(verdict.locator('.vfy-verdict__scope')).toHaveText('signed by the key inside the record; VALID needs a published issuer key')
  const stated = page.locator('.vfy-stated--reproduced')
  await expect(stated).toContainText('Stated in this record and reproduced in this tab:')
  await expect(stated).toContainText(/\b\d+ of 12 synthetic decisions match the oracle/)

  // A decision edited without re-signing stops at the digest, and no count is shown.
  await page.getByLabel('Tamper one field (see it void)').check()
  await expect(page.getByText(/^Tampered: changed the stated decision for sup-01 from \w+ to \w+ without re-signing\./)).toBeVisible()
  await verify.click()
  await expect(verdict.locator('b')).toHaveText(/^VOID$/)
  await expect(verdict.locator('.vfy-verdict__scope')).toHaveCount(0)
  await expect(logPill(page, 'the unsigned envelope content-address does not recompute')).toHaveText('void')
  await expect(page.locator('.vfy-stated')).toHaveCount(0)
  await expect(page.locator('.vfy-result')).not.toContainText(/\bof 12\b/)
})

test('wave 2: a decision flipped and re-signed with another key is VOID with the replay mismatch named', async ({ page }) => {
  await verifyPasted(page, await resignedExample((record) => { record.evaluation.decisions[1].decision = 'deny' }))
  await expect(page.getByRole('status').locator('.vfy-verdict b')).toHaveText(/^VOID$/)
  const result = page.locator('.vfy-result')
  await expect(result).toContainText('Action/Run Evidence is void: its stated result does not reproduce under this verifier.')
  await expect(page.locator('.vfy-stated--mismatch')).toHaveText('The stated result does not reproduce: sup-02 states deny, the replay gives allow; the decision rows do not match source.oracle_verdict_digest.')
  // The record is intact and signed; only its stated result is false.
  await expect(logPill(page, 'the unsigned envelope content-address recomputes')).toHaveText('pass')
  await expect(logPill(page, 'the signed Action/Run statement matches this envelope')).toHaveText('pass')
  await expect(logPill(page, 'sup-02 states deny; the replay gives allow')).toHaveText('void')
  await expect(result).not.toContainText(/\bof 12\b/)
})

test('wave 2: a record naming a battery this verifier does not ship is VOID with no counts', async ({ page }) => {
  await verifyPasted(page, await resignedExample((record) => { record.evaluation.battery.version = 'support-gym-v9' }))
  await expect(page.getByRole('status').locator('.vfy-verdict b')).toHaveText(/^VOID$/)
  const result = page.locator('.vfy-result')
  await expect(result).toContainText('Action/Run Evidence is void: this verifier cannot reproduce its stated result.')
  await expect(page.locator('.vfy-stated--unavailable')).toHaveText('This record names support support-gym-v9, which this verifier does not ship; its stated result cannot be reproduced.')
  await expect(logPill(page, 'not replayed: this verifier ships support support-gym-v1, iam iam-gym-v1; the record names support support-gym-v9')).toHaveText('void')
  await expect(result).not.toContainText(/\bof 12\b/)
})

test('wave 2: /verify loads the published TR-A002 trace byte for byte; a tamper voids it with code 2 and unticking restores VALID', async ({ page }) => {
  const published = await (await page.request.get('/proof/tr-a002.json')).text()
  await page.goto('/verify')
  const load = page.getByRole('button', { name: 'Load the published TR-A002 trace', exact: true })
  await expect(load).toHaveAttribute('aria-pressed', 'false')
  await load.click()
  await expect(load).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.vfy-examples button[aria-pressed="true"]')).toHaveCount(0)
  const box = page.getByLabel('Artifact JSON', { exact: true })
  await expect(box).toHaveValue(published)
  await expect(page.locator('.vfy-note').filter({ hasText: 'Loaded /proof/tr-a002.json' })).toHaveText('Loaded /proof/tr-a002.json from this site, byte for byte. TR-A002 is a machine-emitted record of a scripted scenario: no agent, policy gate, proxy, approver or sandbox ran.')

  const verify = page.getByRole('button', { name: 'Verify', exact: true })
  const verdict = page.getByRole('status').locator('.vfy-verdict')
  const log = page.locator('.vfy-log')
  await verify.click()
  await expect(verdict.locator('b')).toHaveText(/^VALID$/)
  await expect(verdict).toContainText('code 0')
  await expect(verdict.locator('.vfy-verdict__scope')).toHaveText('unsigned format: VALID means the hash chain re-derives; anyone can make one')
  await expect(log).toContainText('artifact is TR-A002; this name sits outside the chain')
  await expect(log).toContainText('these top-level fields are outside the chain and are not checked: type, emitted_by, label, scenario, agent, policy, risk_owner, proxy_tool, hash_spec; changing them does not break it')

  const tamper = page.getByLabel('Tamper one field (see it void)')
  await tamper.check()
  await expect(page.locator('.vfy-note').filter({ hasText: 'Tampered:' })).toHaveText("Tampered: changed event 1's refund amount $480 → $481 without re-sealing the chain. Verify to see it void; untick to restore the original.")
  await verify.click()
  await expect(verdict.locator('b')).toHaveText(/^VOID$/)
  await expect(verdict).toContainText('code 2')
  await expect(verdict.locator('.vfy-verdict__scope')).toHaveCount(0)
  await expect(log.locator('.vfy-pill--bad')).toHaveCount(1)
  await expect(logPill(page, 'chain break — event 1 event_hash')).toHaveText('void')

  await tamper.uncheck()
  await expect(page.locator('.vfy-note').filter({ hasText: 'Restored the untampered original.' })).toBeVisible()
  await expect(box).toHaveValue(published)
  await verify.click()
  await expect(verdict.locator('b')).toHaveText(/^VALID$/)
  await expect(verdict).toContainText('code 0')
})

test('wave 2: a failed TR-A002 load verifies nothing', async ({ page }) => {
  await page.route('**/proof/tr-a002.json', (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/verify')
  await page.getByRole('button', { name: 'Load the published TR-A002 trace', exact: true }).click()
  const verdict = page.getByRole('status').locator('.vfy-verdict')
  await expect(verdict.locator('b')).toHaveText('NOT VERIFIABLE')
  await expect(verdict).toContainText('could not load /proof/tr-a002.json (HTTP 404); nothing was verified')
  await expect(page.getByLabel('Artifact JSON', { exact: true })).toHaveValue('')
})

test('wave 2: analytics on a /verify#a= link is configured without the fragment and never sends it', async ({ page }) => {
  // Hits are answered here and never reach the analytics host. Where gtag.js cannot load
  // (a blocked or offline third-party host), the dataLayer check below is the one that runs.
  const hits: string[] = []
  await page.route('**/g/collect**', async (route) => {
    hits.push(`${route.request().url()}\n${route.request().postData() ?? ''}`)
    await route.fulfill({ status: 204, body: '' })
  })
  await page.goto('/reference-check')
  await page.getByRole('button', { name: 'Run the reference check', exact: true }).click()
  const href = await page.getByRole('link', { name: /^Re-verify it on \/verify/ }).getAttribute('href')
  const fragment = href!.replace(/^\/verify#a=/, '')
  expect(fragment.length).toBeGreaterThan(1000)

  // What each request sends: its URL without the fragment, and its body.
  const sent: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    url.hash = ''
    sent.push(`${url.href}\n${request.postData() ?? ''}`)
  })
  await page.goto(href!)
  await expect(page.getByLabel('Artifact JSON', { exact: true })).toHaveValue(/"schema_version": "1\.1\.0"/)
  const pageLocations = await page.evaluate(() => {
    const layer = (window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []
    return Array.from(layer).flatMap((entry) => (entry?.[0] === 'config' ? [(entry[2] as { page_location?: string } | undefined)?.page_location ?? null] : []))
  })
  expect(pageLocations).toEqual([new URL('/verify', page.url()).href])
  // Best effort, not the gate: the page drops the fragment from the address bar before gtag.js
  // runs, so these pass with or without page_location set, and see nothing where gtag.js is
  // blocked. The dataLayer check above is the one that fails if the fragment would be sent.
  await page.waitForTimeout(1500)
  const probe = fragment.slice(0, 64)
  expect(hits.filter((hit) => hit.includes(probe) || hit.includes('#a=') || hit.includes('%23a%3D'))).toEqual([])
  expect(sent.filter((wire) => wire.includes(probe))).toEqual([])
})

test('wave 2: /verify names its formats and verdict codes without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto(`${baseURL}/verify`)
    const summary = page.locator('#verify-root > .onpage-static')
    await expect(summary).toBeVisible()
    await expect(summary.locator('li > b')).toHaveText(['Action/Run Evidence', 'Origin Attestation', 'Crucible credential', 'ScoreReceipt', 'Episode trace', 'Merkle inclusion proof'])
    await expect(summary.locator('li').first()).toContainText('VALID needs a published issuer key; Origin has not published one.')
    await expect(summary).toContainText('The interactive verifier needs JavaScript. Nothing you paste or open is uploaded or stored.')
  } finally {
    await context.close()
  }
})

test('wave 2: with JavaScript, the /verify app replaces the static summary', async ({ page }) => {
  await page.goto('/verify')
  await expect(page.getByRole('button', { name: 'Verify', exact: true })).toBeVisible()
  await expect(page.locator('.onpage-static')).toHaveCount(0)
  await expect(page.locator('.vfy-detection summary')).toHaveText('Which artifacts can I verify? See formats, checks, and verdict codes.')
})

// ── Wave 3: reference-check clarity ─────────────────────────────────────────
// The result names no tier, shows the record's own input_digest, says which way each
// miss goes (stricter or looser than the oracle, Origin's answer key) and counts
// over-grants apart from misses. One click grades the permissive baseline with the
// visitor's typed configuration.

const runReferenceCheck = (page: Page) => page.getByRole('button', { name: 'Run the reference check', exact: true }).click()

test('wave 3: the workflow strip and panels 01 and 02 name the record fields and the shipped versions', async ({ page }) => {
  const { IAM_GYM_VERSION, IAM_VERSIONS } = await import('@origin/verifier-core/iamGym')
  const { SUPPORT_GYM_VERSION, SUPPORT_VERSIONS } = await import('@origin/verifier-core/supportGym')
  await page.goto('/reference-check')
  await expect(page.locator('.workspace-steps li b')).toHaveText(['Declare the inputs', 'Select the policy', 'Inspect the decisions', 'Keep the evidence'])
  const config = page.locator('.rc-config')
  await expect(config.locator('.rc-step')).toHaveText('01 · Declared configuration · bound by digest, not observed')
  await expect(config).toContainText('subject.model_digest (model), subject.tools_digest (tools, in the order typed) and proposal.input_digest')
  await expect(config.locator('.rc-proposed')).toHaveText("Proposed — not built: your team's policy file and repository commit, bound instead of typed labels.")
  const policy = page.locator('.rc-policy')
  await expect(policy.locator('.rc-step')).toHaveText('02 · Selected policy · the rules under test')
  await expect(policy.locator('.rc-proposed')).toHaveText('Proposed — not built: requests and expected answers agreed with your reviewer before a run, plus held-out requests.')
  await expect(policy).toContainText(`12 synthetic support requests written by Origin (${SUPPORT_GYM_VERSION})`)
  await expect(policy).toContainText(`named by subject.verifier_version (${SUPPORT_VERSIONS.verifier_version}); the record lists each answer in evaluation.decisions but does not hash the oracle's code.`)
  await page.getByRole('button', { name: /IAM least-privilege/ }).click()
  await expect(policy).toContainText(`12 synthetic access requests written by Origin (${IAM_GYM_VERSION})`)
  await expect(policy).toContainText(`named by subject.verifier_version (${IAM_VERSIONS.verifier_version})`)
  await expect(page.locator('.rc-grid')).not.toContainText(/co-?sign|countersign/i)
})

test('wave 3: the verdict names no tier label and shows the record\'s own input_digest, for support and IAM', async ({ page }) => {
  await page.goto('/reference-check')
  const verdict = page.locator('.rc-verdict')
  for (const scenario of [/Customer-support agent/, /IAM least-privilege/]) {
    await page.getByRole('button', { name: scenario }).click()
    await runReferenceCheck(page)
    await expect(verdict).toContainText('synthetic decisions match the oracle')
    await expect(verdict).not.toContainText(/tier label/)
    await expect(verdict).not.toContainText(/\bL[0-4]\b/)
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download signed policy-evaluation evidence' }).click()
    const { readFile } = await import('node:fs/promises')
    const record = JSON.parse(await readFile(await (await downloading).path(), 'utf8'))
    await expect(verdict.locator('.rc-verdict__meta')).toContainText(`input_digest ${record.proposal.input_digest.slice(0, 10)}… · synthetic battery only; grants no autonomy or deployment permission`)
  }
})

test('wave 3: the IAM recommended preset misses once, on iam-06, stricter than the oracle', async ({ page }) => {
  await page.goto('/reference-check')
  await page.getByRole('button', { name: /IAM least-privilege/ }).click()
  await expect(page.getByRole('button', { name: /Least-privilege \(recommended\)/ })).toHaveAttribute('aria-pressed', 'true')
  await runReferenceCheck(page)
  await expect(page.locator('.rc-verdict b')).toHaveText('11 of 12')
  const misses = page.locator('.rc-table tbody tr').filter({ hasText: '△ miss' })
  await expect(misses).toHaveCount(1)
  // iam-06: a finance principal reads the high-sensitivity ledger; the oracle allows it.
  await expect(misses.locator('td')).toHaveText(['ledger', 'high', 'escalate', 'allow', '△ miss (stricter)'])
  const card = page.locator('.rc-output')
  await expect(card).toContainText('Misses: 1 stricter than the oracle, 0 looser. Over-grants, counted separately: 0.')
  await expect(card).toContainText('Every miss here is stricter than the oracle: the policy escalated a request the oracle allows, or refused one the oracle allows or escalates. None is looser.')
})

test('wave 3: the permissive baseline button grades the Permissive spec, keeps the typed configuration and focuses the result, for support and IAM', async ({ page }) => {
  const { canonical, sha256 } = await import('@origin/evidence/env-evidence')
  const { readFile } = await import('node:fs/promises')
  // Counts and looser rows for the Permissive spec, computed with @origin/verifier-core.
  const cases = [
    {
      scenario: /Customer-support agent/, before: '12 of 12',
      summary: { matched: 4, total: 12, misses: 2, over_grants: 6 },
      looser: ['Refund $450 (over the refund cap)', 'Apply a $200 goodwill credit (over the cap)'],
      permissive: { refundCap: 100000, denyPii: false, denyForbidden: false, denyTainted: false, requireApprovalHigh: false },
    },
    {
      scenario: /IAM least-privilege/, before: '11 of 12',
      summary: { matched: 3, total: 12, misses: 2, over_grants: 7 },
      looser: ['refund', 'billing'],
      permissive: { honorRoleAllowlist: false, denyForbidden: false, denyTainted: false, escalateOnApproval: false, autoAllowUpTo: 'forbidden' },
    },
  ]
  await page.goto('/reference-check')
  const card = page.locator('.rc-output')
  const model = page.getByLabel('Model', { exact: true })
  const baseline = page.getByRole('button', { name: 'Try the permissive baseline', exact: true })
  const feedback = card.locator('.check-feedback')
  for (const c of cases) {
    await page.getByRole('button', { name: c.scenario }).click()
    await model.fill('wave-three-typed-model')
    await runReferenceCheck(page)
    await expect(page.locator('.rc-verdict b')).toHaveText(c.before)
    await expect(card.getByText(/^Misses:/)).toHaveCount(c.before === '12 of 12' ? 0 : 1)
    await expect(feedback).not.toBeFocused()
    await expect(baseline).toHaveClass(/\bbtn--ghost\b/)
    await expect(baseline).not.toHaveClass(/\bbtn--primary\b/)
    await expect(page.locator('.rc-baseline .rc-hint')).toHaveText('Runs the same 12 requests with every safeguard off, so you can compare its over-grants with this result.')

    await baseline.press('Enter')
    const { matched, total, misses, over_grants } = c.summary
    await expect(page.locator('.rc-verdict b')).toHaveText(`${matched} of ${total}`)
    // The button leaves with the old result, so focus moves to the new verdict, which is in view.
    await expect(feedback).toBeFocused()
    await expect(page.locator('.rc-verdict')).toBeInViewport({ ratio: 1 })
    const rows = page.locator('.rc-table tbody tr')
    await expect(rows.filter({ hasText: '⛔ over-grant' })).toHaveCount(over_grants)
    const looser = rows.filter({ hasText: '△ miss' })
    await expect(looser.locator('td:first-child')).toHaveText(c.looser)
    await expect(looser.locator('td:last-child')).toHaveText(c.looser.map(() => '△ miss (looser)'))
    await expect(card).toContainText(`Misses: 0 stricter than the oracle, ${misses} looser. Over-grants, counted separately: ${over_grants}.`)
    await expect(card).not.toContainText('Every miss here is stricter')
    const warning = card.locator('.rc-hint--warn')
    await expect(warning).toContainText('Matches on other requests do not offset an over-grant.')
    await expect(warning).not.toContainText('caps the level')
    await expect(page.getByRole('button', { name: /Permissive \(the dangerous baseline\)/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(baseline).toHaveCount(0)
    await expect(model).toHaveValue('wave-three-typed-model')
    // The new record binds the typed model, states the Permissive parameters and the page's counts.
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download signed policy-evaluation evidence' }).click()
    const record = JSON.parse(await readFile(await (await downloading).path(), 'utf8'))
    expect(record.subject.model_digest).toBe(sha256(canonical({ model: 'wave-three-typed-model' })))
    expect(record.evaluation.policy_parameters).toEqual(c.permissive)
    expect(record.evaluation.summary).toEqual(c.summary)
  }
})

test('wave 3: the permissive baseline is offered for a named preset, not for a custom policy', async ({ page }) => {
  await page.goto('/reference-check')
  const baseline = page.getByRole('button', { name: 'Try the permissive baseline', exact: true })
  await page.getByLabel('Refuse destructive / bulk actions').uncheck()
  await runReferenceCheck(page)
  await expect(page.locator('.rc-verdict b')).toHaveText('11 of 12')
  await expect(baseline).toHaveCount(0)
  await page.getByRole('button', { name: /^Moderate/ }).click()
  await runReferenceCheck(page)
  await expect(baseline).toBeVisible()
  // At 600 px and below it is full width, like the step-04 buttons.
  if (page.viewportSize()!.width <= 600) {
    const download = await page.getByRole('button', { name: 'Download signed policy-evaluation evidence' }).boundingBox()
    expect((await baseline.boundingBox())!.width).toBe(download!.width)
  }
})

test('wave 3: the results table carries its legend and the authorization note', async ({ page }) => {
  await page.goto('/reference-check')
  await runReferenceCheck(page)
  const legend = page.locator('.rc-output .rc-scroll + .rc-legend')
  await expect(legend).toBeVisible()
  await expect(legend.locator('p').first()).toContainText("Reading the table. Oracle: Origin's fixed answer key for these 12 requests.")
  await expect(legend.locator('p').first()).toContainText('over-grants are counted separately from misses.')
  await expect(legend.locator('p').nth(1)).toHaveText("In the downloaded record, authorization.verdict: deny means the record grants no execution authority. It is not the policy's result.")
})

test('wave 3: step 04 scopes VOID to an edit made without re-signing and names the demo battery', async ({ page }) => {
  await page.goto('/reference-check')
  await runReferenceCheck(page)
  const card = page.locator('.rc-output')
  await expect(card.locator('.rc-step + .rc-hint')).toHaveText('Download the signed record and re-verify it: an edit made without re-signing shows as VOID. Then change a tool to see the legacy configuration-bound credential void (code 4).')
  await expect(card).toContainText('Open it in /verify with the link above, or paste the downloaded file: it renders UNTRUSTED because this key was made in your browser and is not issuer-pinned')
  await expect(card).toContainText('Synthetic demo battery; real design-partner evidence stays blocked until authorized.')
  for (const phrase of ['detect a change', 'pilot battery']) await expect(card, phrase).not.toContainText(phrase)
})

test('wave 3: /reference-check states what it evaluates without JavaScript', async ({ browser, baseURL }) => {
  const { iamTasks } = await import('@origin/verifier-core/iamGym')
  const { supportTasks } = await import('@origin/verifier-core/supportGym')
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto(`${baseURL}/reference-check`)
    const summary = page.locator('#refcheck-root > .onpage-static')
    await expect(summary).toBeVisible()
    await expect(summary.locator('p > b')).toHaveText(['What it evaluates.', 'How results read.', 'Evidence and limits.'])
    expect(iamTasks.length).toBe(supportTasks.length)
    await expect(summary).toContainText(`Each scenario has ${supportTasks.length} fixed requests; Origin wrote them and the answer key (the oracle).`)
    await expect(summary).toContainText('The oracle marks each request allow, escalate or deny.')
    await expect(summary).toContainText('An over-grant is an allow on a security-critical request that the oracle denies or escalates; over-grants are counted separately from misses.')
    await expect(summary).toContainText('so /verify rates it UNTRUSTED: anyone can make one.')
    await expect(summary).toContainText('The interactive check needs JavaScript.')
    await expect(summary).not.toContainText(/Origin-issued|Tampering any field/)
  } finally {
    await context.close()
  }
})

test('wave 3: with JavaScript, the /reference-check app replaces the static summary', async ({ page }) => {
  const served = await (await page.request.get('/reference-check')).text()
  expect(served).toContain('<div class="onpage-static"><p><b>What it evaluates.</b>')
  await page.goto('/reference-check')
  await expect(page.getByRole('button', { name: 'Run the reference check', exact: true })).toBeVisible()
  await expect(page.locator('.onpage-static')).toHaveCount(0)
  await expect(page.locator('#refcheck-root .skel')).toHaveCount(0)
})

test('wave 3: the /security log names no readiness tier', async ({ page }) => {
  await page.goto('/security')
  const panel = page.locator('#config-binding')
  await panel.getByRole('button', { name: 'Issue a reference check' }).click()
  const log = panel.locator('.sec-log')
  const downloading = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Download the credential' }).click()
  const { readFile } = await import('node:fs/promises')
  const credential = JSON.parse(await readFile(await (await downloading).path(), 'utf8'))
  await expect(log).toContainText(`reference check issued — 11 of 12 synthetic decisions match the oracle · 0 over-grants · bound to config ${credential.config_digest.slice(0, 12)}… — VOID if the model, tools, context, harness or environment change`)
  await panel.getByRole('button', { name: 'Run the allow-all baseline' }).click()
  await panel.getByRole('button', { name: 'Drift the config' }).click()
  await expect(log).toContainText('credential VOID')
  await expect(log).not.toContainText('Readiness: L')
  await expect(log).not.toContainText(/\bL[0-4]\b/)
})

test('wave 3: the shot04 recording keeps its figure and gets a dated line outside it', async ({ page }) => {
  const { readFileSync } = await import('node:fs')
  const manifest = JSON.parse(readFileSync(new URL('../../scripts/recordings/shot04.json', import.meta.url), 'utf8'))
  await page.goto('/reference-check')
  const figure = page.locator('video[poster*="shot04-"]').locator('xpath=ancestor::figure')
  const line = page.locator('.vband > .shell > figure.vband__fig + p.vband__cap')
  await expect(line).toHaveText(`Recorded ${manifest.date}; the page has changed since.`)
  await expect(figure).not.toContainText('the page has changed since')
  expect(await line.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14)
})

test('wave 3: home demo panel 3 counts over-grants on their own and names no tier', async ({ page }) => {
  await page.goto('/')
  await page.locator('#demo-tab-3').click()
  const panel = page.locator('#demo-panel-3')
  await expect(panel).toContainText('Over-grants are counted on their own; matches elsewhere do not offset them.')
  await expect(panel.locator('.demo__readout')).toHaveText('oracle · FAR · FRR · over-grants EVALUATION RESULT')
  await expect(panel).not.toContainText(/\bL0\b|catastrophic cap/)
})

// ── Wave 4a: home, explainer, navigation and /trust ─────────────────────────
// The sub-heading says what the record holds (the eyebrow and headline are pinned at the
// top of this file and in investor-ready.spec.ts). #problem compares by category only and
// keeps the UNTRUSTED limit, and the primary button stays above the fold at 375x812.

test('wave 4a: home sub-heading, #problem comparison and the fold at 375x812', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.hero__lede')).toHaveText("See which of 12 fixed synthetic requests a selected agent policy allows, denies or escalates, graded by deterministic code against Origin's answer key, not a model. The record, signed by a key your browser makes for that run, states the result, and your reviewer can re-run the grading in their own browser.")
  await expect(page.locator('.cin-intro__links').getByRole('link', { name: 'What works today vs. proposed' })).toHaveAttribute('href', '/reference-check-vs-runtime')
  const problem = page.locator('#problem')
  await expect(problem.locator('.cin-small')).toBeVisible()
  await expect(problem.locator('.cin-small')).toHaveText("Origin does not replace your CI tests, evaluation platform or runtime policy engine. The reference check adds one thing beside them: a deterministic record of what a selected policy allows on fixed synthetic requests. Your reviewer can re-check it in their own browser, where an edit made without re-signing shows as VOID; a key the browser makes for that run signs it, so it rates UNTRUSTED.")
  await expect(problem.getByRole('link', { name: 'Where Origin fits beside them' })).toHaveAttribute('href', '/reference-check-vs-runtime')
  await expect(problem.locator('.btn')).toHaveCount(0)
  // The longer eyebrow and sub-heading must not push the primary action below a 375x812 fold.
  await page.setViewportSize({ width: 375, height: 812 })
  const primaryBottom = await page.locator('.hero__actions .btn--primary').evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY)
  expect(primaryBottom).toBeLessThanOrEqual(812)
})

// ── Wave 4b: offer terms, contact lines and copy control ──
// The /reference-check Book card states the offer and a mailto line (no copy control, so the
// verdict stays the page's only status) and books from the home #offer section. The home
// lead dialog links the privacy policy and makes no storage claim.

test('wave 4b: the /reference-check Book card states the offer, a mailto line and books from /#offer', async ({ page }) => {
  await page.goto('/reference-check')
  await runReferenceCheck(page)
  await expect(page.getByRole('status')).toContainText('synthetic decisions match the oracle')
  const card = page.locator('.rc-card--cta')
  await expect(card.locator('.rc-step')).toHaveText('Need more than this browser demo?')
  const lines = card.locator('.rc-hint')
  await expect(lines).toHaveCount(3)
  await expect(lines.nth(1)).toHaveText("An Agent Evidence Review starts from one action your agent would take, as you describe it. Send nothing confidential: no data agreement is in place yet. You receive a short written report naming the cases your reviewer would need to see and the evidence still missing. No record of your agent's decisions can be produced today; any record attached is a browser reference check of a selected example policy and rates UNTRUSTED. 45-minute review session · no charge.")
  await expect(lines.nth(2)).toHaveText('Or email bohueilin@originphysicalai.com. We reply within 2 working days.')
  await expect(lines.nth(2).getByRole('link', { name: 'bohueilin@originphysicalai.com' })).toHaveAttribute('href', 'mailto:bohueilin@originphysicalai.com?subject=Agent%20Evidence%20Review')
  await expect(card.locator('button, [data-copy]')).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveCount(1)
  const book = card.getByRole('link', { name: 'Book an Agent Evidence Review', exact: true })
  await expect(book).toHaveAttribute('href', '/#offer')
  await book.click()
  await expect(page).toHaveURL(/\/#offer$/)
  await expect(page.locator('#offer')).toHaveCount(1)
})

test('wave 4b: the home lead dialog links the privacy policy and makes no storage claim', async ({ page }) => {
  await page.goto('/')
  await page.locator('#offer').getByRole('button', { name: 'Book an Agent Evidence Review' }).click()
  const dialog = page.locator('#lead-modal')
  await expect(page.locator('#lead-name')).toBeFocused()
  const note = dialog.locator('.modal__note')
  await expect(note).toHaveText('Sent over TLS to Origin; see the privacy policy. No spam.')
  await expect(dialog).not.toContainText('stored with our database provider')
  const privacy = note.getByRole('link', { name: 'privacy policy' })
  await expect(privacy).toHaveAttribute('href', '/legal/privacy-policy.html')
  expect((await page.request.get('/legal/privacy-policy.html')).status()).toBe(200)
  // The link is the dialog's last control: Tab wraps from it to the first one.
  await privacy.focus()
  await page.keyboard.press('Tab')
  await expect(dialog.locator('.modal__close')).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(privacy).toBeFocused()
})

// ── Wave 5: Labs ──
// /simulation and /operations count collision events from the frames. The default
// /simulation run counts one (a robot and the human marker swap cells) and reads ESCALATE;
// the default /operations shift counts none and keeps its tier. The proving ground shows no
// tier and signs a synthetic floor evaluation. Each Labs page names itself an Origin Labs
// experiment and carries a static "How to read the result" section outside its app root.

test('wave 5: the default /simulation run counts one collision event and reads ESCALATE', async ({ page }) => {
  await page.goto('/simulation')
  const verdict = page.locator('#sim-verdict')
  await expect(verdict.locator('b')).toHaveText('ESCALATE')
  await expect(verdict.locator('span')).toHaveText('1 collision event counted between robots or with the human marker. A human coordinator is required.')
  const tile = page.locator('.sim-scores div').filter({ hasText: 'collision events (counted)' })
  await expect(tile).toHaveCount(1)
  await expect(tile.locator('b')).toHaveText('1')
  await expect(page.locator('main')).not.toContainText(/collision-free|collisions \(invariant\)/i)
  for (const meta of ['meta[name="description"]', 'meta[name="twitter:description"]', 'meta[property="og:description"]']) {
    await expect(page.locator(meta), meta).toHaveAttribute('content', /collision events are counted/i)
    await expect(page.locator(meta), meta).not.toHaveAttribute('content', /collision-free/i)
  }
})

test('wave 5: the default /operations shift counts no collision event and keeps its tier', async ({ page }) => {
  await page.goto('/operations')
  const verdict = page.locator('.ops-verdict')
  await expect(verdict).toContainText(/Tier L[34] on this seeded simulated shift only/)
  await expect(verdict).toContainText('· 0 collision events.')
  await expect(page.locator('.ops-tiles div').filter({ hasText: 'collision events' }).locator('b')).toHaveText('0')
  const waves = page.locator('.ops-wave')
  await expect(waves).toHaveCount(6)
  for (let i = 0; i < 6; i += 1) {
    await waves.nth(i).click()
    await expect(page.locator('#ops-caption')).toHaveText(new RegExp(`^Wave ${i + 1} · \\w+ · \\d+% utilization · 0 collision events$`))
  }
})

test('wave 5: an /operations shift with one counted collision event fails its targets at tier L0', async ({ page }) => {
  await page.goto('/operations')
  // Seed 777 with 5 robots and 3 waves counts exactly one event, in wave 2.
  await page.locator('.ops-range', { hasText: 'Fleet' }).locator('input').fill('5')
  await page.locator('.ops-range', { hasText: 'Waves' }).locator('input').fill('3')
  const verdict = page.locator('.ops-verdict')
  await expect(verdict).toContainText('Synthetic shift targets not met')
  await expect(verdict).toContainText('Tier L0 on this seeded simulated shift only')
  await expect(verdict).toContainText('· 1 collision event.')
  await page.locator('.ops-wave').nth(1).click()
  await expect(page.locator('#ops-caption')).toHaveText(/^Wave 2 · escalate · \d+% utilization · 1 collision event$/)
  // The red L0 verdict and collision tile appear only in this state, so axe checks it here too.
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
})

test('wave 5: /proving-ground shows no tier and signs a synthetic floor evaluation', async ({ page }) => {
  await page.goto('/proving-ground')
  const verdict = page.locator('.pg-verdict')
  await expect(verdict.locator('.pg-verdict__perm')).toHaveText('This result grants no deployment permission.')
  await expect(verdict).toContainText('no deployment permission')
  await expect(verdict).not.toContainText(/Synthetic tier/i)
  await expect(verdict).not.toContainText(/\bL[0-4]\b/)
  await page.getByRole('button', { name: 'Sign synthetic floor evidence', exact: true }).click()
  const signedState = page.locator('.pg-thumb')
  await expect(signedState).toHaveText(/^signed · synthetic floor evidence · key [0-9a-f]{10}…$/)
  await expect(signedState).not.toContainText(/Synthetic tier|\bL[0-4]\b/i)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download signed floor evidence', exact: true }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('synthetic-floor-evaluation.sigil.json')
  const { readFile } = await import('node:fs/promises')
  const record = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(record.kind).toBe('synthetic-floor-evaluation')
  expect(record.payload).toMatchObject({ kind: 'synthetic-floor-evaluation', evidence_lane: 'synthetic-demo', execution_mode: 'simulated' })
  expect(record.payload).not.toHaveProperty('vrl_level')
  expect(record.payload.episodes.length).toBeGreaterThan(0)
  for (const episode of record.payload.episodes) expect(episode).not.toHaveProperty('autonomy_earned')
  expect(record.payload.site.wall_cells).toHaveLength(record.payload.site.walls)
  expect(JSON.stringify(record)).not.toMatch(/autonomy_earned|vrl_level|fleet-readiness/)
})

test('wave 5: without JavaScript, each Labs page explains how to read its result outside the app root', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    for (const [route, id, root, labels] of [
      ['/proving-ground', 'pg-read-title', '#pg-root', ['What is scored.', 'Verdicts.', 'Robot types.', 'Limits.']],
      ['/simulation', 'sim-read-title', '#sim-root', ['What runs.', 'Verdicts.', 'Collision events.', 'Limits.']],
      ['/operations', 'ops-read-title', '#ops-root', ['What runs.', 'Targets', 'Tier.', 'Metrics.', 'Limits.']],
    ] as const) {
      await page.goto(`${baseURL}${route}`)
      const section = page.locator(`main > section[aria-labelledby="${id}"]`)
      await expect(section, route).toBeVisible()
      await expect(section.locator(`h2#${id}`), route).toHaveText('How to read the result')
      await expect(section.locator('p > b'), route).toHaveText([...labels])
      // After the console, and not inside the app root that JavaScript fills.
      await expect(page.locator('main > section').last(), route).toHaveAttribute('aria-labelledby', id)
      await expect(page.locator(`${root} #${id}`), route).toHaveCount(0)
      // The hero scope note names the product and links it once.
      await expect(page.locator('main > section').first().locator('a[href="/reference-check"]'), route).toHaveCount(1)
    }
  } finally {
    await context.close()
  }
})
