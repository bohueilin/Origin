// Reference-floor gallery for the Capture step. Large, legible cards: a real Staer
// warehouse photo as the hero (click → enlarge with the layout plan), the floor's
// details, and an explicit "Use this floor" action that pre-fills the brief.
// Offline-safe (cached catalog); the deterministic oracle still judges later.

import { useEffect, useState } from 'react'
import { loadFloorCatalog } from '../brainClient'
import type { FloorCatalogEntry } from '../brainTypes'
import { floorHeroImage, floorPlanImage, layoutChips, prettyFloorLabel, prettyIndustry } from '../staerAdapter'
import { FloorPlanViewer } from './FloorPlanViewer'

interface ViewerState {
  title: string
  detail?: string
  scene: string
  plan?: string
}

export function FloorLibrary({
  selectedId,
  onPick,
}: {
  selectedId: string | null
  onPick: (entry: FloorCatalogEntry) => void
}) {
  const [floors, setFloors] = useState<FloorCatalogEntry[] | null>(null)
  const [viewer, setViewer] = useState<ViewerState | null>(null)

  useEffect(() => {
    let alive = true
    loadFloorCatalog().then((cat) => {
      if (alive) setFloors(cat.floors)
    })
    return () => {
      alive = false
    }
  }, [])

  if (floors === null) return <div className="floorlib-empty">Loading reference floors…</div>
  if (floors.length === 0) return <div className="floorlib-empty">No reference floors available.</div>

  function openViewer(f: FloorCatalogEntry, i: number) {
    setViewer({
      title: prettyFloorLabel(f.label),
      detail: prettyIndustry(f.industry),
      scene: floorHeroImage(i),
      plan: floorPlanImage(f),
    })
  }

  return (
    <>
      <div className="floorlib-grid" aria-label="Site templates">
        {floors.map((f, i) => {
          const sel = f.id === selectedId
          const hero = floorHeroImage(i)
          const name = prettyFloorLabel(f.label)
          return (
            <div className={`floorlib-card ${sel ? 'sel' : ''}`} key={f.id}>
              <button
                type="button"
                className="floorlib-hero"
                aria-label={`Enlarge ${name}`}
                onClick={() => openViewer(f, i)}
              >
                <span
                  className="floorlib-hero-q"
                  style={{ backgroundImage: `url(${hero})` }}
                  role="img"
                  aria-label={`${name} — warehouse floor`}
                />
                <span className="floorlib-enlarge" aria-hidden="true">⤢ Click to enlarge</span>
              </button>
              <div className="floorlib-body">
                <div className="floorlib-top">
                  <span className="floorlib-label">{name}</span>
                  {f.verified && <span className="floorlib-verified" title="Pre-verified by the oracle">✓ verified</span>}
                </div>
                <span className="floorlib-industry">{prettyIndustry(f.industry)}</span>
                <div className="floorlib-chips">
                  {layoutChips(f).map((c) => (
                    <span className="floorlib-chip" key={c}>{c}</span>
                  ))}
                </div>
                <div className="floorlib-meta">
                  <span>{f.n_jobs ?? '—'} jobs</span>
                  <span>·</span>
                  <span>{f.horizon_days ?? '—'}d horizon</span>
                  {typeof f.naive_violations === 'number' && (
                    <>
                      <span>·</span>
                      <span className="floorlib-viol">{f.naive_violations} raw violations</span>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  className={`floorlib-use ${sel ? 'on' : ''}`}
                  aria-pressed={sel}
                  onClick={() => onPick(f)}
                >
                  {sel ? '✓ Selected — review the brief below' : 'Use this template →'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {viewer && (
        <FloorPlanViewer
          title={viewer.title}
          detail={viewer.detail}
          scene={viewer.scene}
          plan={viewer.plan}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  )
}
