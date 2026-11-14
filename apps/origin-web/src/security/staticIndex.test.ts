import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SecurityPage } from './SecurityPage'

// security.html carries a static list of the six experiments inside #security-root so
// no-JS readers and crawlers can see what the page does; React replaces it on mount.
// The list repeats the DemoCard kicker and title verbatim. Compare with the actual
// rendered card order so extracting a shared component cannot hide a stale index.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const unescape = (s: string) => s.replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&amp;/g, '&')

describe('/security static experiment index', () => {
  const page = renderToStaticMarkup(createElement(SecurityPage))
  const html = read('../../security.html')
  const cards = [...page.matchAll(/<article class="card sec-card"[^>]*>([\s\S]*?)<\/article>/g)].map(([, card]) => {
    const kicker = card.match(/<p class="kicker">([^<]+)<\/p>/)?.[1]
    const title = card.match(/<h2[^>]*>([^<]+)<\/h2>/)?.[1]
    return unescape(`${kicker} — ${title}`)
  })
  const list = html.match(/<ul class="onpage-static"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? ''
  const items = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, li]) => unescape(li.replace(/<[^>]+>/g, '')))

  it('lists every DemoCard, in order, with its exact kicker and title', () => {
    expect(cards).toHaveLength(6)
    expect(items).toHaveLength(cards.length)
    cards.forEach((card, i) => expect(items[i].startsWith(card)).toBe(true))
    // Pass 2 Phase 2: card 02 claims its receipts are checkable, not provable, alone.
    expect(cards[1]).toBe('02 · Batch inclusion — Eight receipts. One signature. Each checkable alone.')
    expect(items.join('\n')).not.toMatch(/provable/i)
  })

  // Pass 2 Phase 2: each card states its mechanism and bounded claim. security.html repeats
  // them for readers without JavaScript, except 05, whose prerendered panel carries its own.
  it('repeats each card\'s mechanism and claim without JavaScript, in page order', () => {
    const pairs = (markup: string) => [...markup.matchAll(/<dl class="sec-claim">([\s\S]*?)<\/dl>/g)]
      .map(([, dl]) => [...dl.matchAll(/<dd>([\s\S]*?)<\/dd>/g)].map(([, dd]) => unescape(dd)))
    const rendered = pairs(page)
    expect(rendered).toHaveLength(6)
    expect(pairs(html)).toEqual([...rendered.slice(0, 4), rendered[5]])
    const at = (text: string) => html.indexOf(text)
    expect(at('<!-- ORIGIN:DELEGATION -->')).toBeGreaterThan(at('<p>04 · Configuration binding</p>'))
    expect(at('<!-- ORIGIN:DELEGATION -->')).toBeLessThan(at('<p>06 · Authority analysis</p>'))
  })

  it('sits inside #security-root so the mounted app replaces it', () => {
    const root = html.indexOf('<div id="security-root">')
    expect(root).toBeGreaterThan(-1)
    expect(html.indexOf('<ul class="onpage-static"')).toBeGreaterThan(root)
  })
})
