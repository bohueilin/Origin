/// <reference types="node" />

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = path.resolve(appRoot, '../..')
const script = path.join(appRoot, 'scripts/stage-pages-deploy.mjs')
const temps: string[] = []

const tempDir = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'origin-pages-stage-test-'))
  temps.push(directory)
  return directory
}

const runStage = (out: string): void => {
  execFileSync(process.execPath, [script, '--out', out], {
    cwd: repoRoot,
    stdio: 'pipe',
  })
}

const filesBelow = (directory: string): string[] => {
  const result: string[] = []
  const visit = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else result.push(path.relative(directory, absolute).split(path.sep).join('/'))
    }
  }
  visit(directory)
  return result.sort()
}

const treeDigest = (directory: string): string => {
  const hash = createHash('sha256')
  for (const relative of filesBelow(directory)) {
    hash.update(relative)
    hash.update('\0')
    hash.update(fs.readFileSync(path.join(directory, relative)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

afterEach(() => {
  for (const directory of temps.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('stage-pages-deploy', () => {
  it('stages exactly the public Pages routes without mutating the downloaded site artifact', () => {
    const root = tempDir()
    const stage = path.join(root, 'stage')
    const artifact = path.join(root, 'origin-web-dist')
    fs.mkdirSync(path.join(artifact, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(artifact, 'index.html'), '<!doctype html>')
    fs.writeFileSync(path.join(artifact, 'assets', 'app.js'), 'artifact bytes')
    const before = treeDigest(artifact)

    runStage(stage)

    expect(fs.existsSync(path.join(stage, '.origin-pages-stage'))).toBe(true)
    expect(filesBelow(path.join(stage, 'functions'))).toEqual([
      'api/evidence/status.ts',
      'api/foundry/parse-floor.ts',
      'api/lead.ts',
    ])
    expect(fs.existsSync(path.join(stage, 'server', 'requestAuth.ts'))).toBe(true)
    expect(fs.existsSync(path.join(stage, 'src', 'foundry', 'types.ts'))).toBe(true)
    expect(treeDigest(artifact)).toBe(before)
  })

  it('rejects broad, symlink-resolved, and unmarked nonempty output directories', () => {
    const root = tempDir()
    const populated = path.join(root, 'populated')
    fs.mkdirSync(populated)
    fs.writeFileSync(path.join(populated, 'keep.txt'), 'must not be deleted')
    const linkedRoot = path.join(root, 'linked-root')
    fs.symlinkSync(repoRoot, linkedRoot)

    for (const unsafe of [path.parse(repoRoot).root, repoRoot, os.homedir(), linkedRoot, populated]) {
      expect(() => runStage(unsafe)).toThrow()
    }
    expect(fs.readFileSync(path.join(populated, 'keep.txt'), 'utf8')).toBe('must not be deleted')
  })

  it('keeps the release workflow manual, main-bound, pinned, and stage-scoped', () => {
    const deploy = fs.readFileSync(path.join(repoRoot, '.github/workflows/deploy-origin-web.yml'), 'utf8')
    const ci = fs.readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8')

    expect(deploy).toContain("if: github.event_name == 'workflow_dispatch' && inputs.confirm == 'DEPLOY' && github.ref == 'refs/heads/main'")
    expect(deploy).toContain('environment:\n      name: production')
    expect(deploy).toContain('cloudflare/wrangler-action@9acf94ace14e7dc412b076f2c5c20b8ce93c79cd')
    expect(deploy).toContain('workingDirectory: .origin-pages-stage')
    expect(deploy).toContain('command: pages deploy ../origin-web-dist --project-name=origin-physical-ai')
    expect(deploy).toContain('npm exec --yes --package=wrangler@4.92.0 -- wrangler pages functions build functions --outdir .wrangler-pages-build')
    expect(deploy).not.toContain('hud-factorydad-1')
    expect(deploy).not.toContain('rm -rf functions server src')
    expect(deploy).toContain('stage-pages-deploy.mjs --out .origin-pages-stage')

    expect(ci).toContain('browser-e2e:')
    expect(ci).toContain('pages-stage:')
    expect(ci).toContain('production-audit:')
    expect(ci).toContain('npm audit --omit=dev --audit-level=moderate')
    expect(ci).toContain('npm exec --yes --package=wrangler@4.92.0 -- wrangler pages functions build functions --outdir .wrangler-pages-build')
    expect(ci).toContain('needs: [workspace-apps, chronos-ui, python-services, functions-typecheck, evidence-verify, secret-scan, honesty-lint, browser-e2e, pages-stage, production-audit]')
  })
})
