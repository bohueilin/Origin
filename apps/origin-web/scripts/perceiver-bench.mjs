#!/usr/bin/env node
// perceiver-bench — manufacture the paired dataset and (optionally) score the
// live Perceiver against it.
//
//   node scripts/perceiver-bench.mjs                       # build the dataset only
//   node scripts/perceiver-bench.mjs --floors 40           # bigger set
//   node scripts/perceiver-bench.mjs --api-base http://localhost:8787
//   node scripts/perceiver-bench.mjs --api-base https://origin-physical-ai.pages.dev
//
// Offline mode writes bench-out/ (gitignored): PNG per (floor, style),
// labels.jsonl with the exact ground-truth grid, and a rights manifest —
// every image is generated HERE from layouts generated HERE, so the pairs are
// rights-clean by construction and labeled synthetic.
//
// Live mode posts each image to /api/foundry/parse-floor and scores the result
// with the deterministic scorer (per-role F1, anchor accuracy, verdict
// agreement). Fallback responses (no_key etc.) are reported, not scored — the
// bench never pretends a refusal was a parse.

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'

const WEB = resolve(dirname(new URL(import.meta.url).pathname), '..')
const OUT = join(WEB, 'bench-out')
const SEED_BASE = 500_000 // disjoint from the gate bench's floor seeds
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : null
}
const FLOORS = Number(flag('--floors') ?? 24)
const API = flag('--api-base')?.replace(/\/+$/, '') ?? null

// Bundle the TS modules once (esbuild ships with vite).
const tmp = mkdtempSync(join(tmpdir(), 'perceiver-bench-'))
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }))
const bundle = (entry) => {
  const out = join(tmp, `${entry.replace(/[/.]/g, '_')}.mjs`)
  execFileSync('npx', ['--no-install', 'esbuild', join(WEB, entry), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`], {
    cwd: WEB,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  return out
}
const { renderFloorPng, styleHint, RENDER_STYLES } = await import(bundle('server/floorRender.ts'))
const { scoreParse, aggregateScores, genScenarioFloor } = await import(bundle('server/perceiverScore.ts'))

// ---- 1. manufacture the paired dataset --------------------------------------
// Scenario floors (not plain genFloor): the set mixes finish / refuse /
// escalate ground truths, so the verdict-agreement metric CAN fail — a metric
// that cannot fail is not a metric (adversarial-review finding).
mkdirSync(join(OUT, 'images'), { recursive: true })
const rows = []
const gtVerdicts = {}
for (let i = 0; i < FLOORS; i += 1) {
  const { floor, expectedVerdict, scenario } = genScenarioFloor(SEED_BASE + i)
  gtVerdicts[expectedVerdict] = (gtVerdicts[expectedVerdict] ?? 0) + 1
  for (const style of RENDER_STYLES) {
    const { png } = renderFloorPng(floor, style)
    const file = `floor-${String(i).padStart(4, '0')}-${style}.png`
    writeFileSync(join(OUT, 'images', file), png)
    rows.push({ id: `${i}-${style}`, file: `images/${file}`, style, scenario, gt_verdict: expectedVerdict, hint: styleHint(style), ground_truth: floor })
  }
}
writeFileSync(join(OUT, 'labels.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
writeFileSync(
  join(OUT, 'manifest.json'),
  JSON.stringify(
    {
      dataset: 'origin-synthetic-floors-v1',
      pairs: rows.length,
      floors: FLOORS,
      styles: RENDER_STYLES,
      seed_base: SEED_BASE,
      // Verdict diversity, on the record: a set that is all-'finish' cannot
      // fail the verdict-agreement metric.
      gt_verdicts: gtVerdicts,
      rights: {
        // Provenance is backed by construction — the code below this comment
        // demonstrably generates every byte. It is the only claim made here:
        // ownership/licensing conclusions are legal judgments this manifest
        // cannot evidence and deliberately does not assert.
        provenance: 'Fully synthetic. Layouts procedurally generated (server/gateBench.ts genFloor); images rendered from those layouts (server/floorRender.ts). No third-party imagery, scans, floor plans, or datasets were used as inputs.',
        labeled_synthetic: true,
        note: 'This manifest documents provenance only; it is not a license grant or legal advice.',
      },
      regenerate: 'node scripts/perceiver-bench.mjs — layouts and pixel content are deterministic from seed_base. (PNG bytes can differ across zlib builds; decoded pixels do not.)',
    },
    null,
    2,
  ) + '\n',
)
console.log(`dataset: ${rows.length} paired (image ↔ ground-truth grid) samples → ${OUT}`)

// ---- 2. optionally score a live Perceiver -----------------------------------
if (!API) {
  console.log('no --api-base: dataset built, live scoring skipped. Point --api-base at a server with CEREBRAS_API_KEY to measure the Perceiver.')
  process.exit(0)
}

const scores = []
const fallbacks = {}
let gateVerdicts = { VALID: 0, ESCALATE: 0, VOID: 0 }
for (const row of rows) {
  const png = renderFloorPng(row.ground_truth, row.style).png
  const dataUri = `data:image/png;base64,${png.toString('base64')}`
  let res
  try {
    const r = await fetch(`${API}/api/foundry/parse-floor`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageDataUri: dataUri, hint: row.hint }),
    })
    res = await r.json()
  } catch (e) {
    fallbacks.network = (fallbacks.network ?? 0) + 1
    scores.push(scoreParse(row.ground_truth, null))
    continue
  }
  if (res.fallback) fallbacks[res.fallback] = (fallbacks[res.fallback] ?? 0) + 1
  if (res.gate?.verdict) gateVerdicts[res.gate.verdict] = (gateVerdicts[res.gate.verdict] ?? 0) + 1
  scores.push(scoreParse(row.ground_truth, res.siteMap ?? null))
  process.stdout.write('.')
}
console.log()
const agg = aggregateScores(scores)
const report = {
  bench: 'perceiver-bench@1',
  scope: 'Synthetic rendered plans (origin-synthetic-floors-v1), scored by the deterministic scorer. Numbers hold under THIS scorer on THIS dataset — no broader claim.',
  api: API,
  gt_verdicts: gtVerdicts,
  aggregate: agg,
  gateVerdicts,
  fallbacks,
}
writeFileSync(join(OUT, 'perceiver-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (Object.keys(fallbacks).length && agg.scored === 0) {
  console.error('\nNo parses were scored (see fallbacks). Set CEREBRAS_API_KEY on the target and re-run.')
  process.exit(1)
}
