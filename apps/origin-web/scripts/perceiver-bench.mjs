#!/usr/bin/env node
// perceiver-bench — manufacture the paired dataset and (optionally) run the
// pre-registered multi-arm experiment against a live Perceiver.
//
//   node scripts/perceiver-bench.mjs                                  # dataset only
//   node scripts/perceiver-bench.mjs --floors 24 --api-base http://localhost:8787
//   node scripts/perceiver-bench.mjs --floors 24 --arms A0,A0R,A1,A2 --api-base …
//   --min-scored 0.9   run-validity floor: fraction of rows each live arm must
//                      score, else the run exits nonzero with NO report written
//
// Arms (fixed table — the experiment design is pre-registered, not ad hoc):
//   A0  refs off, legend    → the baseline
//   A0R identical to A0     → the NOISE FLOOR: any claimed improvement must
//                             exceed what re-running the same config produces
//   A1  refs on,  legend    → the render effect alone (printed grid numbers)
//   A2  refs on,  counting  → render + read-not-count prompt procedure
//
// Offline mode writes bench-out/ (gitignored): PNGs per (floor, style, refs),
// labels.jsonl with exact ground truth, and a provenance manifest. Live mode
// runs each requested arm sequentially (paced; a retried row is the same row),
// scores with the deterministic scorer, and emits per-arm grouped aggregates +
// PAIRED same-floor same-style deltas with an exact sign test.

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
// Run-validity floor: any live arm scoring under this fraction voids the run
// (unparsed rows shrink the means' denominator — a lossy run flatters itself).
const MIN_SCORED = Number(flag('--min-scored') ?? 0.9)
if (!Number.isFinite(MIN_SCORED) || MIN_SCORED < 0 || MIN_SCORED > 1) throw new Error('--min-scored must be a fraction in [0, 1]')
const ARMS_TABLE = {
  A0: { gridRefs: false, variant: 'legend' },
  A0R: { gridRefs: false, variant: 'legend' },
  A1: { gridRefs: true, variant: 'legend' },
  A2: { gridRefs: true, variant: 'counting' },
}
const ARM_NAMES = (flag('--arms') ?? 'A0').split(',').map((s) => s.trim()).filter(Boolean)
for (const a of ARM_NAMES) if (!ARMS_TABLE[a]) throw new Error(`unknown arm ${a} (valid: ${Object.keys(ARMS_TABLE).join(', ')})`)

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
const { scoreParse, aggregateScoresBy, pairedCompare, genScenarioFloor, deriveUnparsedCause, checkMinScored, reportDigest } = await import(
  bundle('server/perceiverScore.ts')
)

// ---- 1. manufacture the paired dataset (v2: refs on AND off per floor/style) --
// Scenario floors (not plain genFloor): the set mixes finish / refuse /
// escalate ground truths, so the verdict-agreement metric CAN fail — a metric
// that cannot fail is not a metric (adversarial-review finding).
mkdirSync(join(OUT, 'images'), { recursive: true })
const rows = [] // one row per (floor, style); refs variant is arm-time
const gtVerdicts = {}
for (let i = 0; i < FLOORS; i += 1) {
  const { floor, expectedVerdict, scenario } = genScenarioFloor(SEED_BASE + i)
  gtVerdicts[expectedVerdict] = (gtVerdicts[expectedVerdict] ?? 0) + 1
  for (const style of RENDER_STYLES) {
    for (const gridRefs of [false, true]) {
      const { png } = renderFloorPng(floor, style, { gridRefs })
      const file = `floor-${String(i).padStart(4, '0')}-${style}${gridRefs ? '-refs' : ''}.png`
      writeFileSync(join(OUT, 'images', file), png)
    }
    rows.push({ id: `${i}-${style}`, style, scenario, gt_verdict: expectedVerdict, ground_truth: floor })
  }
}
writeFileSync(
  join(OUT, 'labels.jsonl'),
  rows.map((r) => JSON.stringify({ ...r, files: { plain: `images/floor-${r.id.split('-')[0].padStart(4, '0')}-${r.style}.png`, refs: `images/floor-${r.id.split('-')[0].padStart(4, '0')}-${r.style}-refs.png` } })).join('\n') + '\n',
)
// Manifest carries a canonical-JSON sha256 self-digest so any downstream
// transcription (e.g. a hand-assembled /trust companion) can cite the exact
// dataset build it derives from.
const manifestBody = {
  dataset: 'origin-synthetic-floors-v2',
  pairs: rows.length * 2,
  floors: FLOORS,
  styles: RENDER_STYLES,
  grid_refs: [false, true],
  seed_base: SEED_BASE,
  // Verdict diversity, on the record: a set that is all-'finish' cannot
  // fail the verdict-agreement metric.
  gt_verdicts: gtVerdicts,
  rights: {
    // Provenance is backed by construction — the code below this comment
    // demonstrably generates every byte. It is the only claim made here:
    // ownership/licensing conclusions are legal judgments this manifest
    // cannot evidence and deliberately does not assert.
    provenance: 'Fully synthetic. Layouts procedurally generated (server/perceiverScore.ts genScenarioFloor); images rendered from those layouts (server/floorRender.ts). No third-party imagery, scans, floor plans, or datasets were used as inputs.',
    labeled_synthetic: true,
    note: 'This manifest documents provenance only; it is not a license grant or legal advice.',
  },
  regenerate: 'node scripts/perceiver-bench.mjs — layouts and pixel content are deterministic from seed_base. (PNG bytes can differ across zlib builds; decoded pixels do not.)',
}
const manifest = { ...manifestBody, digest: reportDigest(manifestBody) }
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`dataset v2: ${rows.length} (floor,style) rows × refs on/off → ${rows.length * 2} images → ${OUT}`)
console.log(`manifest digest: ${manifest.digest}`)

// ---- 2. optionally run the requested arms against a live Perceiver ----------
if (!API) {
  console.log('no --api-base: dataset built, live scoring skipped. Point --api-base at a server with CEREBRAS_API_KEY to run arms.')
  process.exit(0)
}

// Pace the run: Cerebras enforces a requests-per-minute cap (19/24 unpaced
// requests died on the first real run). A retried row is the SAME row.
const DELAY_MS = Number(flag('--delay-ms') ?? 2500)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let firstCall = true

async function runArm(armName) {
  const arm = ARMS_TABLE[armName]
  const results = [] // { id, condition, score }
  const fallbacks = {}
  const gateVerdicts = { VALID: 0, ESCALATE: 0, VOID: 0 }
  for (const row of rows) {
    const png = renderFloorPng(row.ground_truth, row.style, { gridRefs: arm.gridRefs }).png
    const hint = styleHint(row.style, { gridRefs: arm.gridRefs, variant: arm.variant })
    const dataUri = `data:image/png;base64,${png.toString('base64')}`
    let res = null
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (!firstCall) await sleep(attempt === 0 ? DELAY_MS : DELAY_MS * 2 ** attempt)
      firstCall = false
      try {
        const r = await fetch(`${API}/api/foundry/parse-floor`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ imageDataUri: dataUri, hint }),
        })
        res = await r.json()
      } catch {
        res = { fallback: 'network' }
      }
      if (res.fallback !== 'api_error' && res.fallback !== 'network') break
      process.stdout.write('r')
    }
    if (res.fallback) fallbacks[res.fallback] = (fallbacks[res.fallback] ?? 0) + 1
    if (res.gate?.verdict) gateVerdicts[res.gate.verdict] = (gateVerdicts[res.gate.verdict] ?? 0) + 1
    // Per-row cause: a gate VOID, a bad_json refusal, and a retried-out
    // api_error are different facts — each unparsed row records which one it
    // was, instead of collapsing into arm-level counters only.
    const cause = deriveUnparsedCause(res)
    results.push({
      id: row.id,
      condition: { style: row.style, gridRefs: arm.gridRefs, variant: arm.variant },
      ...(cause ? { unparsed_cause: cause } : {}),
      score: scoreParse(row.ground_truth, res.siteMap ?? null, cause ?? undefined),
    })
    process.stdout.write('.')
  }
  console.log(` ${armName} done`)
  return {
    condition: arm,
    grouped: aggregateScoresBy(results.map((r) => ({ condition: r.condition, score: r.score }))),
    gateVerdicts,
    fallbacks,
    results,
  }
}

const arms = {}
for (const name of ARM_NAMES) {
  console.log(`arm ${name} (${JSON.stringify(ARMS_TABLE[name])}) — ${rows.length} requests`)
  arms[name] = await runArm(name)
}

// Paired deltas between arms that both ran (same floors, same styles).
const paired = {}
const pairKey = (x, y) => `${x}_vs_${y}`
const wantPairs = [
  ['A1', 'A0'],
  ['A2', 'A0'],
  ['A2', 'A1'],
]
for (const [x, y] of wantPairs) {
  if (arms[x] && arms[y]) paired[pairKey(x, y)] = pairedCompare(arms[x].results, arms[y].results)
}
const noiseFloor = arms.A0R && arms.A0 ? pairedCompare(arms.A0R.results, arms.A0.results) : null

// Run-validity guard, BEFORE any report exists: a run that lost too many rows
// to infra (api_error/network/no_key) still shrinks the scored denominator, so
// its headline means are not comparable. Refuse to write a report at all.
const lowMeasured = checkMinScored(
  Object.fromEntries(Object.entries(arms).map(([k, v]) => [k, { scored: v.grouped.overall.scored, n: v.grouped.overall.n }])),
  MIN_SCORED,
)
if (lowMeasured.length > 0) {
  console.error(`\nMIN-SCORED GUARD FAILED (--min-scored ${MIN_SCORED}): NO REPORT WRITTEN.`)
  for (const v of lowMeasured) {
    console.error(`  arm ${v.arm}: scored ${v.scored}/${v.n} (${(v.fraction * 100).toFixed(1)}%) — see that arm's fallbacks / unparsedBreakdown for the cause split`)
  }
  console.error('Headline means over a partially-measured run flatter themselves via denominator shrinkage. Fix the infra and re-run (or lower --min-scored deliberately).')
  process.exit(1)
}

const report = {
  bench: 'perceiver-bench@2',
  scope:
    'Synthetic rendered plans (origin-synthetic-floors-v2), scored by the deterministic scorer. Deltas are PAIRED same-floor same-style comparisons; the A0R-vs-A0 noise floor bounds what an identical config produces. Numbers hold under THIS scorer on THIS dataset — no broader claim.',
  api: API,
  floors: FLOORS,
  gt_verdicts: gtVerdicts,
  arms: Object.fromEntries(Object.entries(arms).map(([k, v]) => [k, { condition: v.condition, grouped: v.grouped, gateVerdicts: v.gateVerdicts, fallbacks: v.fallbacks }])),
  paired,
  noiseFloor,
}
// Self-digest of the report body (canonical JSON, sha256) — the transcription
// seam: a hand-assembled companion (preregistration/caveats/notes) can cite
// raw_report_digest to pin exactly which raw run it transcribed.
const finalReport = { ...report, raw_report_digest: reportDigest(report) }
writeFileSync(join(OUT, 'perceiver-report.json'), JSON.stringify(finalReport, null, 2) + '\n')
console.log(JSON.stringify({ ...report, arms: Object.fromEntries(Object.entries(report.arms).map(([k, v]) => [k, v.grouped.overall])) }, null, 2))
console.log(`raw_report_digest: ${finalReport.raw_report_digest}`)
const anyScored = Object.values(arms).some((a) => a.grouped.overall.scored > 0)
if (!anyScored) {
  console.error('\nNo parses were scored in any arm (see fallbacks). Set CEREBRAS_API_KEY on the target and re-run.')
  process.exit(1)
}
