// ----------------------------------------------------------------------------
// floorRender — dependency-free synthetic plan-image renderer (real PNG bytes).
//
// WHY THIS EXISTS. The Perceiver needs paired data: an image of a floor plus
// the exact grid it should parse into. Every famous paired-capture dataset
// (ZInD, Matterport, ScanNet…) is red/yellow-gated for commercial training —
// the pairing IS the vendors' moat. So Origin manufactures its own pairs from
// layouts it generates itself: perfect ground truth, zero third-party rights,
// labeled synthetic. This renderer is the image half of that pair.
//
// Deliberately dependency-free (node:zlib only — DEFLATE is built in; the PNG
// container, CRC32 and rasterization are hand-rolled) and deterministic: same
// layout + style → byte-identical PNG. Three styles approximate the documents
// a customer actually uploads: a CAD print, a blueprint, a hand-drawn marker
// sketch (seeded jitter — no RNG, no clock).
// ----------------------------------------------------------------------------

import { deflateSync } from 'node:zlib'
import type { BenchFloor } from './gateBench.ts'

export const RENDER_STYLES = ['print', 'blueprint', 'sketch'] as const
export type RenderStyle = (typeof RENDER_STYLES)[number]

type Rgb = [number, number, number]

interface Palette {
  bg: Rgb
  grid: Rgb
  wall: Rgb
  hazardA: Rgb
  hazardB: Rgb
  human: Rgb
  start: Rgb
  item: Rgb
  drop: Rgb
}

const PALETTES: Record<RenderStyle, Palette> = {
  print: {
    bg: [255, 255, 255],
    grid: [205, 205, 205],
    wall: [55, 55, 60],
    hazardA: [240, 180, 20],
    hazardB: [40, 40, 40],
    human: [40, 90, 200],
    start: [20, 140, 90],
    item: [230, 120, 30],
    drop: [60, 90, 220],
  },
  blueprint: {
    bg: [18, 58, 99],
    grid: [55, 100, 150],
    wall: [232, 241, 251],
    hazardA: [255, 210, 80],
    hazardB: [18, 58, 99],
    human: [160, 205, 255],
    start: [120, 230, 180],
    item: [255, 170, 90],
    drop: [170, 190, 255],
  },
  sketch: {
    bg: [250, 247, 240],
    grid: [225, 218, 205],
    wall: [70, 65, 60],
    hazardA: [235, 170, 40],
    hazardB: [90, 80, 70],
    human: [70, 110, 190],
    start: [40, 150, 100],
    item: [220, 120, 40],
    drop: [80, 100, 210],
  },
}

export interface RenderMeta {
  style: RenderStyle
  cell: number
  margin: number
  pxWidth: number
  pxHeight: number
  palette: Palette
}

// ---- deterministic jitter for the sketch style ------------------------------
function mulberry(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedFromFloor(f: BenchFloor): number {
  let h = 5381
  const mix = (n: number): void => {
    h = ((h << 5) + h + n) | 0
  }
  mix(f.width)
  mix(f.height)
  for (const c of [f.start, f.item, f.drop, ...f.obstacles, ...f.hazards, ...f.humanOnly]) {
    mix(c.x * 31 + c.y)
  }
  return Math.abs(h)
}

// ---- CRC32 (PNG chunk checksums) --------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  Buffer.from(data).copy(out, 8)
  const crcBody = out.subarray(4, 8 + data.length)
  out.writeUInt32BE(crc32(crcBody), 8 + data.length)
  return out
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  // compression 0, filter 0, interlace 0
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0 // filter type 0
    Buffer.from(rgba.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ])
}

// ---- raster ops -------------------------------------------------------------
class Raster {
  readonly data: Uint8Array
  readonly width: number
  readonly height: number
  constructor(width: number, height: number, bg: Rgb) {
    this.width = width
    this.height = height
    this.data = new Uint8Array(width * height * 4)
    for (let i = 0; i < width * height; i += 1) {
      this.data[i * 4] = bg[0]
      this.data[i * 4 + 1] = bg[1]
      this.data[i * 4 + 2] = bg[2]
      this.data[i * 4 + 3] = 255
    }
  }

  set(x: number, y: number, c: Rgb): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const p = (y * this.width + x) * 4
    this.data[p] = c[0]
    this.data[p + 1] = c[1]
    this.data[p + 2] = c[2]
    this.data[p + 3] = 255
  }

  fillRect(x: number, y: number, w: number, h: number, c: Rgb): void {
    for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) this.set(xx, yy, c)
  }

  strokeRect(x: number, y: number, w: number, h: number, c: Rgb, t = 2): void {
    this.fillRect(x, y, w, t, c)
    this.fillRect(x, y + h - t, w, t, c)
    this.fillRect(x, y, t, h, c)
    this.fillRect(x + w - t, y, t, h, c)
  }

  fillDisc(cx: number, cy: number, r: number, c: Rgb): void {
    for (let y = cy - r; y <= cy + r; y += 1)
      for (let x = cx - r; x <= cx + r; x += 1) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c)
  }

  fillDiamond(cx: number, cy: number, r: number, c: Rgb): void {
    for (let y = cy - r; y <= cy + r; y += 1)
      for (let x = cx - r; x <= cx + r; x += 1) if (Math.abs(x - cx) + Math.abs(y - cy) <= r) this.set(x, y, c)
  }
}

/** Render a floor layout to a PNG in the given style. Deterministic. */
export function renderFloorPng(floor: BenchFloor, style: RenderStyle): { png: Buffer; meta: RenderMeta } {
  const cell = 32
  const margin = 20
  const pxWidth = margin * 2 + floor.width * cell
  const pxHeight = margin * 2 + floor.height * cell
  const pal = PALETTES[style]
  const r = new Raster(pxWidth, pxHeight, pal.bg)
  const jitter = style === 'sketch' ? mulberry(seedFromFloor(floor)) : null
  const j = (): number => (jitter ? Math.floor(jitter() * 3) - 1 : 0)

  // grid lines
  for (let gx = 0; gx <= floor.width; gx += 1) r.fillRect(margin + gx * cell, margin, 1, floor.height * cell, pal.grid)
  for (let gy = 0; gy <= floor.height; gy += 1) r.fillRect(margin, margin + gy * cell, floor.width * cell, 1, pal.grid)
  // outer wall
  r.strokeRect(margin - 3, margin - 3, floor.width * cell + 6, floor.height * cell + 6, pal.wall, 3)

  const cellOrigin = (c: { x: number; y: number }): [number, number] => [margin + c.x * cell, margin + c.y * cell]

  for (const o of floor.obstacles) {
    const [x, y] = cellOrigin(o)
    r.fillRect(x + 2 + j(), y + 2 + j(), cell - 4, cell - 4, pal.wall)
  }
  for (const hz of floor.hazards) {
    const [x, y] = cellOrigin(hz)
    for (let yy = 2; yy < cell - 2; yy += 1)
      for (let xx = 2; xx < cell - 2; xx += 1) r.set(x + xx, y + yy, Math.floor((xx + yy) / 5) % 2 === 0 ? pal.hazardA : pal.hazardB)
  }
  for (const hu of floor.humanOnly) {
    const [x, y] = cellOrigin(hu)
    for (let yy = 2; yy < cell - 2; yy += 1)
      for (let xx = 2; xx < cell - 2; xx += 1) if (xx % 6 === 0 || yy % 6 === 0) r.set(x + xx, y + yy, pal.human)
  }

  const center = (c: { x: number; y: number }): [number, number] => [margin + c.x * cell + Math.floor(cell / 2), margin + c.y * cell + Math.floor(cell / 2)]
  const [sx, sy] = center(floor.start)
  r.fillDisc(sx + j(), sy + j(), Math.floor(cell / 2) - 4, pal.start)
  const [ix, iy] = center(floor.item)
  r.fillDiamond(ix + j(), iy + j(), Math.floor(cell / 2) - 4, pal.item)
  const [dx, dy] = cellOrigin(floor.drop)
  r.strokeRect(dx + 5 + j(), dy + 5 + j(), cell - 10, cell - 10, pal.drop, 4)

  return {
    png: encodePng(pxWidth, pxHeight, r.data),
    meta: { style, cell, margin, pxWidth, pxHeight, palette: pal },
  }
}

/** The legend the bench passes as the parse `hint` — the image itself has no text. */
export function styleHint(style: RenderStyle): string {
  const base =
    'Plan legend: solid filled squares are walls/shelving (obstacles); diagonal-striped cells are hazards; cross-hatched cells are human-only zones; the filled circle is the robot dock (start); the filled diamond is the pickup (item); the thick hollow square is the drop point.'
  if (style === 'blueprint') return `Blueprint-style plan (light marks on blue). ${base}`
  if (style === 'sketch') return `Hand-sketched plan on paper. ${base}`
  return `CAD print (dark marks on white). ${base}`
}
