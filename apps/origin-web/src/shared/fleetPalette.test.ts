// Pins the fleet palette the owner chose (Pass 2, Phase 3 in
// docs/design/2026-11-12-site-pass-decisions.md): six exact colours, no blue or teal,
// each readable as text on the paper ground and on white.
import { describe, expect, it } from 'vitest'
import { FLEET_COLORS, FLEET_COLORS_HEX } from './fleetPalette'
import { buildWarehouseScene } from '../simulation/warehouseSim'
import { runShift } from '../simulation/opsMetrics'

// WCAG 2 relative luminance and contrast ratio.
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('fleet palette', () => {
  it('is the six Style Lock colours, in fleet order', () => {
    expect(FLEET_COLORS).toEqual(['#2b523b', '#8a5200', '#6940a3', '#9d2e68', '#4a4238', '#525e2c'])
  })

  it('gives three.js the same colours as numbers', () => {
    expect(FLEET_COLORS_HEX).toEqual([0x2b523b, 0x8a5200, 0x6940a3, 0x9d2e68, 0x4a4238, 0x525e2c])
  })

  it('holds at least 4.5:1 on the paper ground and on white', () => {
    for (const colour of FLEET_COLORS) {
      expect(contrast(colour, '#f8f7f4'), `${colour} on paper`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(colour, '#ffffff'), `${colour} on white`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

// Release 6 Phase 1 — sim palette: the /simulation and /operations warehouse robots wear the
// same six fleet colours, robot n in fleet colour n, whatever the seed or fleet size.
describe('warehouse robots wear the fleet palette', () => {
  it('colours robot n with fleet colour n, for every fleet size the pages offer', () => {
    for (const seed of [20260713, 777, 1]) {
      for (let robots = 2; robots <= 6; robots += 1) {
        const colours = buildWarehouseScene({ seed, robots }).robots.map((r) => r.color)
        expect(colours, `seed ${seed}, ${robots} robots`).toEqual(FLEET_COLORS.slice(0, robots))
      }
    }
  })

  it('uses the same colours in every wave of an operations shift', () => {
    for (const wave of runShift(777, 6, 6).waves) {
      expect(buildWarehouseScene({ seed: wave.seed, robots: 6 }).robots.map((r) => r.color)).toEqual([...FLEET_COLORS])
    }
  })

  it('keeps white robot labels at 4.5:1 or more on every robot colour', () => {
    for (const robot of buildWarehouseScene({ robots: 6 }).robots) {
      expect(contrast('#ffffff', robot.color), robot.color).toBeGreaterThanOrEqual(4.5)
    }
  })
})
