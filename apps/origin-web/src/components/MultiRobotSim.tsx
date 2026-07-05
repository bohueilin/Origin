// Shared multi-robot proving-ground animation. Single source of truth so the
// SAME deployment (N robots, M items, the floor you drew) animates identically on
// the Illustrate step and the readiness-gym page. Self-animating + deterministic.

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { DescriptiveSiteMap } from '../workflowDraft'
import { siteFleets } from '../workflowDraft'
import { planMultiAgent } from '../multiAgent'
import { EMBODIMENT_CODE, type RobotEmbodiment } from '../environmentPlan'

// One colour per FLEET. Robots, their items, and their drop inherit the fleet
// colour, so the grouping — which robots serve which work — reads at a glance.
const FLEET_COLORS = ['#2f6df6', '#0f9d6e', '#b97400', '#7c3aed', '#db2777', '#0891b2']

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
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (reduced) return
    const stepMax = Math.max(plan.ticks - 1, 0)
    // Loop with a short pause at the end so the full round-trip is legible.
    const timer = window.setInterval(() => {
      setStep((s) => (s >= stepMax + 2 ? 0 : s + 1))
    }, 460)
    return () => window.clearInterval(timer)
  }, [plan, reduced])

  const tick = reduced ? Math.max(plan.ticks - 1, 0) : Math.min(step, plan.ticks - 1)
  const robotAt = (x: number, y: number) =>
    plan.robots.findIndex((rp) => {
      const p = rp.timeline[Math.min(tick, rp.timeline.length - 1)]
      return p && p.x === x && p.y === y
    })

  return (
    <>
      <div className="sim-grid" style={{ gridTemplateColumns: `repeat(${siteMap.width}, 1fr)` }}>
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
          if (rIdx >= 0) {
            cls = `robot ${carrying ? 'carrying' : ''}`
            {
              const home = plan.robots[rIdx].start ?? robots[rIdx]
              const emb =
                siteMap.robotTypes?.[`${home.x},${home.y}`] ??
                fleetEmbs[plan.robots[rIdx].fleet] ??
                embodiment
              text = `${EMBODIMENT_CODE[emb]}${rIdx + 1}`
            }
            if (multiFleet) tag = `Fleet ${plan.robots[rIdx].fleet + 1}`
            style = { background: fleetColor, color: '#fff', borderColor: fleetColor }
          } else if (dropIdx >= 0) {
            cls = 'cell-drop'
            text = drops.length > 1 ? `D${dropIdx + 1}` : 'D'
            if (multiFleet) tag = `Fleet ${dropFleet[dropIdx] + 1}`
            style = { color: dropColor, borderColor: dropColor, background: `color-mix(in srgb, ${dropColor} 14%, #fff)` }
          } else if (itemIdx >= 0) {
            cls = `cell-I ${picked ? 'picked' : ''}`
            text = picked ? '✓' : items.length > 1 ? `I${itemIdx + 1}` : 'I'
            if (multiFleet && !picked) tag = `Fleet ${itemFleet[itemIdx] + 1}`
            if (!picked && multiFleet) style = { color: itemColor, borderColor: itemColor }
          } else if (isWall) { cls = 'wall'; text = 'W' }
          else if (isHazard) { cls = 'hazard'; text = '!' }
          else if (isHuman) { cls = 'human'; text = 'H' }
          return (
            <div className={`sim-cell ${cls}`} key={`${x},${y}`} style={style}>
              {text}
              {tag && <span className="sim-fleet-tag">{tag}</span>}
            </div>
          )
        })}
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
      <p className="deploy-note">
        <strong>{fleets.length} fleet{fleets.length === 1 ? '' : 's'}</strong> ·{' '}
        <strong>{robots.length} robot{robots.length === 1 ? '' : 's'}</strong> ·{' '}
        <strong>{items.length} item{items.length === 1 ? '' : 's'}</strong> ·{' '}
        <strong>{drops.length} drop{drops.length === 1 ? '' : 's'}</strong>. Each robot serves{' '}
        <strong>only its own fleet</strong> (matching colour) and delivers to its nearest fleet
        drop — <strong>one item per trip</strong>, picked (turns to{' '}
        <span className="lbl-finish">✓</span>), carried home, then back for the next.{' '}
        {plan.fullyDeconflicted
          ? 'Collision-free in time and space.'
          : 'Routed around walls, hazards, and — where the space allows — each other.'}
        {verdictLabel && (
          <> Evidence-backed verification still scores one lane as the verified verdict (<span className={`lbl-${verdictLabel}`}>{verdictLabel}</span>).</>
        )}
      </p>
    </>
  )
}
