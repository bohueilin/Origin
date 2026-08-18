// Origin-styled modal. LEFT: a navigator through the 4 dataset views of the real
// scene (Real photo → Depth → Segmentation → Instances), default = the clear RGB
// photo, with ◀ ▶ arrows. RIGHT: the schematic layout plan, static. Esc / backdrop
// closes; ← → navigate the left views.

import { useEffect, useState } from 'react'
import { SCENE_VIEWS } from '../staerAdapter'
import { useDialog } from '../auth/useDialog'

export function FloorPlanViewer({
  title,
  detail,
  scene,
  plan,
  onClose,
}: {
  title: string
  detail?: string
  scene: string
  plan?: string
  onClose: () => void
}) {
  const [view, setView] = useState(0) // default: Real photo (top-left quadrant)
  const n = SCENE_VIEWS.length
  const go = (d: number) => setView((v) => (v + d + n) % n)

  // aria-modal="true" tells assistive tech that everything outside this node is inert.
  // Without focus management, Tab walked the user straight into that hidden content and
  // close dropped focus on <body> — a keyboard dead-end (fails 2.4.3 / 4.1.2). useDialog
  // moves focus in, traps Tab, closes on Escape, and restores focus to the trigger.
  const ref = useDialog<HTMLDivElement>(onClose)

  // Arrow navigation only — Escape now belongs to useDialog, which scopes it to the
  // topmost dialog rather than firing on every window keydown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cur = SCENE_VIEWS[view]

  return (
    <div className="fpv-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="fpv-modal" ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="fpv-head">
          <div>
            <div className="fpv-title">{title}</div>
            {detail && <div className="fpv-detail">{detail}</div>}
          </div>
          <button className="fpv-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={`fpv-body ${plan ? 'fpv-body-2' : ''}`}>
          {/* LEFT: navigable dataset views of the real scene */}
          <figure className="fpv-fig">
            <div className="fpv-scene-wrap">
              <div
                className="fpv-scene"
                style={{ backgroundImage: `url(${scene})`, backgroundPosition: cur.pos }}
                role="img"
                aria-label={`${title} — ${cur.label}`}
              />
              <button className="fpv-nav fpv-nav-prev" onClick={() => go(-1)} aria-label="Previous view">‹</button>
              <button className="fpv-nav fpv-nav-next" onClick={() => go(1)} aria-label="Next view">›</button>
            </div>
            <figcaption className="fpv-cap">
              <span className="fpv-cap-label">{cur.label}</span>
              <span className="fpv-dots">
                {SCENE_VIEWS.map((v, i) => (
                  <button
                    key={v.label}
                    className={`fpv-dot ${i === view ? 'on' : ''}`}
                    onClick={() => setView(i)}
                    aria-label={v.label}
                  />
                ))}
              </span>
              <span className="fpv-cap-meta">Real warehouse · Staer dataset ({view + 1}/{n})</span>
            </figcaption>
          </figure>

          {/* RIGHT: schematic layout plan, static */}
          {plan && (
            <figure className="fpv-fig">
              <img className="fpv-img" src={plan} alt={`${title} — schematic layout`} />
              <figcaption className="fpv-cap">
                <span className="fpv-cap-label">Schematic layout</span>
                <span className="fpv-cap-meta">Your baseline to customize next</span>
              </figcaption>
            </figure>
          )}
        </div>
      </div>
    </div>
  )
}
