#!/usr/bin/env node
// Run the deterministic gate benchmark and publish the report to
// public/trust/floor-gate-bench.json — the same pattern as gates-summary.json:
// a committed, servable, re-derivable artifact. The report is seeded and
// digest-pinned, so re-running this script on the same source must produce a
// byte-identical file; a diff here means the GATE changed, which is exactly
// what a reviewer wants to see in a commit.
//
//   node scripts/floor-gate-bench.mjs           # write the artifact
//   node scripts/floor-gate-bench.mjs --check   # fail if the committed artifact is stale
//
// Uses esbuild (already in the toolchain via vite) to bundle the TS bench.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'

const WEB = resolve(dirname(new URL(import.meta.url).pathname), '..')
const OUT = join(WEB, 'public', 'trust', 'floor-gate-bench.json')
const SEED = 20260730
const TRIALS = 200

const tmp = mkdtempSync(join(tmpdir(), 'gate-bench-'))
try {
  const bundle = join(tmp, 'gateBench.mjs')
  execFileSync('npx', ['--no-install', 'esbuild', join(WEB, 'server', 'gateBench.ts'), '--bundle', '--format=esm', `--outfile=${bundle}`], {
    cwd: WEB,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  const { runGateBench } = await import(bundle)
  const report = runGateBench({ trialsPerClass: TRIALS, seed: SEED })
  const serialized = `${JSON.stringify(report, null, 2)}\n`

  if (process.argv.includes('--check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
    if (current !== serialized) {
      console.error('floor-gate-bench: STALE — public/trust/floor-gate-bench.json does not match the gate in source.')
      console.error('Run `node scripts/floor-gate-bench.mjs` and commit the diff (the diff IS the review artifact).')
      process.exit(1)
    }
    console.log(`floor-gate-bench: artifact matches source (digest ${report.digest.slice(0, 16)}…).`)
  } else {
    writeFileSync(OUT, serialized)
    const voidClasses = Object.values(report.classes).filter((c) => c.expected === 'VOID')
    console.log(
      `floor-gate-bench: ${Object.keys(report.classes).length} classes x ${TRIALS} trials — ` +
        `VOID catch ${Math.round((voidClasses.reduce((s, c) => s + c.catchRate, 0) / voidClasses.length) * 100)}%, ` +
        `false-VOID rate ${report.falseVoidRate} — digest ${report.digest.slice(0, 16)}… → ${OUT}`,
    )
    if (report.falseVoidRate !== 0) {
      console.error('floor-gate-bench: FAIL — the gate voided a clean/benign floor. That is a regression; do not publish.')
      process.exit(1)
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
