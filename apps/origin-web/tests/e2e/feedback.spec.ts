import { test, expect, type Locator } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/api/')
      ? route.continue() : route.abort('blockedbyclient')
  })
})

async function expectUnobscured(verdict: Locator) {
  await expect.poll(() => verdict.evaluate(el => {
    const rect = el.getBoundingClientRect()
    const header = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0
    return rect.top >= header && rect.bottom <= innerHeight
  })).toBe(true)
  expect(await verdict.evaluate(el => {
    const names: string[] = []
    for (let node: Element | null = el; node; node = node.parentElement) {
      if (getComputedStyle(node).animationName !== 'none') names.push(getComputedStyle(node).animationName)
    }
    return names
  })).toEqual([])
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`verification keeps a tamper verdict visible and refreshes its stamp at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.clock.install()
    await page.goto('/verify')
    await page.getByRole('button', { name: 'Origin Attestation', exact: true }).click()
    await page.getByRole('checkbox', { name: /Tamper one field/ }).check()
    await page.getByRole('button', { name: 'Verify', exact: true }).evaluate(el => { window.scrollTo({ top: scrollY + el.getBoundingClientRect().bottom - innerHeight + 4, behavior: 'instant' }) })
    await page.getByRole('button', { name: 'Verify', exact: true }).click()
    const verdict = page.locator('.vfy-verdict')
    await expect(verdict).toContainText('VOID')
    await expectUnobscured(verdict)
    const stamp = page.locator('.vfy-checked')
    await expect(stamp).toContainText(/^Checked \d{2}:\d{2}:\d{2} · \d+ ms$/)
    await expect(stamp).toBeInViewport()
    expect(await stamp.evaluate(el => el.closest('[aria-live], [role="status"]'))).toBeNull()
    const before = await stamp.textContent()
    await page.clock.runFor(1100)
    await page.getByRole('button', { name: 'Verify', exact: true }).click()
    await expect(stamp).not.toHaveText(before!)
    await expectUnobscured(verdict)
  })
}

test('a mobile reference check brings its verdict into view', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/reference-check')
  await page.getByRole('button', { name: 'Run the reference check', exact: true }).click()
  await expect(page.locator('.rc-verdict')).toContainText('synthetic decisions match the oracle')
  await expectUnobscured(page.locator('.rc-verdict'))
})

test('widening a diagram leaf draws its actual parent chain and root ring', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/over-grant')
  const tree = page.locator('#delegation svg:visible')
  await page.getByRole('button', { name: 'Widen payroll-bot', exact: true }).click()
  const path = tree.locator('path[stroke-dasharray="4 3"]')
  await expect(path).toHaveAttribute('d', page.viewportSize()!.width < 700
    ? 'M 68 150 H 56 V 108 M 38 90 H 26 V 48'
    : 'M 96 236 L 168 168 M 168 132 L 300 64')
  await expect(tree.locator('circle[r="24"]')).toHaveCount(1)
  await expect(path).toHaveCSS('opacity', '1')
  const fade = await path.evaluate(el => el.getAnimations().map(a => ({ duration: a.effect?.getTiming().duration, frames: (a.effect as KeyframeEffect).getKeyframes() })))
  expect(fade).toHaveLength(1)
  expect(fade[0].duration).toBe(200)
  expect(fade[0].frames.map(f => f.opacity)).toEqual(['0', '1'])
  expect(fade[0].frames.some(f => f.transform !== undefined)).toBe(false)
  await page.getByRole('button', { name: 'Narrow payroll-bot', exact: true }).click()
  await expect(path).toHaveCount(0)
  await expect(tree.locator('circle[r="24"]')).toHaveCount(0)
})

test('lead modal has a finite entrance and closes instantly in both motion modes', async ({ page }) => {
  await page.goto('/')
  for (const reduced of [false, true]) {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
    const frames = await page.locator('#lead-modal').evaluate((el, reduce) => {
      const dialog = el as HTMLDialogElement
      dialog.showModal()
      const animations = dialog.getAnimations().filter(a => (a.effect as KeyframeEffect).target === dialog)
      const entrance = animations.find(a => (a.effect as KeyframeEffect).pseudoElement === null)
      return { count: entrance ? 1 : 0, duration: entrance?.effect?.getTiming().duration, transforms: (entrance?.effect as KeyframeEffect | null)?.getKeyframes().some(frame => frame.transform !== undefined), reduced: reduce }
    }, reduced)
    expect(frames.count).toBe(1)
    expect(frames.duration).toBe(reduced ? 120 : 180)
    expect(frames.transforms).toBe(!reduced)
    const afterClose = await page.locator('#lead-modal').evaluate(el => {
      (el as HTMLDialogElement).close()
      return el.getAnimations().length
    })
    expect(afterClose).toBe(0)
  }
})


test('parse and example-generation errors clear the previous check stamp', async ({ page }) => {
  await page.goto('/verify')
  await page.getByRole('button', { name: 'Origin Attestation', exact: true }).click()
  await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect(page.locator('.vfy-checked')).toBeVisible()
  await page.evaluate(() => { SubtleCrypto.prototype.generateKey = async () => { throw new Error('Example generation failed') } })
  await page.getByRole('button', { name: 'Origin Attestation', exact: true }).click()
  await expect(page.locator('.vfy-checked')).toHaveCount(0)
  await expect(page.locator('.vfy-verdict')).toHaveCount(1)
  await expect(page.locator('.vfy-verdict')).toContainText('NOT VERIFIABLE')
  await page.getByLabel('Artifact JSON', { exact: true }).fill('{broken')
  await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect(page.locator('.vfy-verdict')).toContainText('NOT VERIFIABLE')
  await expect(page.locator('.vfy-checked')).toHaveCount(0)
})

for (const method of ['generateKey', 'sign'] as const) {
  test(`a failed reference-check rerun clears its previous result (${method})`, async ({ page }) => {
    await page.goto('/reference-check')
    const run = page.getByRole('button', { name: 'Run the reference check', exact: true })
    await run.click()
    await expect(page.locator('.rc-verdict')).toBeVisible()
    await expect(page.locator('.rc-checked')).toBeVisible()
    await page.evaluate(method => {
      Object.defineProperty(SubtleCrypto.prototype, method, { configurable: true, value: async () => { throw new Error('Session signing unavailable') } })
    }, method)
    await run.click()
    await expect(page.locator('.rc-error')).toContainText('Session signing unavailable')
    await expect(page.locator('.rc-checked')).toHaveCount(0)
    await expect(page.locator('.rc-verdict')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Download signed/ })).toHaveCount(0)
  })
}

// ── Wave 2: evidence record and verifier ────────────────────────────────────
// /verify opens a .json file from its button or a drop, reads it in the tab and uploads
// nothing. The beforeEach above already fails every request off this host and to /api/.

// Every request the page makes, as sent: its path, and its URL without the fragment plus its body.
function recordRequests(page: import('@playwright/test').Page) {
  const sent: Array<{ path: string; wire: string }> = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    url.hash = ''
    sent.push({ path: url.pathname, wire: `${url.href}\n${request.postData() ?? ''}` })
  })
  return sent
}

test('wave 2: /verify opens a downloaded reference-check record from a file, shows its stated result first and sends nothing', async ({ page }) => {
  await page.goto('/reference-check')
  await page.getByRole('button', { name: 'Run the reference check', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download signed policy-evaluation evidence' }).click()
  const download = await downloading
  const { readFile } = await import('node:fs/promises')
  const bytes = await readFile((await download.path())!)
  const record = JSON.parse(bytes.toString('utf8'))
  expect(record.schema_version).toBe('1.1.0')

  const sent = recordRequests(page)
  await page.goto('/verify')
  const name = download.suggestedFilename()
  await page.getByLabel('Open a .json file').setInputFiles({ name, mimeType: 'application/json', buffer: bytes })
  await expect(page.locator('.vfy-note').filter({ hasText: 'Opened' })).toHaveText(`Opened ${name} (${bytes.length.toLocaleString('en-US')} bytes) in this tab; nothing was uploaded.`)
  await expect(page.getByLabel('Artifact JSON', { exact: true })).toHaveValue(bytes.toString('utf8'))
  await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect(page.getByRole('status').locator('.vfy-verdict b')).toHaveText(/^UNTRUSTED$/)
  const stated = page.locator('.vfy-stated--reproduced')
  await expect(stated).toContainText('Stated in this record and reproduced in this tab:')
  await expect(stated).toContainText(/\b\d+ of 12 synthetic decisions match the oracle/)
  // The stated result comes first, above the headline and the integrity lines.
  const tops = await page.locator('.vfy-result').evaluate((result) =>
    ['.vfy-stated', '.section__lede', '.vfy-log'].map((selector) => result.querySelector(selector)!.getBoundingClientRect().top))
  expect(tops[0]).toBeLessThan(tops[1])
  expect(tops[1]).toBeLessThan(tops[2])

  expect(sent.filter((request) => request.path.startsWith('/api/'))).toEqual([])
  for (const value of [record.evidence_id, record.evidence_digest]) expect(sent.filter((request) => request.wire.includes(value))).toEqual([])
})

test('wave 2: /verify refuses a file that is not JSON or is over 256 KB, and verifies nothing', async ({ page }) => {
  const sent = recordRequests(page)
  await page.goto('/verify')
  const open = page.getByLabel('Open a .json file')
  const verdict = page.getByRole('status').locator('.vfy-verdict')
  await open.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('wave-two-file-probe') })
  await expect(verdict.locator('b')).toHaveText('NOT VERIFIABLE')
  await expect(verdict).toContainText('notes.txt is not a .json file; open or paste JSON')
  await open.setInputFiles({ name: 'large.json', mimeType: 'application/json', buffer: Buffer.alloc(256 * 1024 + 1, ' ') })
  await expect(verdict.locator('b')).toHaveText('NOT VERIFIABLE')
  await expect(verdict).toContainText('large.json is 257 KB; the limit is 256 KB')
  await expect(page.getByLabel('Artifact JSON', { exact: true })).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Verify', exact: true })).toBeDisabled()
  expect(sent.filter((request) => request.path.startsWith('/api/'))).toEqual([])
  expect(sent.filter((request) => request.wire.includes('wave-two-file-probe'))).toEqual([])
})

test('wave 2: /verify reads a .json file dropped on the editor', async ({ page }) => {
  const published = await (await page.request.get('/proof/tr-a002.json')).text()
  const sent = recordRequests(page)
  await page.goto('/verify')
  const dataTransfer = await page.evaluateHandle((text) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([text], 'tr-a002.json', { type: 'application/json' }))
    return transfer
  }, published)
  const editor = page.locator('.vfy-editor')
  await editor.dispatchEvent('dragover', { dataTransfer })
  await expect(editor).toHaveClass(/\bis-dropping\b/)
  await editor.dispatchEvent('drop', { dataTransfer })
  await expect(editor).not.toHaveClass(/\bis-dropping\b/)
  await expect(page.getByLabel('Artifact JSON', { exact: true })).toHaveValue(published)
  await expect(page.locator('.vfy-note').filter({ hasText: 'Opened' })).toHaveText(`Opened tr-a002.json (${Buffer.byteLength(published).toLocaleString('en-US')} bytes) in this tab; nothing was uploaded.`)
  await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect(page.getByRole('status').locator('.vfy-verdict b')).toHaveText(/^VALID$/)
  const finalDigest = JSON.parse(published).final_digest as string
  expect(sent.filter((request) => request.path.startsWith('/api/'))).toEqual([])
  expect(sent.filter((request) => request.wire.includes(finalDigest))).toEqual([])
})
