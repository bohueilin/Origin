// Shared multi-robot proving-ground animation. Single source of truth so the
// SAME deployment (N robots, M items, the floor you drew) animates identically on
// the Illustrate step and the readiness-gym page. Finite, pausable deterministic playback.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { DescriptiveSiteMap } from '../workflowDraft'
import { siteFleets, cellNumber, robotNumber } from '../workflowDraft'
import { planMultiAgent } from '../multiAgent'
import { EMBODIMENT_CODE, type RobotEmbodiment } from '../environmentPlan'
import { usePlaybackVisibility } from '../shared/usePlaybackVisibility'
import { FloorCountStrip } from '../proving-ground/FloorCountStrip'
// One colour per fleet, shared with the editor and the 3D scene.
import { FLEET_COLORS } from '../proving-ground/fleetPalette'
import './floorPlayback.css'

// Where a robot's name may sit: a cell beside it, in one fixed order (above first), so a
// name keeps its side until that cell stops being free. A short line joins it to its robot.
const LABEL_SLOTS = [['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0]] as const
const CELL = 44 // px, the editor's track, so both grids share one geometry

export function MultiRobotSim({
  siteMap,
  verdictLabel,
  embodiment = 'amr',
}: {
  siteMap: DescriptiveSiteMap
  verdictLabel?: string
  embodiment?: RobotEmbodiment
}) {
  const fleets = useMemo(() => siteFleets(siteMap), [siteMap])
  // per-fleet robot type → drives the cell label (HU1, DG2…); falls back to the workflow type
  const fleetEmbs = useMemo(() => fleets.map((f) => f.embodiment ?? embodiment), [fleets, embodiment])
  // Flatten the fleets into parallel arrays the planner indexes by, keeping each
  // element's fleet membership so motion + colour stay grouped.
  const robots = useMemo(() => fleets.flatMap((f) => f.robots), [fleets])
  const items = useMemo(() => fleets.flatMap((f) => f.items), [fleets])
  const drops = useMemo(() => fleets.flatMap((f) => f.drops), [fleets])
  const robotFleet = useMemo(() => fleets.flatMap((f, fi) => f.robots.map(() => fi)), [fleets])
  const itemFleet = useMemo(() => fleets.flatMap((f, fi) => f.items.map(() => fi)), [fleets])
  const dropFleet = useMemo(() => fleets.flatMap((f, fi) => f.drops.map(() => fi)), [fleets])
  const multiFleet = fleets.length > 1
  const plan = useMemo(
    () =>
      planMultiAgent({
        width: siteMap.width,
        height: siteMap.height,
        blocked: siteMap.obstacles,
        unsafe: [...siteMap.hazards, ...siteMap.humanOnly],
        robots,
        items,
        drops,
        robotFleet,
        itemFleet,
        dropFleet,
      }),
    [siteMap, robots, items, drops, robotFleet, itemFleet, dropFleet],
  )

  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const gridRef = useRef<HTMLDivElement>(null)
  const visible = usePlaybackVisibility(gridRef)
  const stepMax = Math.max(plan.ticks - 1, 0)
  const [step, setStep] = useState(() => reduced ? stepMax : 0)
  const [playing, setPlaying] = useState(!reduced)
  const [playbackPlan, setPlaybackPlan] = useState(plan)
  // Reconcile before rendering a changed floor: an old tick is not a position
  // in the new route. Preserve a manual pause; reduced motion shows its end.
  if (playbackPlan !== plan) {
    setPlaybackPlan(plan)
    setStep(reduced ? stepMax : 0)
    if (reduced) setPlaying(false)
  }
  const advancing = playing && step < stepMax
  useEffect(() => {
    if (!advancing || !visible) return
    const timer = window.setTimeout(() => {
      setStep((s) => Math.min(s + 1, stepMax))
    }, 460)
    return () => window.clearTimeout(timer)
  }, [step, stepMax, advancing, visible])

  const togglePlayback = () => {
    if (step >= stepMax) {
      setStep(0)
      setPlaying(true)
    } else setPlaying(value => !value)
  }

  const tick = Math.min(step, stepMax)
  const at = plan.robots.map((rp) => rp.timeline[Math.min(tick, rp.timeline.length - 1)])
  const robotAt = (x: number, y: number) => at.findIndex((p) => p && p.x === x && p.y === y)

  // Give each robot's name a free cell beside it for this tick: no robot, item, drop, wall,
  // hazard, human-only mark or other name there, and no other robot touching that cell, so
  // the name reads as this robot's. With none free, the name stays inside the robot's cell.
  const key = (x: number, y: number) => `${x},${y}`
  const robotCells = new Set(at.flatMap((p) => (p ? [key(p.x, p.y)] : [])))
  const marked = new Set([...items, ...drops, ...siteMap.obstacles, ...siteMap.hazards, ...siteMap.humanOnly].map((p) => key(p.x, p.y)))
  const taken = new Set<string>()
  const labelSlot = new Map<string, string>()
  for (const p of at) {
    if (!p || labelSlot.has(key(p.x, p.y))) continue
    const slot = LABEL_SLOTS.find(([, dx, dy]) => {
      const x = p.x + dx, y = p.y + dy, k = key(x, y)
      const inside = x >= 0 && y >= 0 && x < siteMap.width && y < siteMap.height
      const touchesOther = LABEL_SLOTS.some(([, ex, ey]) => (x + ex !== p.x || y + ey !== p.y) && robotCells.has(key(x + ex, y + ey)))
      return inside && !robotCells.has(k) && !marked.has(k) && !taken.has(k) && !touchesOther
    })
    if (!slot) continue
    taken.add(key(p.x + slot[1], p.y + slot[2]))
    labelSlot.set(key(p.x, p.y), slot[0])
  }
  const tracks = `repeat(${siteMap.width}, ${CELL}px)`

  return (
    <>
      <button className="btn btn--ghost btn--sm" onClick={togglePlayback}>
        {advancing ? 'Pause playback' : 'Play'}
      </button>
      {/* The editor's axes and 44px cells, in a scroller like the editor's so a phone keeps
          every column reachable; the row numbers stay pinned while the floor scrolls sideways. */}
      <div className="sim-scroll" role="region" aria-label="2D playback (scrollable)" tabIndex={0}>
      <div className="sim-board">
      <span className="sim-axis sim-axis--corner" aria-hidden="true" />
      <div className="sim-axis sim-axis--cols" aria-hidden="true" style={{ gridTemplateColumns: tracks }}>
        {Array.from({ length: siteMap.width }, (_, x) => <span key={x}>{String.fromCharCode(65 + x)}</span>)}
      </div>
      <div className="sim-axis sim-axis--rows" aria-hidden="true" style={{ gridTemplateRows: `repeat(${siteMap.height}, ${CELL}px)` }}>
        {Array.from({ length: siteMap.height }, (_, y) => <span key={y}>{y + 1}</span>)}
      </div>
      <div ref={gridRef} className="sim-grid" style={{ gridTemplateColumns: tracks }}>
        {Array.from({ length: siteMap.width * siteMap.height }, (_, i) => {
          const x = i % siteMap.width
          const y = Math.floor(i / siteMap.width)
          const rIdx = robotAt(x, y)
          const itemIdx = items.findIndex((p) => p.x === x && p.y === y)
          const dropIdx = drops.findIndex((p) => p.x === x && p.y === y)
          const isWall = siteMap.obstacles.some((p) => p.x === x && p.y === y)
          const isHazard = siteMap.hazards.some((p) => p.x === x && p.y === y)
          const isHuman = siteMap.humanOnly.some((p) => p.x === x && p.y === y)
          const picked = itemIdx >= 0 && tick >= plan.itemPickTick[itemIdx]
          const carrying =
            rIdx >= 0 && (plan.robots[rIdx].carryingAt[Math.min(tick, plan.robots[rIdx].carryingAt.length - 1)] ?? false)
          const fleetColor = rIdx >= 0 ? FLEET_COLORS[plan.robots[rIdx].fleet % FLEET_COLORS.length] : undefined
          const dropColor = dropIdx >= 0 ? FLEET_COLORS[dropFleet[dropIdx] % FLEET_COLORS.length] : undefined
          const itemColor = itemIdx >= 0 ? FLEET_COLORS[itemFleet[itemIdx] % FLEET_COLORS.length] : undefined
          let cls = ''
          let text = ''
          let tag = ''
          let style: CSSProperties | undefined
          let label: ReactNode
          if (rIdx >= 0) {
            const home = plan.robots[rIdx].start ?? robots[rIdx]
            const emb =
              siteMap.robotTypes?.[`${home.x},${home.y}`] ??
              fleetEmbs[plan.robots[rIdx].fleet] ??
              embodiment
            const slot = labelSlot.get(key(x, y))
            // The editor's number for this robot within its fleet (AM1, AM2, HU1…), beside the
            // glyph on paper, or in white inside it when no cell beside it is free.
            const code = `${EMBODIMENT_CODE[emb]}${robotNumber(siteMap, home.x, home.y)}`
            const fleetTag = multiFleet ? `F${plan.robots[rIdx].fleet + 1}` : ''
            cls = `robot ${carrying ? 'carrying' : ''} ${slot ? '' : 'robot--named'}`
            if (slot) label = (
              <span className={`sim-robot-label sim-robot-label--${slot}`} style={{ color: fleetColor, borderColor: fleetColor }}>
                {code}
                {fleetTag && <small>{fleetTag}</small>}
              </span>
            )
            else { text = code; tag = fleetTag }
            style = { background: fleetColor, borderColor: fleetColor, color: '#fff' }
          } else if (dropIdx >= 0) {
            cls = 'cell-drop'
            // The editor's number for this drop, which an edit never shifts.
            text = `D${cellNumber(siteMap, 'drops', x, y)}`
            if (multiFleet) tag = `F${dropFleet[dropIdx] + 1}`
            style = { color: dropColor, borderColor: dropColor, background: `color-mix(in srgb, ${dropColor} 14%, #fff)` }
          } else if (itemIdx >= 0) {
            cls = `cell-I ${picked ? 'picked' : ''}`
            text = picked ? '✓' : `I${cellNumber(siteMap, 'items', x, y)}`
            if (multiFleet && !picked) tag = `F${itemFleet[itemIdx] + 1}`
            if (!picked && multiFleet) style = { color: itemColor, borderColor: itemColor }
          } else if (isWall) { cls = 'wall'; text = 'W' }
          else if (isHazard) { cls = 'hazard'; text = '!' }
          else if (isHuman) { cls = 'human'; text = 'H' }
          return (
            <div className={`sim-cell ${cls}`} key={`${x},${y}`} style={style}>
              {text}
              {tag && <span className="sim-fleet-tag">{tag}</span>}
              {label}
            </div>
          )
        })}
      </div>
      </div>
      </div>
      <div className="site-legend sim-legend">
        {fleets.map((f, fi) => (
          <span key={fi} className="lg-robot" style={{ background: FLEET_COLORS[fi % FLEET_COLORS.length], borderColor: FLEET_COLORS[fi % FLEET_COLORS.length] }}>
            Fleet {fi + 1}: {f.robots.length}R · {f.items.length}I · {f.drops.length}D
          </span>
        ))}
        <span className="lg-hazard">! Hazard</span>
        <span className="lg-human">H Human-only</span>
        <span className="lg-wall">W Wall</span>
      </div>
      <FloorCountStrip map={siteMap} fallback={embodiment} />
      <p className="deploy-note">
        Each robot serves{' '}
        <strong>only its own fleet</strong> (matching colour) and delivers to its nearest fleet
        drop — <strong>one item per trip</strong>, picked (turns to{' '}
        <span className="lbl-finish">✓</span>), carried home, then back for the next.{' '}
        {plan.fullyDeconflicted
          ? 'No two robots share a cell or swap cells at any step of this plan (checked by the planner).'
          : 'Routed around walls, hazards, and — where the space allows — each other.'}
        {verdictLabel && (
          <> The oracle scores one fixed lane, once per robot type (<span className={`lbl-${verdictLabel}`}>{verdictLabel}</span>).</>
        )}
      </p>
    </>
  )
}
