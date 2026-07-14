// render2d — a clean canvas renderer for the warehouse sim. Pure 2D, no deps. Draws the
// floor grid, pod-rack shelves, exclusion zones, each robot's faint verified path, the
// robots (carrying state + colour), the human (people-first), and the outbound docks.
// Origin design tokens. One draw call per animation frame; the sim is the source of truth.
import type { SimScene, SimResult, SimFrame } from './warehouseSim'

const INK = '#14161a'
const LINE = '#e3e8f1'
const BG = '#f6f8fc'
const SHELF = '#dfe6f2'
const SHELF_EDGE = '#c3cee0'
const HUMAN = '#e5484d'
const DOCK = '#0f9d6e'

export interface Draw2DOpts {
  showPaths?: boolean
  dpr?: number
}

export class Warehouse2DRenderer {
  private ctx: CanvasRenderingContext2D
  private canvas: HTMLCanvasElement
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    this.ctx = ctx
  }

  render(scene: SimScene, result: SimResult, frameIdx: number, opts: Draw2DOpts = {}) {
    const dpr = opts.dpr ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    const cssW = this.canvas.clientWidth || 640
    const cssH = this.canvas.clientHeight || 480
    if (this.canvas.width !== Math.round(cssW * dpr) || this.canvas.height !== Math.round(cssH * dpr)) {
      this.canvas.width = Math.round(cssW * dpr)
      this.canvas.height = Math.round(cssH * dpr)
    }
    const ctx = this.ctx
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    const pad = 16
    const cell = Math.max(6, Math.min((cssW - pad * 2) / scene.width, (cssH - pad * 2) / scene.height))
    const ox = (cssW - cell * scene.width) / 2
    const oy = (cssH - cell * scene.height) / 2
    const cx = (p: { x: number; y: number }) => ox + p.x * cell
    const cy = (p: { x: number; y: number }) => oy + p.y * cell

    // floor
    ctx.fillStyle = BG
    roundRect(ctx, ox, oy, cell * scene.width, cell * scene.height, 10)
    ctx.fill()

    // grid
    ctx.strokeStyle = LINE
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x <= scene.width; x += 1) {
      ctx.moveTo(cx({ x, y: 0 }), oy)
      ctx.lineTo(cx({ x, y: 0 }), oy + cell * scene.height)
    }
    for (let y = 0; y <= scene.height; y += 1) {
      ctx.moveTo(ox, cy({ x: 0, y }))
      ctx.lineTo(ox + cell * scene.width, cy({ x: 0, y }))
    }
    ctx.stroke()

    // shelves (pod racks)
    for (const s of scene.shelves) {
      ctx.fillStyle = SHELF
      ctx.strokeStyle = SHELF_EDGE
      ctx.lineWidth = 1
      roundRect(ctx, cx(s) + 1.5, cy(s) + 1.5, cell - 3, cell - 3, 3)
      ctx.fill()
      ctx.stroke()
    }

    // exclusion zones
    for (const h of scene.hazards) fillCell(ctx, cx(h), cy(h), cell, 'rgba(229,72,77,0.18)')
    for (const h of scene.humanOnly) fillCell(ctx, cx(h), cy(h), cell, 'rgba(185,116,0,0.18)')

    // outbound docks (each robot's drop)
    for (const r of scene.robots) {
      ctx.fillStyle = 'rgba(15,157,110,0.12)'
      roundRect(ctx, cx(r.task.drop) + 1.5, cy(r.task.drop) + 1.5, cell - 3, cell - 3, 3)
      ctx.fill()
      ctx.strokeStyle = DOCK
      ctx.lineWidth = 1.25
      ctx.stroke()
    }

    // faint verified paths
    if (opts.showPaths !== false) {
      for (const r of scene.robots) {
        ctx.strokeStyle = hexA(r.color, 0.28)
        ctx.lineWidth = Math.max(1.5, cell * 0.1)
        ctx.lineCap = 'round'
        ctx.beginPath()
        r.plan.forEach((p, i) => {
          const X = cx(p) + cell / 2
          const Y = cy(p) + cell / 2
          if (i === 0) ctx.moveTo(X, Y)
          else ctx.lineTo(X, Y)
        })
        ctx.stroke()
      }
    }

    const frame: SimFrame = result.frames[Math.max(0, Math.min(frameIdx, result.frames.length - 1))]

    // robots
    for (const rs of frame.robots) {
      const def = scene.robots.find((r) => r.id === rs.id)!
      const X = cx(rs.pos) + cell / 2
      const Y = cy(rs.pos) + cell / 2
      const rad = cell * (rs.done ? 0.24 : 0.3)
      // body
      ctx.beginPath()
      ctx.fillStyle = rs.done ? hexA(def.color, 0.55) : def.color
      ctx.arc(X, Y, rad, 0, Math.PI * 2)
      ctx.fill()
      // carrying pod
      if (rs.carrying && !rs.done) {
        ctx.fillStyle = '#fff'
        roundRect(ctx, X - rad * 0.5, Y - rad * 0.5, rad, rad, 2)
        ctx.fill()
      }
      // label
      ctx.fillStyle = '#fff'
      ctx.font = `${Math.max(8, cell * 0.28)}px ui-sans-serif, system-ui`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(def.sku.split('-')[0], X, Y)
    }

    // human (people-first)
    const hx = cx(frame.human) + cell / 2
    const hy = cy(frame.human) + cell / 2
    ctx.beginPath()
    ctx.fillStyle = 'rgba(229,72,77,0.16)'
    ctx.arc(hx, hy, cell * 0.55, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.fillStyle = HUMAN
    ctx.arc(hx, hy, cell * 0.26, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = `${Math.max(8, cell * 0.26)}px ui-sans-serif, system-ui`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('◆', hx, hy)

    // frame counter
    ctx.fillStyle = INK
    ctx.font = '11px ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`t=${frame.t}`, ox + 4, oy + 4)
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
function fillCell(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, cell, cell)
}
function hexA(hex: string, a: number) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
