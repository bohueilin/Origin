import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { VerifyPage } from './VerifyPage'

// verify.html carries a static summary of the verifiable formats inside #verify-root, so no-JS
// readers and crawlers see what the page checks; React replaces it on mount. Each row repeats
// the rendered detection table: the format name and its verdict-codes text.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&amp;/g, '&').trim()

describe('/verify static format summary', () => {
  const html = read('../../verify.html')
  const page = renderToStaticMarkup(createElement(VerifyPage))
  const table = page.match(/<table class="vfy-table">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? ''
  const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) => {
    const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, cell]) => text(cell))
    return { name: cells[0], codes: cells[3] }
  })
  const summary = html.match(/<details open class="onpage-static">([\s\S]*?)<\/details>/)?.[1] ?? ''
  const items = [...summary.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, li]) => ({
    name: text(li.match(/<b>([\s\S]*?)<\/b>/)?.[1] ?? ''),
    // "(unsigned)" sits outside <b> and is not compared; the codes follow the first colon.
    codes: text(li.replace(/^[\s\S]*?<\/b>[^:]*:/, '')),
  }))

  it('lists every detection-table row, in order, with its exact name and verdict codes', () => {
    expect(rows).toHaveLength(6)
    expect(items).toEqual(rows)
  })

  it('states the Action/Run verdicts without a numeric code and the TR-A002 case without one', () => {
    expect(items[0].codes).toMatch(/^UNTRUSTED when intact but signed by a key Origin has not published/)
    expect(items[0].codes).toMatch(/No numeric code\.$/)
    expect(items.find((item) => item.name === 'Episode trace')?.codes).toBe(
      '0 intact · 2 chain tamper · VOID with no code when a published-TR-A002 check other than the chain fails')
  })

  it('sits inside #verify-root, before the skeleton, so the mounted app replaces it', () => {
    const root = html.indexOf('<div id="verify-root">')
    const details = html.indexOf('<details open class="onpage-static">')
    expect(root).toBeGreaterThan(-1)
    expect(details).toBeGreaterThan(root)
    expect(html.indexOf('<div class="skel"', root)).toBeGreaterThan(details)
    expect(page).not.toContain('onpage-static')
  })
})

// The /verify#a= link carries a record in the fragment. The analytics tag is configured with a
// page_location built without location.hash, so it does not report the fragment.
describe('analytics page_location leaves out the fragment', () => {
  for (const file of ['verify.html', 'reference-check.html']) {
    it(`${file} configures page_location without location.hash`, () => {
      const config = read(`../../${file}`).match(/gtag\('config',[^\n]*\);/)?.[0] ?? ''
      expect(config).toContain("page_location: location.origin + location.pathname + location.search")
      expect(config).not.toMatch(/location\.hash|location\.href/)
    })
  }
})
