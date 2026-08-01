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
import { renderFloorPng, RENDER_STYLES, labelRaster, styleHint } from './floorRender'
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

describe('renderFloorPng — gridRefs (printed grid-reference numbers; the counting→reading lever)', () => {
  it('the default render is BYTE-IDENTICAL to a refs-off render (backward compat pinned)', () => {
    const a = renderFloorPng(floor, 'print').png
    const b = renderFloorPng(floor, 'print', {}).png
    const c = renderFloorPng(floor, 'print', { gridRefs: false }).png
    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(true)
  })

  it('refs-on is deterministic, differs from refs-off, and grows the margin without touching floor pixels', () => {
    const off = renderFloorPng(floor, 'print')
    const on = renderFloorPng(floor, 'print', { gridRefs: true })
    const on2 = renderFloorPng(floor, 'print', { gridRefs: true })
    expect(on.png.equals(on2.png)).toBe(true)
    expect(on.png.equals(off.png)).toBe(false)
    expect(on.meta.gridRefs).toBe(true)
    expect(on.meta.margin).toBeGreaterThan(off.meta.margin)
    expect(on.meta.pxWidth).toBe(on.meta.margin * 2 + floor.width * on.meta.cell)
    // floor-area ground truth unchanged: same palette assertions as refs-off
    const withWall = { ...floor, obstacles: [{ x: 2, y: 2 }, ...floor.obstacles] }
    const { png, meta } = renderFloorPng(withWall, 'print', { gridRefs: true })
    const img = decode(png)
    const center = (cx: number, cy: number): [number, number, number] =>
      img.px(meta.margin + cx * meta.cell + Math.floor(meta.cell / 2), meta.margin + cy * meta.cell + Math.floor(meta.cell / 2))
    expect(center(2, 2)).toEqual(meta.palette.wall)
    expect(center(withWall.start.x, withWall.start.y)).toEqual(meta.palette.start)
  })

  it('prints ink in the top margin band over every column when on; the band is pure background when off', () => {
    const on = renderFloorPng(floor, 'print', { gridRefs: true })
    const off = renderFloorPng(floor, 'print')
    const imgOn = decode(on.png)
    const imgOff = decode(off.png)
    const bg = on.meta.palette.bg
    const inkInBand = (img: ReturnType<typeof decode>, meta: typeof on.meta, cx: number): number => {
      let ink = 0
      const x0 = meta.margin + cx * meta.cell
      // stop above the outer wall band (it begins at margin-3 in both modes)
      for (let y = 2; y < meta.margin - 3; y += 1)
        for (let x = x0; x < x0 + meta.cell; x += 1) {
          const p = img.px(x, y)
          if (p[0] !== bg[0] || p[1] !== bg[1] || p[2] !== bg[2]) ink += 1
        }
      return ink
    }
    for (let cx = 0; cx < floor.width; cx += 1) expect(inkInBand(imgOn, on.meta, cx)).toBeGreaterThan(0)
    expect(inkInBand(imgOff, off.meta as typeof on.meta, 0)).toBe(0)
  })

  it('labelRaster: all ten digits are pairwise distinct and multi-digit labels are wider', () => {
    const rasters = Array.from({ length: 10 }, (_, d) => JSON.stringify(labelRaster(String(d))))
    expect(new Set(rasters).size).toBe(10)
    expect(labelRaster('10')[0].length).toBeGreaterThan(labelRaster('1')[0].length)
  })

  it('the decoded column-label band matches labelRaster for that column (font ties to render behaviorally)', () => {
    const { png, meta } = renderFloorPng(floor, 'print', { gridRefs: true })
    const img = decode(png)
    const raster = labelRaster('3', meta.labelScale)
    const lw = raster[0].length
    const lh = raster.length
    const cx0 = meta.margin + 3 * meta.cell + Math.floor((meta.cell - lw) / 2)
    const cy0 = meta.labelTopY
    const wall = meta.palette.wall
    for (let y = 0; y < lh; y += 1)
      for (let x = 0; x < lw; x += 1) {
        const p = img.px(cx0 + x, cy0 + y)
        const isInk = p[0] === wall[0] && p[1] === wall[1] && p[2] === wall[2]
        expect(isInk).toBe(raster[y][x])
      }
  })

  it('refs on a floor wider than 16 throws rather than overlapping labels silently', () => {
    const wide = { ...floor, width: 17 }
    expect(() => renderFloorPng(wide, 'print', { gridRefs: true })).toThrow(/16/)
    expect(() => renderFloorPng(wide, 'print')).not.toThrow()
  })

  it('sketch style never jitters the labels: two renders of the same floor share identical margin bands', () => {
    const a = renderFloorPng(floor, 'sketch', { gridRefs: true })
    const b = renderFloorPng(floor, 'sketch', { gridRefs: true })
    expect(a.png.equals(b.png)).toBe(true)
  })
})

describe('styleHint — variants', () => {
  it('the zero-arg call returns exactly the historical legend (baseline comparability pinned)', () => {
    expect(styleHint('print')).toBe(styleHint('print', {}))
    expect(styleHint('print')).toMatch(/^CAD print .*drop point\.$/)
    expect(styleHint('print')).not.toMatch(/grid reference|column numbers/i)
  })

  it('gridRefs appends the printed-numbers explanation; counting appends the read-not-count procedure', () => {
    const refs = styleHint('blueprint', { gridRefs: true })
    expect(refs).toMatch(/column numbers/i)
    expect(refs).toMatch(/row numbers/i)
    const counting = styleHint('blueprint', { gridRefs: true, variant: 'counting' })
    expect(counting).toMatch(/width = /)
    expect(counting).toMatch(/printed column number/i)
    expect(counting.length).toBeLessThanOrEqual(800) // must survive the server hint cap
    expect(counting.startsWith(refs.slice(0, 60))).toBe(true)
  })
})

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
