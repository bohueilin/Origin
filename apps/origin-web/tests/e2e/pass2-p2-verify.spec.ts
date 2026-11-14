import { test, expect, type Locator, type Page } from '@playwright/test'

// Pass 2 Phase 2 — verify scorecard and code scheme
// A reproduced 1.1.0 result reads as a scorecard: the counts, the record's stated result beside
// the re-run in this tab, and the rating with its reason. Every numeric code on /verify sits
// beside its format's name, and a static "How to read the verdict" guide gives each format's
// VALID, VOID and codes in plain words. The figures are static and legible at 375 px.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

const verify = (page: Page) => page.getByRole('button', { name: 'Verify', exact: true }).click()
const verdict = (page: Page) => page.getByRole('status').locator('.vfy-verdict')
// The verdict line's format name and code, without the verdict word or the scope note.
const named = (page: Page) => verdict(page).locator(':scope > span:not(.vfy-verdict__scope)')

async function loadExample(page: Page, name: string, marker: string) {
  await page.getByRole('button', { name, exact: true }).click()
  await expect(page.getByLabel('Artifact JSON', { exact: true })).toHaveValue(new RegExp(marker))
}

// The synthetic 1.1.0 example (support battery, Permissive preset), verified inside its window.
async function verifyPolicyExample(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-20T00:00:00.000Z'))
  await page.goto('/verify')
  await loadExample(page, 'Signed browser policy evaluation (untrusted)', '"schema_version": "1\\.1\\.0"')
  await verify(page)
  await expect(verdict(page).locator('b')).toHaveText(/^UNTRUSTED$/)
}

// Every rendered text node under the root, with its computed font size in px.
const textSizes = (root: Locator) => root.evaluate((el) => {
  const sizes: Array<{ text: string; px: number }> = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim()
    if (text) sizes.push({ text: text.slice(0, 40), px: parseFloat(getComputedStyle(node.parentElement!).fontSize) })
  }
  return sizes
})

// Static: no running animation, no CSS animation name and no SMIL element inside the figure.
const motion = (root: Locator) => root.evaluate((el) => ({
  animations: el.getAnimations({ subtree: true }).length,
  named: [el, ...el.querySelectorAll('*')].filter((node) => getComputedStyle(node).animationName !== 'none').length,
  smil: el.querySelectorAll('animate, animateMotion, animateTransform, set').length,
}))

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)

test('pass 2 phase 2: the verdict guide names each format with its VALID, VOID and codes in plain words', async ({ page }) => {
  await page.goto('/verify')
  const guide = page.getByRole('region', { name: 'How to read the verdict' })
  await expect(guide).toBeVisible()
  await expect(guide).toContainText('A code means something only beside its format: code 3 is a wrong signer on an Origin Attestation and a changed field on a ScoreReceipt.')
  await expect(guide.locator('.vfy-guide__verdicts dt')).toHaveText(['VALID', 'UNTRUSTED', 'VOID'])
  await expect(guide.locator('.vfy-guide__verdicts dd').nth(1)).toHaveText('Action/Run Evidence only: intact, but signed by a key Origin has not published.')

  // One line per format, in the detection table's order and with its names.
  const names = ['Action/Run Evidence', 'Origin Attestation', 'Crucible credential', 'ScoreReceipt', 'Episode trace', 'Merkle inclusion proof']
  const items = guide.locator('.vfy-guide__formats > li')
  await expect(guide.locator('.vfy-guide__formats > li > b')).toHaveText(names)
  await page.locator('.vfy-detection summary').click()
  await expect(page.locator('.vfy-table tbody td:first-child b')).toHaveText(names)

  // The codes match the detection table's verdict-codes column (from detect.mjs and @origin/verifier-core).
  const codes: Record<string, string> = {
    'Origin Attestation': '0 valid · 1 payload tampered · 2 signature invalid · 3 wrong signer · 4 malformed',
    'Crucible credential': '0 valid · 3 tamper · 4 drift',
    ScoreReceipt: '0 self-consistent · 3 tampered',
    'Episode trace': '0 intact · 2 chain tamper',
  }
  for (const [i, name] of names.entries()) {
    const line = items.nth(i).locator('.vfy-guide__codes')
    if (!codes[name]) {
      await expect(line, name).toHaveCount(0)
      await expect(items.nth(i), name).toContainText('No numeric code')
      continue
    }
    await expect(line, name).toHaveText(`Codes: ${codes[name]}`)
    const cell = page.locator('.vfy-table tbody tr').nth(i).locator('td').nth(3)
    expect((await cell.textContent())!.startsWith(codes[name]), name).toBe(true)
  }
  await expect(items.nth(0)).toContainText('UNTRUSTED when intact, because Origin has not published a signing key')
  await expect(items.nth(4)).toContainText('another check on the published TR-A002 trace fails (then with no code)')
})

test('pass 2 phase 2: a reproduced 1.1.0 result reads as a scorecard with the stated and re-run counts and the rating', async ({ page }) => {
  await verifyPolicyExample(page)
  const record = JSON.parse(await page.getByLabel('Artifact JSON', { exact: true }).inputValue())
  // The example's own stated summary: 4 matched, 2 misses and 6 over-grants of 12.
  expect(record.evaluation.summary).toEqual({ matched: 4, misses: 2, over_grants: 6, total: 12 })

  const card = page.getByRole('group', { name: 'Stated in this record and reproduced in this tab:' })
  await expect(card).toBeVisible()
  await expect(card).toHaveClass(/\bvfy-stated--reproduced\b/)
  await expect(card.locator('.vfy-score__lead')).toHaveText("4 of 12 synthetic decisions match the oracle (Origin's answer key)")

  const table = card.getByRole('table', { name: "The record's stated counts beside the re-run in this tab" })
  await expect(table.locator('thead th')).toHaveText(['Stated in the record', 'Re-run in this tab'])
  const rows = table.locator('tbody tr')
  await expect(rows.nth(0).locator('th, td')).toHaveText(['Matches', '4 of 12', '4 of 12'])
  await expect(rows.nth(1).locator('th, td')).toHaveText(['Misses', '2', '2: 0 stricter, 2 looser'])
  await expect(rows.nth(2).locator('th, td')).toHaveText(['Over-grants', '6', '6'])

  await expect(card.locator('.vfy-score__ids')).toContainText('Over-grants: sup-03, sup-04, sup-07, sup-08, sup-09, sup-12')
  await expect(card.locator('.vfy-score__ids')).toContainText('Misses: sup-02 (looser), sup-10 (looser)')
  await expect(card.locator('.vfy-score__ids')).toContainText(`Battery ${record.evaluation.battery.version} · oracle ${record.evaluation.oracle_version}`)
  await expect(card.locator('.vfy-score__rating')).toHaveText('Rating UNTRUSTED Intact, and signed by the key inside the record. Origin has not published a signing key, so anyone can make a record like this.')
  await expect(card).toContainText('Not tested: named agent or model behavior')

  // The card stays above the headline and the log.
  const tops = await page.locator('.vfy-result').evaluate((result) =>
    ['.vfy-score', '.section__lede', '.vfy-log'].map((selector) => result.querySelector(selector)!.getBoundingClientRect().top))
  expect(tops[0]).toBeLessThan(tops[1])
  expect(tops[1]).toBeLessThan(tops[2])
  expect(await motion(card)).toEqual({ animations: 0, named: 0, smil: 0 })
})

test('pass 2 phase 2: outside its freshness window the scorecard is greyed, rates VOID and names why', async ({ page }) => {
  await verifyPolicyExample(page)
  await page.clock.setFixedTime(new Date('2026-12-21T00:00:00.000Z'))
  await verify(page)
  await expect(verdict(page).locator('b')).toHaveText(/^VOID$/)
  const card = page.getByRole('group', { name: 'Stated in this record (outside its freshness window):' })
  await expect(card).toHaveClass(/\bvfy-stated--outside\b/)
  await expect(card.locator('.vfy-score__rating')).toHaveText("Rating VOID Outside its freshness window by this device's clock. The digest and signature still check.")
  // No green accent on a VOID result: the label takes the card's grey.
  const colors = await card.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el.querySelector('.vfy-score__label')!).color])
  expect(colors[1]).toBe(colors[0])
})

test('pass 2 phase 2: each numeric code on /verify sits beside its format name', async ({ page }) => {
  await page.goto('/verify')
  const log = page.locator('.vfy-log')

  await loadExample(page, 'Origin Attestation', 'payload_digest')
  await verify(page)
  await expect(verdict(page)).toContainText('Origin Attestation code 0: valid')
  await expect(log.locator('li b')).toContainText(['Origin Attestation code 0: valid'])
  await page.getByLabel('Tamper one field (see it void)').check()
  await verify(page)
  await expect(verdict(page).locator('b')).toHaveText(/^VOID$/)
  await expect(verdict(page)).toContainText('Origin Attestation code 1: payload tampered')
  await expect(log.locator('li b')).toContainText(['Origin Attestation code 1: payload tampered'])
  // The verdict line names the format once, by the name the guide uses.
  await expect(named(page)).toHaveText('Origin Attestation code 1: payload tampered')
  await expect(verdict(page)).not.toContainText('Sigil')

  await loadExample(page, 'Synthetic sandbox reference check', 'SYNTHETIC SANDBOX')
  await page.getByLabel('Tamper one field (see it void)').check()
  await verify(page)
  await expect(verdict(page)).toContainText('Crucible credential code 3: tamper')
  await expect(named(page)).toHaveText('Crucible credential code 3: tamper')

  await page.getByRole('button', { name: 'Load the published TR-A002 trace', exact: true }).click()
  await expect(page.getByLabel('Artifact JSON', { exact: true })).toHaveValue(/"final_digest"/)
  await verify(page)
  await expect(verdict(page)).toContainText('Episode trace code 0: intact')
  await expect(named(page)).toHaveText('Episode trace code 0: intact')
  await expect(verdict(page)).not.toContainText('EpisodeTrace')

  // The shot01 caption names the format beside its codes; the "still offline" boundary stays.
  const detail = page.locator('video[poster*="shot01-"]').locator('xpath=ancestor::figure').locator('.vband__detail')
  await expect(detail).toContainText('verifies VALID (Origin Attestation code 0) while online')
  await expect(detail).toContainText('gives VOID (Origin Attestation code 1: payload tampered)')
  await expect(detail).toContainText('restoring it gives VALID (Origin Attestation code 0), still offline')
  await expect(detail).not.toContainText('(code 0)')
  await expect(detail).toContainText('still offline')
})

test('pass 2 phase 2: the guide and the scorecard stay legible and static at 375 and 1280', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewports are set explicitly')
  for (const [width, height] of [[375, 812], [1280, 720]]) {
    const at = `${width}x${height}`
    await page.setViewportSize({ width, height })
    await verifyPolicyExample(page)
    const guide = page.getByRole('region', { name: 'How to read the verdict' })
    const card = page.getByRole('group', { name: 'Stated in this record and reproduced in this tab:' })
    for (const figure of [guide, card]) {
      for (const { text, px } of await textSizes(figure)) expect(px, `${at}: "${text}"`).toBeGreaterThanOrEqual(12)
      expect(await motion(figure), at).toEqual({ animations: 0, named: 0, smil: 0 })
    }
    expect(await noOverflow(page), at).toBe(true)
    // On a phone the guide stacks to one column, so its text never shrinks to fit.
    const lefts = await guide.locator('.vfy-guide__formats > li').evaluateAll((items) => items.map((li) => Math.round(li.getBoundingClientRect().left)))
    expect(new Set(lefts).size, at).toBe(width < 720 ? 1 : 2)
  }
})
