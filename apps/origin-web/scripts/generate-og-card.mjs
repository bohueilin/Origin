// Deterministic 1200x630 social card.
//
// The checked-in scripts/og-cover.html is the reproducible authority for the JPG:
// no network resources, no remote fonts, so a regeneration on any machine paints
// the same pixels. Uses the Playwright already installed for the E2E suite —
// this adds no dependency.
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scripts = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scripts, '..')
const source = await readFile(path.join(scripts, 'og-cover.html'), 'utf8')
const output = path.join(root, 'public', 'og-cover.jpg')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })

await page.setContent(source, { waitUntil: 'load' })
await page.screenshot({ path: output, type: 'jpeg', quality: 92, fullPage: false })
await browser.close()
console.log(`og-cover.jpg regenerated at 1200x630 -> ${output}`)
