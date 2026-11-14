import { test, expect, type Locator, type Page } from '@playwright/test'

// Pass 2 follow-up — /brief print
// Argon P2-02: fitting the five-stage figure onto the brief's one printed page had brought its
// smallest print text to 9 px. In print the record-field names (the mono codes such as
// subject.model_digest) are now left to the screen, and the caption drops "and the record
// fields involved", so every word of the figure, the stage titles and descriptions included,
// prints at 10.5 px or more. The brief still prints on one page at Letter, A4 and the CSS page
// size. On screen the field names and the full caption stay.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.abort('blockedbyclient')
    return route.continue()
  })
})

const FIELDS = ['subject.model_digest', 'subject.tools_digest', 'proposal.input_digest', 'subject.environment_digest', 'evaluation.decisions', 'schema_version 1.1.0', 'evaluation', 'signature']
const CAPTION = 'What each stage does and the record fields involved. The requests are synthetic; your agent is not run.'
const PRINTED_CAPTION = 'The reference check in five stages What each stage does. The requests are synthetic; your agent is not run.'
const squash = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim()
const stagesFigure = (page: Page) => page.getByRole('figure', { name: 'The reference check in five stages', exact: true })

// Computed font size of every visible text node under the scope.
async function visibleTextSizes(scope: Locator) {
  return scope.evaluate((root) => {
    const sizes: { text: string, px: number }[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement
      const text = node.textContent?.trim()
      if (el && text && el.checkVisibility()) sizes.push({ text: text.slice(0, 40), px: parseFloat(getComputedStyle(el).fontSize) })
    }
    return sizes
  })
}

test('pass 2 follow-up: /brief keeps the field names on screen and leaves them out of print', async ({ page }) => {
  await page.goto('/brief')
  const fig = stagesFigure(page)
  const codes = fig.locator('.brief-stages__fields code')
  await expect(codes).toHaveText(FIELDS)
  for (const code of await codes.all()) await expect(code).toBeVisible()
  await expect(fig.locator('#brief-stages-desc')).toHaveText(CAPTION)
  expect(squash(await fig.locator('#brief-stages-desc').innerText())).toBe(CAPTION)

  await page.emulateMedia({ media: 'print' })
  await expect(fig).toBeVisible()
  await expect(fig.locator('.brief-stages__fields')).toHaveCount(4)
  for (const line of await fig.locator('.brief-stages__fields').all()) await expect(line).toBeHidden()
  for (const code of await codes.all()) await expect(code).toBeHidden()
  // The printed caption no longer promises field names the page does not print.
  expect(squash(await fig.locator('figcaption').innerText())).toBe(PRINTED_CAPTION)
  // The verdict and rating keys are content, not field names: they still print.
  await expect(fig.locator('.brief-stages__key li')).toHaveCount(6)
  for (const li of await fig.locator('.brief-stages__key li').all()) await expect(li).toBeVisible()
})

test('pass 2 follow-up: /brief prints the stage titles and descriptions at 10.5 px or more', async ({ page }) => {
  await page.goto('/brief')
  const fig = stagesFigure(page)
  await page.emulateMedia({ media: 'print' })
  const stages = await fig.locator('.brief__step').evaluateAll((steps) => steps.map((step) => {
    const px = (sel: string) => { const el = step.querySelector(sel)!; return el.checkVisibility() ? parseFloat(getComputedStyle(el).fontSize) : 0 }
    return { title: step.querySelector('h2')?.textContent?.trim(), titlePx: px('h2'), notePx: px('p') }
  }))
  expect(stages.map((s) => s.title)).toEqual(['Bind', 'Challenge', 'Grade', 'Attest', 'Reverify'])
  for (const s of stages) {
    expect(s.titlePx, `${s.title} title`).toBeGreaterThanOrEqual(10.5)
    expect(s.notePx, `${s.title} description`).toBeGreaterThanOrEqual(10.5)
  }
  // Nothing visible in the printed figure falls below that floor.
  const sizes = await visibleTextSizes(fig)
  expect(sizes.length).toBeGreaterThan(20)
  expect(sizes.filter((s) => s.px < 10.5)).toEqual([])
})

test('pass 2 follow-up: /brief still prints on one page at Letter, A4 and its CSS page size', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'page.pdf runs once, on the desktop project')
  await page.goto('/brief')
  await expect(stagesFigure(page)).toBeVisible()
  for (const options of [{ format: 'Letter' }, { format: 'A4' }, { preferCSSPageSize: true }]) {
    const pdf = await page.pdf({ ...options, printBackground: true })
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? [], JSON.stringify(options)).toHaveLength(1)
  }
})
