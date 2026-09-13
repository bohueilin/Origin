import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('Pages /api deployment ownership', () => {
  it('routes /api traffic to the three explicit Pages Function authorities', () => {
    const routes = JSON.parse(fs.readFileSync(path.join(appRoot, 'public/_routes.json'), 'utf8')) as { include: string[]; exclude: string[] }
    expect(routes.include).toContain('/api/*')
    expect(routes.exclude).toEqual([])
    for (const relative of ['functions/api/lead.ts', 'functions/api/foundry/parse-floor.ts', 'functions/api/evidence/status.ts']) {
      expect(fs.existsSync(path.join(appRoot, relative)), relative).toBe(true)
    }
  })
})
