// Deterministic 1200x630 social cards — one per served route.
//
// Every page used to share a single og-cover.jpg, so pasting /security into Slack
// unfurled the home page. That is how most people first meet this site, and it made
// twenty distinct surfaces look like one.
//
// scripts/og-cover.html stays the reproducible authority for the HOME card and for
// the shared visual shell: no network resources, no remote fonts, and the generated cards are checked into source. Each route below swaps only the text block
// and the three proof rows, so the cards stay a family rather than a set of one-offs.
//
// Uses the Playwright already installed for the E2E suite — no new dependency.
//
//   node scripts/og-cards.mjs           # write every card
//   node scripts/og-cards.mjs --check   # fail if any card is missing (CI-safe, no browser)
//
// NOTE: deliberately NOT wired into `npm run gates`. Regenerating launches a browser
// and rewrites binaries; a gate that rewrites committed JPEGs on every run would make
// the diff noisy and the check meaningless. Run it when a card's copy changes.

import { chromium } from 'playwright'
import { readFile, mkdir, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scripts = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scripts, '..')
const template = await readFile(path.join(scripts, 'og-cover.html'), 'utf8')

// `out` is relative to public/. The home card keeps its historic filename: it is
// pinned by tests/e2e/investor-ready.spec.ts, which fetches /og-cover.jpg and asserts
// 1200x630, and by smoke.spec.ts, which asserts the meta points at og-cover.jpg.
const CARDS = [
  {
    out: 'og-cover.jpg',
    home: true, // rendered from the current brand template
  },
  {
    out: 'og/over-grant.jpg',
    eyebrow: 'THE OVER-GRANT ANALYZER',
    h1: 'How much authority goes unused?',
    sub: 'Explore authorization risk across a reproducible synthetic fleet.',
    status: 'Synthetic corpus · re-derivable from its seed',
    rows: [['Fleet', 'Synthetic', ''], ['Risk metrics', 'Five', ''], ['Results', 'Re-derivable', '']],
  },
  {
    out: 'og/security.jpg',
    eyebrow: 'RUN THE VERIFIERS YOURSELF',
    h1: 'Trust the checks you can run.',
    sub: 'Inspect signatures and tampering in a local demonstration.',
    status: 'Synthetic demo data · verified client-side, nothing uploaded',
    rows: [['Signature', 'ES256', ''], ['Untouched', 'VALID', 'valid'], ['One byte flipped', 'VOID', 'void']],
  },
  {
    out: 'og/verify.jpg',
    eyebrow: 'VERIFY THE EVIDENCE',
    h1: 'A second look. An independent check.',
    sub: 'Recompute the artifact’s digests and signatures in your browser.',
    status: 'Artifact integrity is distinct from issuer trust and execution.',
    rows: [['Recompute', 'client-side', ''], ['Intact chain', 'VALID', 'valid'], ['Altered entry', 'VOID', 'void']],
  },
  {
    out: 'og/reference-check.jpg',
    eyebrow: 'THE AGENT REFERENCE CHECK',
    h1: 'Challenge the policy. Inspect the result.',
    sub: 'Evaluate a selected policy against a deterministic synthetic battery.',
    status: 'No named agent is contacted or executed by this demo.',
    rows: [['Inputs', 'Bound', ''], ['Battery', 'Synthetic', ''], ['Browser signer', 'Unpinned', '']],
  },
  {
    out: 'og/trust.jpg',
    eyebrow: 'TRUST &amp; CONTROLS',
    h1: 'Trust begins with clear boundaries.',
    sub: 'Explore what is implemented, what is proposed, and what remains your decision.',
    status: 'Decision-support and evidence infrastructure — not compliance certification',
    rows: [['Controls', 'Documented', ''], ['Evidence', 'Inspectable', ''], ['Authority', 'Yours', '']],
  },
  {
    out: 'og/proof.jpg',
    eyebrow: 'EVIDENCE YOU CAN INSPECT',
    h1: 'Every claim has a provenance.',
    sub: 'An authored specimen. A machine-emitted trace. Clear labels on both.',
    status: 'Customer-owned evidence is not yet collected.',
    rows: [['TR-A001', 'authored', ''], ['TR-A002', 'machine-emitted', ''], ['Chain of 12', 'VALID', 'valid']],
  },
  {
    out: 'og/labs.jpg',
    eyebrow: 'ORIGIN LABS',
    h1: 'When the next decision moves something.',
    sub: 'Explore simulation, robot fleets, and the evidence behind a bounded evaluation.',
    status: 'Research and demonstrations, not production products',
    rows: [['Floors', 'Synthetic', ''], ['Playback', 'Descriptive', ''], ['Physical safety', 'Not validated', '']],
  },
  {
    out: 'og/passport.jpg',
    eyebrow: 'DELEGATED AUTONOMY',
    h1: 'The agent proposes. You decide.',
    sub: 'Explore scoped grants and review controls in the credential-broker prototype.',
    status: 'Capability is not permission',
    rows: [['Grant', 'scoped', ''], ['In allowlist', 'ALLOW', 'valid'], ['Over auto-cap', 'HELD', 'void']],
  },
  {
    out: 'og/soc.jpg',
    eyebrow: 'AUTONOMY CONTROL',
    h1: 'Inspect the proposed action.',
    sub: 'Explore bounded policy and Guardian demonstrations in the lab console.',
    status: 'Lab demonstration · not a production protection claim',
    rows: [['Injected instruction', 'seen', ''], ['Policy', 'fail-closed', ''], ['Destructive call', 'BLOCKED', 'void']],
  },
  {
    out: 'og/proving-ground.jpg',
    eyebrow: 'PHYSICAL AI · SIMULATION LAB',
    h1: 'Draw a floor. Test a fleet.',
    sub: 'Explore a synthetic floor in 2D and 3D. Inspect what the deterministic oracle evaluates.',
    status: 'Simulation evidence is not real-world safety validation.',
    rows: [['Floor', 'Editable', ''], ['Playback', 'Descriptive', ''], ['Evidence', 'Inspectable', '']],
  },
  {
    out: 'og/brief.jpg',
    eyebrow: 'ONE-PAGE BRIEF',
    h1: 'Origin, in a single page.',
    sub: 'The problem, the evidence-review offer, and the prototype you can inspect.',
    status: 'Synthetic sandbox evidence · private-pilot prototype',
    rows: [['Reference check', 'Try it', ''], ['Evidence', 'Inspect it', ''], ['First step', 'A review', '']],
  },
]

const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])

/** Swap the text block and proof rows, leaving the shell (brand, CSS, layout) untouched. */
function render(card) {
  if (card.home) return template
  const brand = template.match(/<div class="brand">[\s\S]*?<\/div>/)?.[0]
  if (!brand) throw new Error('Social-card template is missing its brand.')
  const section =
    `<section>\n` +
    `      ${brand}\n` +
    `      <p class="eyebrow">${card.eyebrow}</p>\n` +
    `      <h1>${card.h1}</h1>\n` +
    `      <p class="sub">${card.sub}</p>\n` +
    `      <p class="status">${card.status}</p>\n` +
    `    </section>`
  const rows = card.rows
    .map(([k, v, cls]) => `      <div class="row"><span>${esc(k)}</span><b${cls ? ` class="${cls}"` : ''}>${esc(v)}</b></div>`)
    .join('\n')
  const aside = `<aside class="proof">\n      <h2>At a glance.</h2>\n${rows}\n    </aside>`

  let html = template.replace(/<section>[\s\S]*?<\/section>/, section)
  html = html.replace(/<aside class="proof">[\s\S]*?<\/aside>/, aside)
  return html
}

if (process.argv.includes('--check')) {
  // Existence check only — no browser. Rendering in CI would need a Playwright
  // install and would produce a JPEG that differs by encoder version, which is a
  // false failure, not a real one.
  const missing = []
  for (const card of CARDS) {
    try {
      await access(path.join(root, 'public', card.out))
    } catch {
      missing.push(card.out)
    }
  }
  if (missing.length > 0) {
    console.error(`og-cards: MISSING ${missing.length} card(s): ${missing.join(', ')}`)
    console.error('Run `node scripts/og-cards.mjs` and commit the images.')
    process.exit(1)
  }
  console.log(`og-cards: all ${CARDS.length} cards present.`)
} else {
  await mkdir(path.join(root, 'public', 'og'), { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  for (const card of CARDS) {
    await page.setContent(render(card), { waitUntil: 'load' })
    const overflow = await page.evaluate(() => [...document.querySelectorAll('section, h1, .sub, .status, .proof h2, .row')].filter((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().bottom > 570).map((el) => ({ tag: el.tagName, text: el.textContent?.slice(0, 60), width: el.clientWidth, content: el.scrollWidth, bottom: el.getBoundingClientRect().bottom })))
    if (overflow.length) throw new Error(`Social-card content exceeds its frame: ${card.out} ${JSON.stringify(overflow)}`)
    await page.screenshot({
      path: path.join(root, 'public', card.out),
      type: 'jpeg',
      quality: 92,
      fullPage: false,
    })
    console.log(`  ${card.out}`)
  }
  await browser.close()
  console.log(`og-cards: ${CARDS.length} cards regenerated at 1200x630.`)
}
