// Deterministic 1200x630 social cards — one per served route.
//
// Every page used to share a single og-cover.jpg, so pasting /security into Slack
// unfurled the home page. That is how most people first meet this site, and it made
// twenty distinct surfaces look like one.
//
// scripts/og-cover.html stays the reproducible authority for the HOME card and for
// the shared visual shell: no network resources, no remote fonts, so a regeneration
// on any machine paints the same pixels. Each route below swaps only the text block
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
    home: true, // rendered from the template verbatim — byte-identical to before
  },
  {
    out: 'og/security.jpg',
    eyebrow: 'RUN THE VERIFIERS YOURSELF',
    h1: 'Don’t take our word for it. Run the verifiers.',
    sub: 'Sign an attestation, flip one byte, watch it void — in your browser',
    status: 'Synthetic demo data · verified client-side, nothing uploaded',
    rows: [['Signature', 'ES256', ''], ['Untouched', 'VALID', 'valid'], ['One byte flipped', 'VOID', 'void']],
  },
  {
    out: 'og/verify.jpg',
    eyebrow: 'OFFLINE RE-VERIFICATION',
    h1: 'Paste an artifact. Re-check it offline.',
    sub: 'Digests and signatures recompute in your browser — nothing you paste is uploaded',
    status: 'Reproducible under this verifier · never “safe” or “correct”',
    rows: [['Recompute', 'client-side', ''], ['Intact chain', 'VALID', 'valid'], ['Altered entry', 'VOID', 'void']],
  },
  {
    out: 'og/reference-check.jpg',
    eyebrow: 'CONFIGURATION-BOUND REFERENCE CHECK',
    h1: 'Find out where your agent is over-granted.',
    sub: 'A deterministic least-privilege gym, then a signed, config-bound attestation',
    status: 'Deterministic oracle is the only judge — never an LLM',
    rows: [['Readiness level', 'L0–L4', ''], ['Over-grant', 'per decision', ''], ['Config drift', 'VOID', 'void']],
  },
  {
    out: 'og/trust.jpg',
    eyebrow: 'TRUST &amp; CONTROLS',
    h1: 'What we collect, keep, and hand back.',
    sub: 'Retention, access control, encryption, hash-chained audit logs, the responsibility split',
    status: 'Decision-support and evidence infrastructure — not compliance certification',
    rows: [['Audit log', 'hash-chained', ''], ['Gate scoreboard', 'GREEN', 'valid'], ['Tampered record', 'VOID', 'void']],
  },
  {
    out: 'og/proof.jpg',
    eyebrow: 'THE HONEST LADDER',
    h1: 'Evidence in rungs, never dressed up as another.',
    sub: 'TR-A001 an authored specimen · TR-A002 a machine-emitted, re-verifiable hash chain',
    status: 'The first design-partner trace is forthcoming — and labeled as such',
    rows: [['TR-A001', 'authored', ''], ['TR-A002', 'machine-emitted', ''], ['Chain of 12', 'VALID', 'valid']],
  },
  {
    out: 'og/labs.jpg',
    eyebrow: 'ORIGIN LABS',
    h1: 'One evidence contract, past software agents.',
    sub: 'Robot fleets and spatial reconstruction on the same spine — the domain verifier changes, the contract does not',
    status: 'Research and demonstrations, not production products',
    rows: [['Software agent', 'same receipt', ''], ['Factory plan', 'same receipt', ''], ['Contract', 'unchanged', 'valid']],
  },
  {
    out: 'og/passport.jpg',
    eyebrow: 'DELEGATED AUTONOMY',
    h1: 'The agent proposes. You keep the authority.',
    sub: 'A scoped, revocable grant, and every real-world action waits for approval',
    status: 'Capability is not permission',
    rows: [['Grant', 'scoped', ''], ['In allowlist', 'ALLOW', 'valid'], ['Over auto-cap', 'HELD', 'void']],
  },
  {
    out: 'og/soc.jpg',
    eyebrow: 'AUTONOMY CONTROL',
    h1: 'Your agent has the keys. This is the gate.',
    sub: 'A Guardian plus a fail-closed deterministic policy, stopping destructive tool-calls',
    status: 'We contain prompt injection — the destructive action never executes at the gate',
    rows: [['Injected instruction', 'seen', ''], ['Policy', 'fail-closed', ''], ['Destructive call', 'BLOCKED', 'void']],
  },
  {
    out: 'og/brief.jpg',
    eyebrow: 'ONE-PAGE BRIEF',
    h1: 'Origin, in a single page.',
    sub: 'Configuration-bound reference check → Origin Attestation → offline verification',
    status: 'Synthetic sandbox evidence · private-pilot prototype',
    rows: [['Reference check', 'L4', ''], ['Bound artifact', 'VALID', 'valid'], ['Config changed', 'VOID', 'void']],
  },
]

const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])

/** Swap the text block and proof rows, leaving the shell (brand, CSS, layout) untouched. */
function render(card) {
  if (card.home) return template
  const section =
    `<section>\n` +
    `      <div class="brand"><span class="mark"></span>Origin</div>\n` +
    `      <p class="eyebrow">${card.eyebrow}</p>\n` +
    `      <h1>${card.h1}</h1>\n` +
    `      <p class="sub">${card.sub}</p>\n` +
    `      <p class="status">${card.status}</p>\n` +
    `    </section>`
  const rows = card.rows
    .map(([k, v, cls]) => `      <div class="row"><span>${esc(k)}</span><b${cls ? ` class="${cls}"` : ''}>${esc(v)}</b></div>`)
    .join('\n')
  const aside = `<aside class="proof">\n      <h2>Origin Attestation</h2>\n${rows}\n    </aside>`

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
