// Reproducible, local-only design evidence. No submissions or authenticated data.
// BASE_URL=http://localhost:5290 OUT_DIR=/tmp/site-eval node scripts/site-eval.mjs
// Optional: ROUTES=/,/trust WIDTHS=375 SOURCE_LABEL=<evaluated revision description>
// Numbers describe this local server, not production performance or WCAG certification.
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import postcss from 'postcss'

const base = process.env.BASE_URL || 'http://localhost:5290'
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Use a local server')
const out = resolve(process.env.OUT_DIR || '/tmp/origin-site-evaluation')
const routes = (process.env.ROUTES || '/,/app,/proof,/trust,/verify,/over-grant,/security,/reference-check,/labs,/simulation,/operations,/proving-ground,/reference-check-vs-runtime,/brief,/passport,/foundry,/soc,/clip,/capture,/auth,/admin,/404.html,/rsi/rsi_dashboard.html,/legal/privacy-policy.html,/legal/terms-of-service.html').split(',')
const widths = (process.env.WIDTHS || '1440,375,320').split(',').map(Number)
const height = width => width === 1440 ? 900 : width === 375 ? 812 : 640
const slug = route => route === '/' ? 'home' : route.slice(1).replaceAll('/', '-').replaceAll('.html', '')
// Vite can expose absolute workspace paths in resource URLs and stack traces.
// Preserve asset identity and measurements without publishing local user paths.
const json = value => JSON.stringify(value, (_key, item) => typeof item === 'string'
  ? item.replace(/\/(?:Users|home)\/[^\s"'<>]+/g, path => {
    const marker = ['/node_modules/', '/apps/origin-web/', '/packages/'].find(part => path.includes(part))
    return marker ? `/<local>${path.slice(path.indexOf(marker))}` : '/<local>'
  }) : item, 2)
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] })

function inspectDocument() {
  const shown = el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getBoundingClientRect().width > 0
  const selector = el => el.id ? `#${el.id}` : `${el.localName}${Array.from(el.classList).slice(0, 3).map(c => `.${c}`).join('')}`
  const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
  const text = el => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 180)
  const all = [...document.body.querySelectorAll('*')].filter(shown)
  const rootStyle = getComputedStyle(document.documentElement)
  const canvas = document.createElement('canvas').getContext('2d')
  const textNodes = all.filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
  // Conservative solid-background contrast calculation. Images, gradients and
  // group opacity remain explicitly unresolved, not silently counted as passes.
  const rgba = value => {
    if (!/^(rgba?\(|color\(srgb )/.test(value)) return null
    const parts = value.match(/[\d.]+/g)?.map(Number)
    const scale = value.startsWith('color(') ? 255 : 1
    return parts?.length >= 3 ? [...parts.slice(0, 3).map(v => v * scale), parts[3] ?? 1] : null
  }
  const over = (a, b) => a.slice(0, 3).map((v, i) => v * a[3] + b[i] * (1 - a[3]))
  const luminance = rgb => rgb.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0)
  const contrast = textNodes.map(el => {
    const chain = []; for (let node = el; node; node = node.parentElement) chain.unshift(node)
    let background = [255, 255, 255], complex = false
    for (const node of chain) {
      const s = getComputedStyle(node), color = rgba(s.backgroundColor)
      if (color) background = over(color, background)
      else complex = true
      if (s.backgroundImage !== 'none' || Number(s.opacity) !== 1 || s.filter !== 'none') complex = true
    }
    const s = getComputedStyle(el), color = rgba(s.color)
    if (!color || el.closest('svg')) complex = true
    const foreground = color ? over(color, background) : background
    const a = luminance(foreground), b = luminance(background)
    const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.667 && Number(s.fontWeight) >= 700)
    return { selector: selector(el), text: text(el), color: s.color, background: background.map(Math.round), ratio: complex ? null : +((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toFixed(3), minimum: large ? 3 : 4.5, disabled: Boolean(el.closest(':disabled')), unresolved: complex }
  })
  const typography = textNodes.map(el => {
    const s = getComputedStyle(el)
    canvas.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
    return { selector: selector(el), tag: el.localName, text: text(el), size: parseFloat(s.fontSize), lineHeight: s.lineHeight, weight: s.fontWeight, color: s.color, background: s.backgroundColor, font: s.fontFamily, width: rect(el).width, ch: +(rect(el).width / canvas.measureText('0').width).toFixed(1) }
  })
  const targets = all.filter(el => el.matches('a[href],button,input:not([type=hidden]),select,textarea,[tabindex="0"]')).map(el => ({ selector: selector(el), text: text(el), href: el.getAttribute('href'), disabled: el.matches(':disabled'), inlineExceptionCandidate: el.localName === 'a' && Boolean(el.closest('p,li,td,figcaption')) && getComputedStyle(el).display === 'inline', ...rect(el) }))
  const motion = new Map()
  for (const el of all) {
    const s = getComputedStyle(el)
    if (s.animationName !== 'none' || s.transitionDuration.split(',').some(v => parseFloat(v) > 0)) {
      const m = { selector: selector(el), animation: s.animationName, duration: s.animationDuration, easing: s.animationTimingFunction, iterations: s.animationIterationCount, transition: s.transitionProperty, transitionDuration: s.transitionDuration, transitionEasing: s.transitionTimingFunction }
      motion.set(JSON.stringify(m), m)
    }
  }
  const rules = []
  const walk = (items, source, context = '') => { for (const rule of items) { if (rule.cssRules) walk(rule.cssRules, source, `${context} ${rule.conditionText || rule.name || ''}`); else if (/animation|transition|#[0-9a-f]{3,8}\b/i.test(rule.cssText)) rules.push({ source, context: context.trim(), css: rule.cssText }) } }
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules, sheet.href ? new URL(sheet.href).pathname : 'inline') } catch { /* External styles are deliberately blocked. */ } }
  return {
    title: document.title, text: document.body.innerText, robots: document.querySelector('meta[name=robots]')?.content || '',
    viewport: { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
    overflow: all.filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 && r.width && !el.closest('svg') }).map(el => ({ selector: selector(el), text: text(el), ...rect(el) })),
    headings: all.filter(el => /^H[1-6]$/.test(el.tagName)).map(el => ({ level: Number(el.tagName[1]), text: text(el) })),
    landmarks: all.filter(el => el.matches('main,header,footer,nav,[role=main],[role=banner],[role=contentinfo],[role=navigation]')).map(el => ({ selector: selector(el), label: el.getAttribute('aria-label'), text: text(el) })),
    links: all.filter(el => el.matches('a[href]')).map(el => ({ text: text(el), href: el.getAttribute('href') })),
    images: all.filter(el => el.matches('img')).map(el => ({ src: el.getAttribute('src'), alt: el.getAttribute('alt'), caption: el.closest('figure')?.querySelector('figcaption')?.innerText || '', loading: el.loading, priority: el.fetchPriority, ...rect(el) })),
    typography, contrast, targets, motion: [...motion.values()], cssRules: rules,
    typeTokens: Array.from(rootStyle).filter(k => k.startsWith('--fs-')).map(k => [k, rootStyle.getPropertyValue(k).trim()]),
    videos: [...document.querySelectorAll('video')].map(v => ({ src: v.currentSrc.replace(location.origin, ''), paused: v.paused, loop: v.loop, autoplay: v.autoplay, preload: v.preload })),
  }
}

async function contextFor(width, js = true, reduced = false) {
  const context = await browser.newContext({ viewport: { width, height: height(width) }, javaScriptEnabled: js, reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue()
    return route.abort('blockedbyclient')
  })
  return context
}

async function collect(route, width) {
  const context = await contextFor(width)
  const page = await context.newPage()
  const failures = []
  page.on('pageerror', error => failures.push(error.message))
  await page.addInitScript(() => {
    window.__designMetrics = { shifts: [], lcp: null }
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__designMetrics.shifts.push({ time: e.startTime, value: e.value, sources: e.sources.map(s => ({ node: s.node?.id || s.node?.className || s.node?.nodeName, from: { x: s.previousRect.x, y: s.previousRect.y }, to: { x: s.currentRect.x, y: s.currentRect.y } })) })
    }).observe({ type: 'layout-shift', buffered: true })
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) window.__designMetrics.lcp = { time: e.startTime, size: e.size, element: e.element?.outerHTML.slice(0, 500), url: e.url?.replace(location.origin, '') }
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  })
  const response = await page.goto(`${base}${route}`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(4000)
  // Freeze first-load metrics before audit, focus, media emulation, or screenshot scroll.
  const metrics = await page.evaluate(() => ({ ...window.__designMetrics, navigation: performance.getEntriesByType('navigation').map(e => ({ transfer: e.transferSize, encoded: e.encodedBodySize, decoded: e.decodedBodySize })), resources: performance.getEntriesByType('resource').filter(e => e.name.startsWith(location.origin)).map(e => ({ path: e.name.replace(location.origin, ''), transfer: e.transferSize, encoded: e.encodedBodySize, decoded: e.decodedBodySize, kind: e.initiatorType })) }))
  // CLS is the largest session window (5s maximum, gaps no more than 1s).
  let cls = 0, sum = 0, start = 0, previous = -Infinity
  for (const s of metrics.shifts) { if (s.time - previous > 1000 || s.time - start > 5000) { sum = 0; start = s.time } sum += s.value; cls = Math.max(cls, sum); previous = s.time }
  metrics.cls = cls
  metrics.firstLoadTransferBytes = [...metrics.navigation, ...metrics.resources].reduce((n, r) => n + r.transfer, 0)
  const dom = await page.evaluate(inspectDocument)
  const screenshot = `${slug(route)}-${width}.jpg`
  await page.screenshot({ path: resolve(out, screenshot), fullPage: true, type: 'jpeg', quality: 85, animations: 'disabled' })
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze()
  const compact = items => items.map(item => ({ id: item.id, impact: item.impact, description: item.description, nodes: item.nodes.map(n => ({ target: n.target, html: n.html, summary: n.failureSummary, checks: [...n.any, ...n.all, ...n.none].map(c => ({ id: c.id, data: c.data, message: c.message })) })) }))
  const focus = []
  await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0) })
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    focus.push(await page.evaluate(() => { const el = document.activeElement, s = getComputedStyle(el); return { element: el.outerHTML.slice(0, 350), visible: el.matches(':focus-visible'), outline: s.outline, boxShadow: s.boxShadow } }))
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(250)
  const reduced = await page.evaluate(inspectDocument)
  const result = { route, width, status: response.status(), screenshot, metrics, failures, dom, axe: { violations: compact(axe.violations), incomplete: compact(axe.incomplete) }, focus, reducedMotion: { motion: reduced.motion, videos: reduced.videos } }
  await writeFile(resolve(out, `${slug(route)}-${width}.json`), json(result))
  console.log(JSON.stringify({ route, width, cls, bytes: metrics.firstLoadTransferBytes, overflow: dom.viewport.scrollWidth - width, violations: axe.violations.map(v => `${v.id}:${v.nodes.length}`) }))
  await context.close()
  return { route, width, status: result.status, screenshot, cls, bytes: metrics.firstLoadTransferBytes, overflow: dom.viewport.scrollWidth - width, violations: axe.violations.map(v => ({ id: v.id, count: v.nodes.length })) }
}

// Supplemental checks are generated here so no retained evidence requires an
// undocumented browser session. Screenshots stay in the output/CI artifact.
async function supplementary() {
  const inventory = {}
  const destinations = new Set()
  for (const route of routes) {
    const file = resolve(out, `${slug(route)}-${widths.includes(375) ? 375 : widths[0]}.json`)
    const result = JSON.parse(await readFile(file, 'utf8'))
    inventory[route] = { normal: result.dom.motion, reduced: result.reducedMotion.motion }
    for (const link of result.dom.links) {
      const url = new URL(link.href, `${base}${route}`)
      if (![new URL(base).hostname, 'originphysicalai.com'].includes(url.hostname) || !/^https?:$/.test(url.protocol) || url.pathname.startsWith('/api/')) continue
      destinations.add(url.pathname + url.search + url.hash)
    }
  }
  await writeFile(resolve(out, 'motion-inventory.json'), json(inventory))

  const focus = [], hover = [], navigation = { pages: routes.length, localDestinations: destinations.size, issues: [], statuses: [] }
  const context = await contextFor(375, true, true)
  const page = await context.newPage()
  try {
    for (const [route, filename] of [['/legal/privacy-policy.html', 'privacy-focus.jpg'], ['/legal/terms-of-service.html', 'terms-focus.jpg']]) {
      if (!routes.includes(route)) continue
      await page.goto(`${base}${route}`)
      await page.keyboard.press('Tab')
      await page.waitForTimeout(200)
      focus.push({ route, focus: await page.locator('.skip-link').evaluate(el => {
        const css = getComputedStyle(el), r = el.getBoundingClientRect()
        return { color: css.color, background: css.backgroundColor, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, focus: el.matches(':focus-visible') }
      }) })
      await page.screenshot({ path: resolve(out, filename), type: 'jpeg', quality: 85 })
    }
    for (const [route, selector] of [['/foundry', '.fdy-btn--primary'], ['/soc', '.fdy-btn--primary'], ['/proving-ground', '.pg-toggle button']]) {
      if (!routes.includes(route)) continue
      await page.goto(`${base}${route}`)
      const control = page.locator(selector).first()
      await control.hover()
      await page.waitForTimeout(250)
      hover.push({ route, hover: await control.evaluate(el => { const s = getComputedStyle(el); return { transform: s.transform, transition: s.transition, color: s.color, background: s.backgroundColor } }) })
    }
    for (const destination of destinations) {
      const url = new URL(destination, base)
      const response = await context.request.get(url.href)
      const type = response.headers()['content-type'] || ''
      navigation.statuses.push({ route: destination, status: response.status(), type })
      if (!response.ok()) navigation.issues.push({ route: destination, error: `HTTP ${response.status()}` })
      else if (url.hash && type.includes('text/html')) {
        await page.goto(url.href)
        if (!await page.evaluate(id => Boolean(document.getElementById(id)), decodeURIComponent(url.hash.slice(1)))) navigation.issues.push({ route: destination, error: 'Missing fragment' })
      }
    }
  } finally { await context.close() }
  await writeFile(resolve(out, 'focus-check.json'), json(focus))
  await writeFile(resolve(out, 'supplement.json'), json(hover))
  await writeFile(resolve(out, 'navigation-check.json'), json(navigation))

  const repetitions = []
  const queue = routes.filter(route => ['/foundry', '/soc', '/capture'].includes(route)).flatMap(route => [375, 1440].flatMap(width => [1, 2, 3].map(run => ({ route, width, run }))))
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (queue.length) {
      const { route, width, run } = queue.shift()
      const context = await contextFor(width), page = await context.newPage()
      try {
        await page.addInitScript(() => {
          window.__layout = []
          new PerformanceObserver(list => {
            for (const e of list.getEntries()) if (!e.hadRecentInput) window.__layout.push({ time: e.startTime, value: e.value, sources: e.sources.map(s => ({ element: s.node?.id || s.node?.className || s.node?.nodeName, before: { y: s.previousRect.y, height: s.previousRect.height }, after: { y: s.currentRect.y, height: s.currentRect.height } })) })
          }).observe({ type: 'layout-shift', buffered: true })
        })
        await page.goto(`${base}${route}`, { waitUntil: 'load' })
        await page.waitForTimeout(4000)
        const shifts = await page.evaluate(() => window.__layout)
        let cls = 0, sum = 0, start = 0, previous = -Infinity
        for (const shift of shifts) { if (shift.time - previous > 1000 || shift.time - start > 5000) { sum = 0; start = shift.time } sum += shift.value; cls = Math.max(cls, sum); previous = shift.time }
        repetitions.push({ route, viewport: { width, height: height(width) }, run, cls, shifts, source: process.env.SOURCE_LABEL || 'unspecified', build: process.env.BUILD_KIND || 'development' })
      } finally { await context.close() }
    }
  }))
  await writeFile(resolve(out, 'legacy-cls.jsonl'), repetitions.map(row => JSON.stringify(row)).join('\n') + '\n')

  const literals = []
  const app = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const repo = resolve(app, '../..')
  const files = execFileSync('git', ['ls-files', 'apps/origin-web'], { cwd: repo, encoding: 'utf8' }).trim().split('\n').filter(file => /\.(css|html)$/.test(file))
  for (const file of files) {
    const source = await readFile(resolve(repo, file), 'utf8')
    const blocks = file.endsWith('.css') ? [{ text: source, offset: 0 }] : [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(match => ({ text: match[1], offset: source.slice(0, match.index + match[0].indexOf('>') + 1).split('\n').length - 1 }))
    for (const block of blocks) {
      const ast = postcss.parse(block.text, { from: file })
      ast.walkDecls(decl => {
        if (!/#[\da-f]{3,8}\b/i.test(decl.value)) return
        let rootToken = false
        for (let parent = decl.parent; parent; parent = parent.parent) if (parent.selector?.includes(':root')) rootToken = true
        if (!rootToken) literals.push({ file, line: block.offset + decl.source.start.line, selector: decl.parent.selector || '', property: decl.prop, value: decl.value })
      })
    }
  }
  await writeFile(resolve(out, 'source-literals.json'), json(literals))
}

const jobs = routes.flatMap(route => widths.map(width => ({ route, width })))
const summary = []
try {
  await Promise.all(Array.from({ length: 2 }, async () => { while (jobs.length) { const { route, width } = jobs.shift(); summary.push(await collect(route, width)) } }))
  // A separate JS-disabled context checks the actual fallback, not a DOM after hydration.
  for (const route of routes) {
    const context = await contextFor(375, false)
    const page = await context.newPage()
    const response = await page.goto(`${base}${route}`, { waitUntil: 'load' })
    const dom = await page.evaluate(inspectDocument)
    const screenshot = `${slug(route)}-no-js.jpg`
    await page.screenshot({ path: resolve(out, screenshot), fullPage: true, type: 'jpeg', quality: 85 })
    await writeFile(resolve(out, `${slug(route)}-no-js.json`), json({ route, status: response.status(), screenshot, dom }))
    await context.close()
  }
  await supplementary()
  await writeFile(resolve(out, 'index.json'), json({ source: process.env.SOURCE_LABEL || 'unspecified local checkout', date: new Date().toISOString(), browser: browser.version(), build: process.env.BUILD_KIND || 'development', note: 'Local build diagnostics, cold browser contexts; 4 seconds after load, no isMobile; external requests blocked; initial anonymous states; reduced motion switched after load. Review manual findings before treating candidates as defects.', summary }))
} finally { await browser.close() }
