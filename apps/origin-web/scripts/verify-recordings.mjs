// Integrity/provenance check for the published encodes; raw masters stay outside Git.
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { requireRelease } from './recLib.mjs'
const sha = path => createHash('sha256').update(fs.readFileSync(path)).digest('hex')
const root = new URL('../', import.meta.url)
for (const shot of ['shot01', 'shot02', 'shot04']) {
  const run = JSON.parse(fs.readFileSync(new URL(`scripts/recordings/${shot}.json`, root)))
  requireRelease(run.release)
  if (run.commit !== run.release.commit) throw new Error(`${shot}: inconsistent release commit`)
  if (sha(new URL(`scripts/fonts/${run.font}`, root)) !== run.font_sha256) throw new Error(`${shot}: font changed`)
  for (const [file, digest] of [[run.render.output, run.render.sha256], [run.render.poster, run.render.poster_sha256]]) {
    if (!new RegExp(`^${shot}-\\d{4}-\\d{2}-\\d{2}\\.(mp4|webp)$`).test(file)) throw new Error(`${shot}: undated filename`)
    if (sha(new URL(`public/video/${file}`, root)) !== digest) throw new Error(`${shot}: ${file} changed`)
  }
  const spec = JSON.parse(fs.readFileSync(new URL(`scripts/captions/${shot}.json`, root)))
  const facts = { ...run.facts, date: run.date, host: run.host, commit: run.commit }
  const resolve = text => text.replace(/\{([^}]+)\}/g, (_, key) => {
    if (facts[key] == null) throw new Error(`${shot}: missing ${key}`)
    return String(facts[key])
  })
  const expected = [spec.tag, ...spec.captions.map(c => c.text)].map(resolve)
  if (JSON.stringify(expected) !== JSON.stringify(run.render.captions.map(c => c.text))) throw new Error(`${shot}: caption text differs from recorded render`)
  if (run.render.caption_px < 44 || run.render.tag_px < 30 || JSON.stringify(run.render.tag_xy) !== '[24,24]') throw new Error(`${shot}: unreadable disclosure`)
  console.log(`${shot}: dated encode, poster, captions, font and release provenance match`)
}
