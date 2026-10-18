// Text caption tracks for the dated recordings, derived from each manifest's rendered
// captions so the <track> can never say something the burned-in frame does not.
// Write: node scripts/recording-tracks.mjs   (verify-recordings.mjs checks the result)
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

export const SHOTS = ['shot01', 'shot02', 'shot04']
const root = new URL('../', import.meta.url)

const stamp = (s) => {
  const ms = Math.round(s * 1000)
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`
}

// captions[0] is the persistent disclosure tag (whole take); it becomes a NOTE, and the
// figcaption already states it. The remaining captions become cues in order.
export function vttFor(run) {
  const [tag, ...cues] = run.render.captions
  return [
    'WEBVTT',
    '',
    `NOTE ${tag.text}`,
    ...cues.flatMap((c, i) => ['', String(i + 1), `${stamp(c.from_s)} --> ${stamp(c.to_s)}`, c.text]),
    '',
  ].join('\n')
}

export const loadRun = (shot) => JSON.parse(fs.readFileSync(new URL(`scripts/recordings/${shot}.json`, root)))
export const trackName = (run) => run.render.output.replace(/\.mp4$/, '.vtt')

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const shot of SHOTS) {
    const run = loadRun(shot)
    fs.writeFileSync(new URL(`public/video/${trackName(run)}`, root), vttFor(run))
    console.log(`${shot}: wrote public/video/${trackName(run)}`)
  }
}
