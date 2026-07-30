#!/usr/bin/env node
// Run the deterministic fleet-verifier benchmark and publish the report to
// public/trust/fleet-verify-bench.json — same discipline as floor-gate-bench:
// committed, servable, seeded, digest-pinned; a diff in this file means the
// verifier or the planner changed, which is exactly what a reviewer wants to
// see in a commit.
//
//   node scripts/fleet-bench.mjs           # write the artifact
//   node scripts/fleet-bench.mjs --check   # fail if the committed artifact is stale

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'

const WEB = resolve(dirname(new URL(import.meta.url).pathname), '..')
const OUT = join(WEB, 'public', 'trust', 'fleet-verify-bench.json')
const SEED = 20260731
const TRIALS = 100

const tmp = mkdtempSync(join(tmpdir(), 'fleet-bench-'))
try {
  const bundle = join(tmp, 'fleetBench.mjs')
  execFileSync('npx', ['--no-install', 'esbuild', join(WEB, 'server', 'fleetBench.ts'), '--bundle', '--format=esm', `--outfile=${bundle}`], {
    cwd: WEB,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  const { runFleetBench } = await import(bundle)
  const report = runFleetBench({ trialsPerClass: TRIALS, seed: SEED })
  const serialized = `${JSON.stringify(report, null, 2)}\n`

  if (process.argv.includes('--check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
    if (current !== serialized) {
      console.error('fleet-bench: STALE — public/trust/fleet-verify-bench.json does not match the verifier/planner in source.')
      console.error('Run `node scripts/fleet-bench.mjs` and commit the diff (the diff IS the review artifact).')
      process.exit(1)
    }
    console.log(`fleet-bench: artifact matches source (digest ${report.digest.slice(0, 16)}…).`)
  } else {
    writeFileSync(OUT, serialized)
    const voidClasses = Object.values(report.classes).filter((c) => c.expected === 'VOID')
    console.log(
      `fleet-bench: ${Object.keys(report.classes).length} classes x ${TRIALS} trials — ` +
        `violation catch ${Math.round((voidClasses.reduce((s, c) => s + c.catchRate, 0) / voidClasses.length) * 100)}%, ` +
        `false-VOID rate ${report.falseVoidRate}, escape-hatch plans observed ${report.escapeHatch.plans} — digest ${report.digest.slice(0, 16)}… → ${OUT}`,
    )
    if (report.falseVoidRate !== 0) {
      console.error('fleet-bench: FAIL — the verifier voided a clean fully-deconflicted plan. Regression; do not publish.')
      process.exit(1)
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
