// Rebuild raster browser/app icons from the canonical, code-native favicon.
// Uses the existing build-time Playwright dependency; no network is required.
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const publicDir = new URL('../public/', import.meta.url)
const svg = await readFile(new URL('favicon.svg', publicDir), 'utf8')
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  for (const [name, size] of [['favicon.png', 32], ['apple-touch-icon.png', 180], ['origin-logo.png', 512]]) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%}svg{display:block;width:100%;height:100%}</style>${svg}`)
    await page.screenshot({ path: fileURLToPath(new URL(name, publicDir)), type: 'png' })
    console.log(`${name}: ${size} × ${size}`)
  }
} finally {
  await browser.close()
}
