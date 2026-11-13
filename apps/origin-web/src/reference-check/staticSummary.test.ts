import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { iamTasks, IAM_DECISIONS } from '@origin/verifier-core/iamGym'
import { supportTasks, SUPPORT_DECISIONS } from '@origin/verifier-core/supportGym'
import { ReferenceCheckPage } from './ReferenceCheckPage'

// reference-check.html carries a static summary inside #refcheck-root, so no-JS readers and
// crawlers see what the page evaluates; React replaces it on mount. It states the battery size
// and the oracle's decision words, so both are compared with the shipped gyms.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&amp;/g, '&').trim()

describe('/reference-check static summary', () => {
  const html = read('../../reference-check.html')
  const summary = text(html.match(/<div class="onpage-static">([\s\S]*?)<\/div>/)?.[1] ?? '')

  it('names the number of requests in each scenario', () => {
    expect(iamTasks.length).toBe(supportTasks.length)
    expect(summary).toContain(`Each scenario has ${supportTasks.length} fixed requests`)
  })

  it('names every decision word of the support and IAM oracles, and no other', () => {
    const words = summary.match(/The oracle marks each request (\w+), (\w+) or (\w+)\./)?.slice(1) ?? []
    expect([...words].sort()).toEqual([...SUPPORT_DECISIONS].sort())
    expect([...words].sort()).toEqual([...IAM_DECISIONS].sort())
  })

  it('sits inside #refcheck-root, before the skeleton, so the mounted app replaces it', () => {
    const root = html.indexOf('<div id="refcheck-root">')
    const at = html.indexOf('<div class="onpage-static">')
    expect(root).toBeGreaterThan(-1)
    expect(at).toBeGreaterThan(root)
    expect(html.indexOf('<div class="skel"', root)).toBeGreaterThan(at)
    expect(renderToStaticMarkup(createElement(ReferenceCheckPage))).not.toContain('onpage-static')
  })
})
