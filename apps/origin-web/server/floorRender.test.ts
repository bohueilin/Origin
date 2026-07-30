// floorRender — behavioral spec, written BEFORE the implementation (TDD).
//
// A dependency-free renderer that turns a ground-truth floor layout into a
// synthetic plan IMAGE (real PNG bytes, node:zlib only). This is the
// rights-clean paired-data lane: the paired-capture datasets a Perceiver wants
// (photo ↔ floorplan) are red/yellow-gated everywhere commercial training
// matters, so we MANUFACTURE pairs from layouts we own outright — perfect
// ground truth, no license to inherit. Deterministic: same layout+style →
// identical bytes.

import { describe, expect, it } from 'vitest'
import { inflateSync } from 'node:zlib'
import { renderFloorPng, RENDER_STYLES } from './floorRender'
import { genFloor } from './gateBench'

const floor = genFloor(11)

/** Decode our own filter-0 RGBA PNG back to pixels for spot checks. */
function decode(png: Buffer): { width: number; height: number; px: (x: number, y: number) => [number, number, number] } {
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  // Collect every IDAT payload
  const idat: Buffer[] = []
  let off = 8
  while (off < png.length) {
    const len = png.readUInt32BE(off)
    const type = png.subarray(off + 4, off + 8).toString('ascii')
    if (type === 'IDAT') idat.push(png.subarray(off + 8, off + 8 + len))
    off += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = 1 + width * 4
  return {
    width,
    height,
    px: (x, y) => {
      expect(raw[y * stride]).toBe(0) // filter type 0 on every scanline
      const p = y * stride + 1 + x * 4
      return [raw[p], raw[p + 1], raw[p + 2]]
    },
  }
}

describe('renderFloorPng', () => {
  it('emits a valid PNG with dimensions derived from the grid', () => {
    const { png, meta } = renderFloorPng(floor, 'print')
    const img = decode(png)
    expect(img.width).toBe(meta.pxWidth)
    expect(img.height).toBe(meta.pxHeight)
    expect(img.width).toBeGreaterThan(floor.width * 16)
  })

  it('is deterministic per (floor, style) and differs across styles', () => {
    const a = renderFloorPng(floor, 'blueprint').png
    const b = renderFloorPng(floor, 'blueprint').png
    const c = renderFloorPng(floor, 'sketch').png
    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
  })

  it('paints ground truth where the layout says: wall and start cells hit their palette colors', () => {
    const withWall = { ...floor, obstacles: [{ x: 2, y: 2 }, ...floor.obstacles] }
    const { png, meta } = renderFloorPng(withWall, 'print')
    const img = decode(png)
    const center = (cx: number, cy: number): [number, number, number] =>
      img.px(meta.margin + cx * meta.cell + Math.floor(meta.cell / 2), meta.margin + cy * meta.cell + Math.floor(meta.cell / 2))
    expect(center(2, 2)).toEqual(meta.palette.wall)
    expect(center(withWall.start.x, withWall.start.y)).toEqual(meta.palette.start)
  })

  it('covers every advertised style', () => {
    for (const style of RENDER_STYLES) {
      const { png } = renderFloorPng(floor, style)
      expect(png.length).toBeGreaterThan(200)
    }
  })
})
