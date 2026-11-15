/// <reference types="node" />

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Release 6 Phase 1 — Style Lock: no blue in served source.
// The site uses paper, ink and one forest-green accent. These are the blue and teal values that
// earlier passes left in served stylesheets, pages and scripts. Served source is every top-level
// page, every page and stylesheet under public/ except the byte-preserved legal text, and every
// stylesheet and script under src/ (tests excluded). The hex values are kept without their "#"
// so a text search for one finds the offending file, not this test.
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BLUE_HEX = ['2f6df6', '4f86ff', '5f86ff', '0891b2', 'cfdcff', 'bcccff', 'cfe0ff']
const BLUE = [
  ...BLUE_HEX.map((hex) => new RegExp(`#${hex}`, 'i')),
  /rgba\(\s*42\s*,\s*86\s*,\s*232\b/i,
]

const rel = (file: string): string => path.relative(appRoot, file).split(path.sep).join('/')

const walk = (dir: string, keep: (file: string) => boolean, out: string[] = []): string[] => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, keep, out)
    else if (entry.isFile() && keep(full)) out.push(full)
  }
  return out
}

const servedSource = (): string[] => [
  ...fs.readdirSync(appRoot).filter((name) => name.endsWith('.html')).map((name) => path.join(appRoot, name)),
  ...walk(path.join(appRoot, 'public'), (file) => /\.(css|html)$/.test(file) && !rel(file).startsWith('public/legal/')),
  ...walk(path.join(appRoot, 'src'), (file) => /\.(css|ts|tsx)$/.test(file) && !/\.test\./.test(path.basename(file))),
]

const blueHits = (file: string, text: string): string[] =>
  text.split('\n').flatMap((line, i) => BLUE.flatMap((re) => {
    const match = line.match(re)
    return match ? [`${rel(file)}:${i + 1} ${match[0]}`] : []
  }))

describe('Style Lock: served source holds no blue', () => {
  const files = servedSource()

  it('reads the pages, stylesheets and scripts the site serves', () => {
    const names = files.map(rel)
    for (const expected of ['index.html', 'public/home.css', 'public/404.html', 'src/App.css', 'src/home/enhance.ts']) {
      expect(names).toContain(expected)
    }
    expect(names.some((name) => name.startsWith('public/legal/'))).toBe(false)
    expect(names.some((name) => /\.test\./.test(name))).toBe(false)
  })

  it('recognises every listed blue in any letter case', () => {
    const sample = [...BLUE_HEX.map((hex) => `color: #${hex.toUpperCase()};`), 'box-shadow: 0 0 0 3px rgba(42, 86, 232, .2);']
    expect(sample.flatMap((line) => blueHits('sample.css', line))).toHaveLength(BLUE.length)
  })

  it('finds none of them in served source', () => {
    const hits = files.flatMap((file) => blueHits(file, fs.readFileSync(file, 'utf8')))
    expect(hits).toEqual([])
  })

  // A colour built from a per-item hue variable cannot be checked here, and the passport
  // avatars drew navy and teal that way (hues 188 to 220).
  it('builds no colour from a hue variable', () => {
    const hits = files.flatMap((file) => fs.readFileSync(file, 'utf8').split('\n')
      .flatMap((line, i) => (/hsla?\(\s*var\(/i.test(line) ? [`${rel(file)}:${i + 1}`] : [])))
    expect(hits).toEqual([])
  })
})
