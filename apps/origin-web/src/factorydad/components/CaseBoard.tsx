import { useEffect, useMemo, useState } from 'react'
import '../board.css'
import type { Case, Cell, Terminal } from '../types'

const CELL = 40
const GAP = 6
const MOVE: Record<string, Cell> = {
  'move:north': { x: 0, y: -1 },
  'move:south': { x: 0, y: 1 },
  'move:east': { x: 1, y: 0 },
  'move:west': { x: -1, y: 0 },
}

interface Frame {
  action: string
  pos: Cell
  carrying: boolean
  scanned: boolean
  delivered: boolean
  terminal: Terminal | null
}

function k(c: Cell): string {
  return `${c.x},${c.y}`
}

function simulate(c: Case): Frame[] {
  let pos = c.workspace.start
  let carrying = false
  let scanned = false
  let delivered = false
  let terminal: Terminal | null = null
  const frames: Frame[] = [{ action: 'start', pos, carrying, scanned, delivered, terminal }]
  for (const a of c.preferred_actions) {
    if (a in MOVE) {
      pos = { x: pos.x + MOVE[a].x, y: pos.y + MOVE[a].y }
    } else if (a === 'scan') {
      scanned = true
    } else if (a === 'pick') {
      carrying = true
    } else if (a === 'drop') {
      carrying = false
      delivered = true
    } else if (a === 'finish' || a === 'escalate' || a === 'refuse') {
      terminal = a
    }
    frames.push({ action: a, pos, carrying, scanned, delivered, terminal })
  }
  return frames
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function CaseBoard({
  caseData,
  auto = false,
  loop = false,
  hideControls = false,
}: {
  caseData: Case
  auto?: boolean
  loop?: boolean
  hideControls?: boolean
}) {
  const c = caseData
  const frames = useMemo(() => simulate(c), [c])
  const reduce = useMemo(() => prefersReducedMotion(), [])
  // The parent keys this component by case_id, so state resets on case change.
  const [i, setI] = useState(reduce ? frames.length - 1 : 0)
  const [playing, setPlaying] = useState(auto && !reduce)
  const atEnd = i >= frames.length - 1

  useEffect(() => {
    if (!playing) return
    if (atEnd) {
      if (!loop) return
      const r = window.setTimeout(() => setI(0), 1200) // async loop restart (allowed)
      return () => window.clearTimeout(r)
    }
    const t = window.setTimeout(() => {
      setI((n) => Math.min(frames.length - 1, n + 1))
      if (!loop && i + 1 >= frames.length - 1) setPlaying(false)
    }, 650)
    return () => window.clearTimeout(t)
  }, [playing, atEnd, loop, i, frames.length])

  const f = frames[i]
  const w = c.workspace
  const visited = new Set(frames.slice(0, i + 1).map((fr) => k(fr.pos)))
  const itemPicked = f.carrying || f.delivered
  const forbidden = (set: Cell[]) => new Set(set.map(k))
  const hazards = forbidden(w.hazards)
  const humanOnly = forbidden(w.human_only)
  const obstacles = forbidden(w.obstacles)

  const boardW = w.grid.width * CELL + (w.grid.width - 1) * GAP
  const boardH = w.grid.height * CELL + (w.grid.height - 1) * GAP

  const cells = []
  for (let y = 0; y < w.grid.height; y++) {
    for (let x = 0; x < w.grid.width; x++) {
      const key = `${x},${y}`
      let cls = 'fd-cell'
      let glyph = null
      if (hazards.has(key)) { cls += ' fd-cell-hazard'; glyph = <Hazard /> }
      else if (humanOnly.has(key)) { cls += ' fd-cell-human'; glyph = <Person /> }
      else if (obstacles.has(key)) { cls += ' fd-cell-obstacle' }
      else if (visited.has(key)) { cls += ' fd-cell-trail' }
      if (key === k(w.drop)) { cls += ' fd-cell-drop'; glyph = <Target filled={f.delivered} /> }
      else if (key === k(w.item) && !itemPicked) { cls += ' fd-cell-item'; glyph = <Package /> }
      cells.push(<div key={key} className={cls} aria-hidden="true">{glyph}</div>)
    }
  }

  const robotStyle = {
    transform: `translate(${f.pos.x * (CELL + GAP)}px, ${f.pos.y * (CELL + GAP)}px)`,
    transition: reduce ? 'none' : 'transform 0.42s cubic-bezier(0.4,0,0.2,1)',
  }

  return (
    <div className="fd-board">
      <div className="fd-grid-wrap" style={{ width: boardW, height: boardH }}>
        <div
          className="fd-grid"
          style={{ gridTemplateColumns: `repeat(${w.grid.width}, ${CELL}px)`, gap: GAP }}
        >
          {cells}
        </div>
        <div className="fd-robot" style={{ width: CELL, height: CELL, ...robotStyle }}>
          <Robot scanning={f.action === 'scan'} carrying={f.carrying} />
        </div>
      </div>

      {hideControls ? (
        <div className="fd-board-hero-status">
          <span className={`fd-act ${f.terminal ? `fd-act-${f.terminal}` : ''}`}>
            {f.terminal ? f.terminal : f.action === 'start' ? 'ready' : f.action.replace('move:', '→ ')}
          </span>
          <span className="fd-flags">
            <Flag on={f.scanned} label="scanned" />
            {f.terminal && <Flag on label="decided" />}
          </span>
        </div>
      ) : (
      <div className="fd-board-side">
        <div className="fd-board-status">
          <span className={`fd-act ${f.terminal ? `fd-act-${f.terminal}` : ''}`}>
            {f.action === 'start' ? 'ready' : f.action.replace('move:', '→ ')}
          </span>
          <span className="fd-flags">
            <Flag on={f.scanned} label="scanned" />
            <Flag on={f.carrying} label="carrying" />
            <Flag on={f.delivered} label="delivered" />
          </span>
        </div>

        <div className="fd-board-ctrls">
          <button
            className="fd-ctrl fd-ctrl-primary"
            aria-label={playing ? 'Pause the animation' : atEnd ? 'Replay the animation' : 'Play the animation'}
            onClick={() => {
              if (atEnd) { setI(0); setPlaying(true) }
              else setPlaying((p) => !p)
            }}
          >
            {playing ? '❚❚ Pause' : atEnd ? '↻ Replay' : '▶ Play'}
          </button>
          <button className="fd-ctrl" onClick={() => { setPlaying(false); setI((n) => Math.min(frames.length - 1, n + 1)) }} disabled={atEnd}>
            Step
          </button>
          <button className="fd-ctrl" onClick={() => { setPlaying(false); setI(0) }}>↺ Reset</button>
          <span className="fd-step-count">{i}/{frames.length - 1}</span>
        </div>

        <ol className="fd-actions">
          {c.preferred_actions.map((a, idx) => (
            <li key={idx} className={idx < i ? 'done' : idx === i - 1 ? 'now' : ''}>
              {a.replace('move:', '→')}
            </li>
          ))}
        </ol>

        <div className="fd-board-legend">
          <span><i className="fd-lg fd-lg-robot" />robot</span>
          <span><i className="fd-lg fd-lg-item" />item</span>
          <span><i className="fd-lg fd-lg-drop" />drop</span>
          <span><i className="fd-lg fd-lg-haz" />hazard</span>
          <span><i className="fd-lg fd-lg-hum" />human-only</span>
        </div>
      </div>
      )}
    </div>
  )
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return <span className={`fd-flag ${on ? 'on' : ''}`}>{on ? '✓ ' : ''}{label}</span>
}

/* --- tiny inline glyphs (no icon font dependency) --- */
function Robot({ scanning, carrying }: { scanning: boolean; carrying: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <rect x="4" y="6" width="16" height="13" rx="4" fill="var(--accent)" />
      <circle cx="9.5" cy="12.5" r="2" fill="#fff" />
      <circle cx="14.5" cy="12.5" r="2" fill="#fff" />
      <rect x="10.5" y="2.5" width="3" height="4" rx="1.5" fill="var(--accent-ink)" />
      {scanning && <circle cx="12" cy="12.5" r="11" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.5" />}
      {carrying && <rect x="8.5" y="0.5" width="7" height="5" rx="1" fill="var(--pos)" />}
    </svg>
  )
}
function Package() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" fill="none" stroke="var(--pos)" strokeWidth="2" strokeLinejoin="round" /><path d="M3 7l9 4 9-4M12 11v10" stroke="var(--pos)" strokeWidth="2" /></svg>
}
function Target({ filled }: { filled: boolean }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="var(--accent)" strokeWidth="2" /><circle cx="12" cy="12" r="3" fill={filled ? 'var(--accent)' : 'none'} stroke="var(--accent)" strokeWidth="2" /></svg>
}
function Hazard() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3l9 16H3L12 3z" fill="none" stroke="var(--neg)" strokeWidth="2" strokeLinejoin="round" /><path d="M12 9v5" stroke="var(--neg)" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="16.5" r="1" fill="var(--neg)" /></svg>
}
function Person() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="8" r="3.2" fill="none" stroke="var(--warn)" strokeWidth="2" /><path d="M5 20c0-4 3.5-6 7-6s7 2 7 6" fill="none" stroke="var(--warn)" strokeWidth="2" strokeLinecap="round" /></svg>
}
