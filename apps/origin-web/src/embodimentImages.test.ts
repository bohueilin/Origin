// Every robot type a customer can pick must be complete: a physics profile the
// oracle uses, a grid code, and an original reference illustration that ships
// in public/robots/. Adding a type without all three fails here.

import { describe, expect, it } from 'vitest'
import { EMBODIMENT_CODE, ROBOT_EMBODIMENTS, getEmbodimentProfile } from './environmentPlan'
import { embodimentMedia } from './embodimentImages'

const SVGS = import.meta.glob('../public/robots/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const shipped = new Set(Object.keys(SVGS).map((k) => '/robots/' + k.split('/').pop()))

describe('robot types are complete', () => {
  const pickable = ROBOT_EMBODIMENTS.filter((e) => e !== 'other')

  it('offers the ten reference types', () => {
    expect(pickable).toEqual(['humanoid', 'carrier', 'dog', 'amr', 'arm', 'drone', 'forklift', 'tugger', 'scrubber', 'delivery'])
  })

  it.each(pickable)('%s has a profile, a code and a shipped illustration', (e) => {
    const profile = getEmbodimentProfile(e)
    expect(profile.label.length).toBeGreaterThan(0)
    expect(profile.batteryMul).toBeGreaterThan(0)
    expect(profile.stepMul).toBeGreaterThan(0)
    expect(EMBODIMENT_CODE[e]).toMatch(/^[A-Z]{2}$/)
    const media = embodimentMedia(e)
    expect(media?.src).toMatch(/^\/robots\/[a-z]+\.svg$/)
    expect(shipped.has(media!.src), `${media!.src} is missing from public/robots/`).toBe(true)
  })

  it('illustrations carry no text, raster images or brand-able marks', () => {
    for (const [path, svg] of Object.entries(SVGS)) {
      expect(svg, path).not.toMatch(/<text[\s>]|<image[\s>]|<linearGradient|<radialGradient|<filter[\s>]/)
    }
  })
})
