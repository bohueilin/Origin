import { useState, useEffect, useLayoutEffect, useRef, useCallback, type CSSProperties, type KeyboardEvent } from 'react'
import { PHYSICAL_DOMAINS, ROBOT_EMBODIMENTS, EMBODIMENT_CODE, getDomainTheme, getEmbodimentProfile, type PhysicalDomain, type RobotEmbodiment } from '../environmentPlan'
import {
  freezeWorkflow,
  siteFleets,
  normalizeFleets,
  pinCellNumbers,
  cellNumber,
  MAX_FLEETS,
  MAX_PER_FLEET,
  type DescriptiveSiteMap,
  type FleetDeployment,
  type ProvenanceFact,
  type WorkflowUnderstanding,
  type FrozenWorkflow,
} from '../workflowDraft'
import type { GridPos } from '../warehouse'
import { embodimentMedia } from '../embodimentImages'
import { listFloorPlans, saveFloorPlan, deleteFloorPlan, type SavedFloorPlan, type FloorPlanSnapshot } from '../floorPlanStore'
import { cloudListFloorPlans, cloudSaveFloorPlan, cloudDeleteFloorPlan } from '../cloudFloorPlans'
import { renameFloorPlan, planStoreFor, SAVE_FAILED_NOTICE, type FloorPlanWriter } from '../floorPlanActions'
import { useAuth } from '../auth/AuthProvider'
import { StepBridge } from './StepBridge'
import { GRID_MIN, GRID_MAX, clampN, planResize, type LostCell, type ResizePlan } from '../siteMapResize'
import { FloorCountStrip } from '../proving-ground/FloorCountStrip'
import { floorTypes } from '../proving-ground/floorCounts'

function keyOf(p: { x: number; y: number }): string {
  return `${p.x},${p.y}`
}

function has(list: readonly { x: number; y: number }[], x: number, y: number): boolean {
  return list.some((p) => p.x === x && p.y === y)
}

function without(list: readonly { x: number; y: number }[], x: number, y: number) {
  return list.filter((p) => p.x !== x || p.y !== y)
}

type Tool = 'wall' | 'hazard' | 'human' | 'robot' | 'item' | 'drop' | 'clear'
// The three fleet-scoped layers (placed into the active fleet) vs the global ones.
type FleetLayer = 'robots' | 'items' | 'drops'

// One colour per fleet, matching the proving-ground sim (up to MAX_FLEETS).
const FLEET_COLORS = ['#2b523b', '#1e6a52', '#8a5200', '#6940a3', '#9d2e68', '#0b637a']

// The placement palette (paint-program model): a tool is always selected; tap the
// grid to place it, tap a placed element (or use Erase) to remove it. Robot, item
// and drop glyphs take the ACTIVE fleet's colour at render time, because that is
// the colour the grid draws them in; the global layers use site ink and the
// hazard / human-only text colours their cells use.
const PALETTE: { id: Tool; glyph: string; label: string; color: string }[] = [
  { id: 'robot', glyph: 'R', label: 'Robot', color: '#2b523b' },
  { id: 'item', glyph: 'I', label: 'Item', color: '#2b523b' },
  { id: 'drop', glyph: 'D', label: 'Drop', color: '#2b523b' },
  { id: 'wall', glyph: 'W', label: 'Wall', color: '#4e5b48' },
  { id: 'hazard', glyph: '!', label: 'Hazard', color: '#962e28' },
  { id: 'human', glyph: 'H', label: 'Human-only', color: '#704400' },
  { id: 'clear', glyph: '⌫', label: 'Erase', color: '#59664f' },
]
const TOOL_LABEL = Object.fromEntries(PALETTE.map((t) => [t.id, t.label])) as Record<Tool, string>

/** Column letters A–L across the top, row numbers 1–9 down the side: the same
 *  reference a sighted visitor reads off the axes and a screen reader hears. */
const colLetter = (x: number) => String.fromCharCode(65 + x)
const coordOf = (x: number, y: number) => `${colLetter(x)}${y + 1}`

/** A type as a robot noun: "AMR robot", "Humanoid robot", but "Robot dog", never "Robot dog robot". */
function robotNoun(emb: RobotEmbodiment): string {
  const type = getEmbodimentProfile(emb).label
  return /robot/i.test(type) ? type : `${type} robot`
}

/** Join a list as prose: "a", "a and b", "a, b and c". */
function listProse(parts: string[]): string {
  return parts.length < 3 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

const LOST_GROUPS: { kind: LostCell['kind']; one: string; many: string }[] = [
  { kind: 'robot', one: 'robot', many: 'robots' },
  { kind: 'item', one: 'item', many: 'items' },
  { kind: 'drop', one: 'drop', many: 'drops' },
  { kind: 'wall', one: 'wall', many: 'walls' },
  { kind: 'hazard', one: 'hazard', many: 'hazards' },
  { kind: 'human', one: 'human-only cell', many: 'human-only cells' },
]

const LAYER_OF: Record<'robot' | 'item' | 'drop', FleetLayer> = {
  robot: 'robots',
  item: 'items',
  drop: 'drops',
}

function cloneFleets(fleets: FleetDeployment[]): FleetDeployment[] {
  return fleets.map((f) => ({ robots: [...f.robots], items: [...f.items], drops: [...f.drops], embodiment: f.embodiment }))
}

/** Total count of a fleet-scoped layer across every fleet. */
function totalIn(fleets: FleetDeployment[], layer: FleetLayer): number {
  return fleets.reduce((n, f) => n + f[layer].length, 0)
}

/** Locate a deployed cell: which layer + fleet it belongs to, its GLOBAL index
 *  (fleet order, then within-fleet) for the I#/D# labels, and its index WITHIN
 *  its fleet, which numbers robots on the cell (each fleet's first robot is 1). */
function locate(
  fleets: FleetDeployment[],
  x: number,
  y: number,
): { layer: 'robot' | 'item' | 'drop'; fleet: number; global: number; local: number } | null {
  const layers: [FleetLayer, 'robot' | 'item' | 'drop'][] = [
    ['robots', 'robot'],
    ['items', 'item'],
    ['drops', 'drop'],
  ]
  for (const [key, layer] of layers) {
    let g = 0
    for (let fi = 0; fi < fleets.length; fi += 1) {
      const local = fleets[fi][key].findIndex((p) => p.x === x && p.y === y)
      if (local >= 0) return { layer, fleet: fi, global: g + local, local }
      g += fleets[fi][key].length
    }
  }
  return null
}

/** Apply a tool at (x,y). Robot/item/drop go into the ACTIVE fleet; wall/hazard/
 *  human are global. Tapping a matching element removes it (toggle); placing first
 *  clears the cell across every layer so a cell never holds two things. At least
 *  one item and one drop always survive (the oracle anchors). */
function applyTool(
  map: DescriptiveSiteMap,
  x: number,
  y: number,
  tool: Tool,
  activeFleet: number,
  robotType?: RobotEmbodiment,
  fallbackEmb?: RobotEmbodiment,
): DescriptiveSiteMap {
  const fleets = cloneFleets(siteFleets(map))
  const here = locate(fleets, x, y)
  const isWall = has(map.obstacles, x, y)
  const isHaz = has(map.hazards, x, y)
  const isHum = has(map.humanOnly, x, y)
  const tkey = `${x},${y}`

  // Tapping an existing robot: re-type it when a different type is painted,
  // otherwise toggle-remove. The comparison uses the robot's EFFECTIVE type (its
  // painted type, else its fleet's, else the workflow fallback — the oracle's own
  // order), so tapping a robot that already shows the painted type removes it
  // instead of silently pinning the same type.
  if (tool === 'robot' && here?.layer === 'robot') {
    const current = map.robotTypes?.[tkey] ?? fleets[here.fleet]?.embodiment ?? fallbackEmb
    if (robotType && current !== robotType) {
      return normalizeFleets({ ...map, robotTypes: { ...(map.robotTypes ?? {}), [tkey]: robotType } }, fleets)
    }
    fleets[here.fleet].robots = without(fleets[here.fleet].robots, x, y)
    const types = { ...(map.robotTypes ?? {}) }
    delete types[tkey]
    return normalizeFleets({ ...map, robotTypes: types }, fleets)
  }
  if (tool === 'item' && here?.layer === 'item') {
    if (totalIn(fleets, 'items') <= 1) return map // keep ≥1 (oracle anchor)
    fleets[here.fleet].items = without(fleets[here.fleet].items, x, y)
    return normalizeFleets(map, fleets)
  }
  if (tool === 'drop' && here?.layer === 'drop') {
    if (totalIn(fleets, 'drops') <= 1) return map // keep ≥1 (oracle anchor)
    fleets[here.fleet].drops = without(fleets[here.fleet].drops, x, y)
    return normalizeFleets(map, fleets)
  }
  if (tool === 'wall' && isWall) return normalizeFleets({ ...map, obstacles: without(map.obstacles, x, y) }, fleets)
  if (tool === 'hazard' && isHaz) return normalizeFleets({ ...map, hazards: without(map.hazards, x, y) }, fleets)
  if (tool === 'human' && isHum) return normalizeFleets({ ...map, humanOnly: without(map.humanOnly, x, y) }, fleets)

  // Clear: strip whatever occupies the cell (respecting the ≥1 item/drop floor).
  const stripCell = () => {
    fleets.forEach((f) => {
      f.robots = without(f.robots, x, y)
      if (totalIn(fleets, 'items') > 1) f.items = without(f.items, x, y)
      if (totalIn(fleets, 'drops') > 1) f.drops = without(f.drops, x, y)
    })
  }
  if (tool === 'clear') {
    stripCell()
    return normalizeFleets(
      { ...map, obstacles: without(map.obstacles, x, y), hazards: without(map.hazards, x, y), humanOnly: without(map.humanOnly, x, y) },
      fleets,
    )
  }

  // Refuse a placement that would strip the LAST item or drop (the oracle
  // anchors) — the same ≥1 floor the toggle and Clear paths enforce.
  if (here?.layer === 'item' && totalIn(fleets, 'items') <= 1) return map
  if (here?.layer === 'drop' && totalIn(fleets, 'drops') <= 1) return map

  // Place: clear the cell across all layers, then add the new element.
  fleets.forEach((f) => {
    f.robots = without(f.robots, x, y)
    f.items = without(f.items, x, y)
    f.drops = without(f.drops, x, y)
  })
  let m: DescriptiveSiteMap = {
    ...map,
    obstacles: without(map.obstacles, x, y),
    hazards: without(map.hazards, x, y),
    humanOnly: without(map.humanOnly, x, y),
  }
  const af = clampN(activeFleet, 0, fleets.length - 1)
  if (tool === 'wall') m = { ...m, obstacles: [...m.obstacles, { x, y }] }
  else if (tool === 'hazard') m = { ...m, hazards: [...m.hazards, { x, y }] }
  else if (tool === 'human') m = { ...m, humanOnly: [...m.humanOnly, { x, y }] }
  else if (tool === 'robot' || tool === 'item' || tool === 'drop') {
    const key = LAYER_OF[tool]
    if (fleets[af][key].length < MAX_PER_FLEET) {
      fleets[af][key] = [...fleets[af][key], { x, y }]
      if (tool === 'robot' && robotType) m = { ...m, robotTypes: { ...(m.robotTypes ?? {}), [tkey]: robotType } }
    }
  }
  return normalizeFleets(m, fleets)
}

function cellKind(map: DescriptiveSiteMap, x: number, y: number): string {
  const here = locate(siteFleets(map), x, y)
  if (here) return here.layer // 'robot' | 'item' | 'drop'
  if (has(map.obstacles, x, y)) return 'wall'
  if (has(map.hazards, x, y)) return 'hazard'
  if (has(map.humanOnly, x, y)) return 'human'
  return 'clear'
}

/** The glyph + number drawn in a cell. Robots read as their TYPE plus their number
 *  WITHIN their fleet (each fleet starts at 1: AM1, AM2, HU1, DG1), so a reader
 *  never assumes robots are missing; the fleet itself is the F# mark and colour.
 *  Items/drops/walls/hazards/humans keep a floor-wide I/D/W/!/H number that stays
 *  with the cell until it is removed (`cellNumber`), so edits never renumber them. */
function cellText(fleets: FleetDeployment[], map: DescriptiveSiteMap, x: number, y: number, fallbackEmb: RobotEmbodiment): string {
  const here = locate(fleets, x, y)
  if (here?.layer === 'robot') {
    const emb = map.robotTypes?.[`${x},${y}`] ?? fleets[here.fleet]?.embodiment ?? fallbackEmb
    return `${EMBODIMENT_CODE[emb]}${here.local + 1}`
  }
  if (here?.layer === 'item') return `I${cellNumber(map, 'items', x, y)}`
  if (here?.layer === 'drop') return `D${cellNumber(map, 'drops', x, y)}`
  if (has(map.obstacles, x, y)) return `W${cellNumber(map, 'obstacles', x, y)}`
  if (has(map.hazards, x, y)) return `!${cellNumber(map, 'hazards', x, y)}`
  if (has(map.humanOnly, x, y)) return `H${cellNumber(map, 'humanOnly', x, y)}`
  return ''
}

function firstFreeCell(map: DescriptiveSiteMap): GridPos | null {
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (cellKind(map, x, y) === 'clear') return { x, y }
    }
  }
  return null
}

/** What one cell holds, in words: `desc` for its accessible name and the readout
 *  ("Fleet 1 AMR robot 1"), `noun` for a sentence about placing it ("an item for
 *  Fleet 2"), and `the` for one about removing it ("the wall W3"). */
function cellInfo(map: DescriptiveSiteMap, x: number, y: number, fallbackEmb: RobotEmbodiment) {
  const fleets = siteFleets(map)
  const here = locate(fleets, x, y)
  const text = cellText(fleets, map, x, y, fallbackEmb)
  if (here?.layer === 'robot') {
    const emb = map.robotTypes?.[`${x},${y}`] ?? fleets[here.fleet]?.embodiment ?? fallbackEmb
    const type = getEmbodimentProfile(emb).label
    const named = robotNoun(emb)
    const desc = `Fleet ${here.fleet + 1} ${named} ${here.local + 1}`
    const article = /^[aeiou]/i.test(named) ? 'an' : 'a'
    return { kind: 'robot', fleet: here.fleet, type, desc, noun: `${article} ${named} for Fleet ${here.fleet + 1}`, the: `${desc} (${text})` }
  }
  if (here) {
    const desc = `Fleet ${here.fleet + 1} ${here.layer} ${text}`
    return { kind: here.layer, fleet: here.fleet, type: '', desc, noun: `${here.layer === 'item' ? 'an item' : 'a drop'} for Fleet ${here.fleet + 1}`, the: `${here.layer} ${text} of Fleet ${here.fleet + 1}` }
  }
  const kind = cellKind(map, x, y)
  if (kind === 'wall') return { kind, fleet: -1, type: '', desc: `wall ${text}`, noun: 'a wall', the: `wall ${text}` }
  if (kind === 'hazard') return { kind, fleet: -1, type: '', desc: 'hazard, off-limits to robots', noun: 'a hazard', the: 'hazard' }
  if (kind === 'human') return { kind, fleet: -1, type: '', desc: 'human-only, reserved for people', noun: 'a human-only cell', the: 'human-only cell' }
  return { kind: 'clear', fleet: -1, type: '', desc: 'empty', noun: '', the: '' }
}

/** Describe a tap BEFORE and AFTER it happens, from the real `applyTool` result, so
 *  the readout and the screen-reader announcement can never disagree with the grid.
 *  Pure description: no verdict, score or oracle claim. */
function tapResult(
  map: DescriptiveSiteMap,
  next: DescriptiveSiteMap,
  x: number,
  y: number,
  tool: Tool,
  activeFleet: number,
  fallbackEmb: RobotEmbodiment,
): { future: string; past: string; changed: boolean } {
  const at = coordOf(x, y)
  const before = cellInfo(map, x, y, fallbackEmb)
  const after = next === map ? before : cellInfo(next, x, y, fallbackEmb)
  // A tap is a no-op when the cell reads the same afterwards, whether or not
  // applyTool returned a new object (normalizeFleets always does).
  if (before.kind === after.kind && before.desc === after.desc) {
    const fleets = siteFleets(map)
    let why = before.kind === 'clear' ? 'it is already empty' : 'nothing would change'
    if (before.kind === 'item' && totalIn(fleets, 'items') <= 1) why = 'the floor keeps at least one item'
    else if (before.kind === 'drop' && totalIn(fleets, 'drops') <= 1) why = 'the floor keeps at least one drop'
    else if (tool === 'robot' || tool === 'item' || tool === 'drop') {
      const layer = LAYER_OF[tool]
      if ((fleets[activeFleet]?.[layer].length ?? 0) >= MAX_PER_FLEET) why = `Fleet ${activeFleet + 1} already has ${MAX_PER_FLEET} ${layer}`
    }
    return { future: `leaves ${at} as it is, because ${why}`, past: `No change at ${at}: ${why}.`, changed: false }
  }
  if (before.kind === 'clear') return { future: `places ${after.noun} here`, past: `Placed ${after.noun} at ${at}.`, changed: true }
  if (after.kind === 'clear') return { future: `removes the ${before.the}`, past: `Removed the ${before.the} at ${at}.`, changed: true }
  if (before.kind === 'robot' && after.kind === 'robot' && before.type !== after.type) {
    return { future: `changes this robot to ${after.type}`, past: `Changed the robot at ${at} to ${after.type}.`, changed: true }
  }
  return { future: `replaces the ${before.the} with ${after.noun}`, past: `Replaced the ${before.the} at ${at} with ${after.noun}.`, changed: true }
}

/** The loss list for a shrink, grouped by kind, each cell named as the grid names
 *  it ("D1 at L5, Fleet 1"), plus what moves on the oracle's scored lane. */
function describeResize(map: DescriptiveSiteMap, plan: ResizePlan, fallbackEmb: RobotEmbodiment) {
  const fleets = siteFleets(map)
  const name = (c: LostCell) => {
    const at = coordOf(c.x, c.y)
    const text = cellText(fleets, map, c.x, c.y, fallbackEmb)
    if (c.kind === 'robot') return `${cellInfo(map, c.x, c.y, fallbackEmb).desc} (${text}) at ${at}`
    if (c.kind === 'item' || c.kind === 'drop') return `${text} at ${at}, Fleet ${c.fleet + 1}`
    return `${text} at ${at}`
  }
  const groups = LOST_GROUPS
    .map((g) => ({ ...g, cells: plan.lost.filter((c) => c.kind === g.kind) }))
    .filter((g) => g.cells.length)
    .map((g) => ({ title: `${g.cells.length} ${g.cells.length === 1 ? g.one : g.many}`, entries: g.cells.map(name) }))
  const next = plan.next
  const lane = next
    ? plan.lane.map((m) => {
        const to = coordOf(m.to.x, m.to.y)
        if (m.part === 'start') return `The oracle’s scored lane starts at ${coordOf(m.from.x, m.from.y)} (the start is not drawn on the grid); after this it starts at ${to}, so the scored result is re-computed.`
        const layer = m.part === 'item' ? 'items' : 'drops'
        const label = `${m.part === 'item' ? 'I' : 'D'}${cellNumber(next, layer, m.to.x, m.to.y)}`
        return `The oracle’s scored lane uses the ${m.part} at ${coordOf(m.from.x, m.from.y)}; after this it uses ${label} at ${to} instead, so the scored result is re-computed.`
      })
    : []
  // The one-line summary outlives the resize, so a robot is named by type and cell,
  // not by its number: robots are numbered within their fleet, and a fleet's later
  // robots move up a number once an earlier one is removed.
  const short = (c: LostCell) => {
    const at = coordOf(c.x, c.y)
    if (c.kind !== 'robot') return `${cellText(fleets, map, c.x, c.y, fallbackEmb)} at ${at}`
    const noun = robotNoun(map.robotTypes?.[`${c.x},${c.y}`] ?? fleets[c.fleet]?.embodiment ?? fallbackEmb)
    return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun} at ${at}`
  }
  const brief = groups.length ? listProse(plan.lost.map(short)) : ''
  return { groups, lane, brief }
}

/** A note box that grows with its text, so a reader never scrolls inside a small
 *  box to finish a sentence the page wrote. It stops growing at a generous cap
 *  (CSS max-height) and only then scrolls, with a visible "more below" line. */
function NoteField({ value, onChange, label, className }: { value: string; onChange: (text: string) => void; label: string; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [overflows, setOverflows] = useState(false)
  const fit = useCallback(() => {
    const el = ref.current
    if (!el) return
    const s = getComputedStyle(el)
    const borders = parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth)
    el.style.height = 'auto'
    const cap = parseFloat(s.maxHeight)
    const wanted = el.scrollHeight + borders
    el.style.height = `${Number.isFinite(cap) ? Math.min(wanted, cap) : wanted}px`
    setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [])
  useLayoutEffect(fit, [value, fit])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Re-fit when the box's WIDTH changes (rotation, column reflow) or the web font
    // settles; its own height changes are ours and must not re-trigger the observer.
    // The refit is deferred a frame so it never resizes the observed box inside the
    // observer callback (which would raise a ResizeObserver loop error).
    let width = el.clientWidth
    let frame = 0
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fit)
    })
    ro.observe(el)
    void document.fonts?.ready.then(fit)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [fit])
  return (
    <>
      <textarea ref={ref} className={`note-field ${className ?? ''}`} aria-label={label} value={value} rows={1} onChange={(e) => onChange(e.target.value)} />
      {overflows && <span className="note-more" aria-hidden="true">More below — scroll inside this note</span>}
    </>
  )
}

type Verdict = 'finish' | 'escalate' | 'refuse'
const VERDICT_ICON: Record<Verdict, string> = { finish: '✓', escalate: '⤴', refuse: '✕' }

/** One triad-colored rule card (finish / escalate / refuse). The verdict colour is
 *  the product's through-line, so the three calls are instantly distinguishable. */
function TriadCard({
  verdict,
  name,
  meaning,
  facts,
  onChange,
}: {
  verdict: Verdict
  name: string
  meaning: string
  facts: ProvenanceFact[]
  onChange: (facts: ProvenanceFact[]) => void
}) {
  return (
    <div className={`triad-card triad-${verdict}`}>
      <div className="triad-head">
        <span className="triad-icon" aria-hidden="true">{VERDICT_ICON[verdict]}</span>
        <div>
          <h3>{name}</h3>
          <span className="triad-meaning">{meaning}</span>
        </div>
      </div>
      <div className="triad-list">
        {facts.map((fact, index) => (
          <label className="triad-rule" key={fact.id}>
            <NoteField
              label={`${name} rule ${index + 1}`}
              value={fact.text}
              onChange={(text) =>
                onChange(facts.map((f, i) => (i === index ? { ...f, text, state: 'edited' } : f)))
              }
            />
          </label>
        ))}
      </div>
    </div>
  )
}

/** The ordered task plan — a real sequence, so steps are numbered. */
function StoryboardEditor({
  facts,
  onChange,
}: {
  facts: ProvenanceFact[]
  onChange: (facts: ProvenanceFact[]) => void
}) {
  return (
    <ol className="storyboard">
      {facts.map((fact, index) => (
        <li className="sb-step" key={fact.id}>
          <span className="sb-num">{index + 1}</span>
          <div className="sb-field">
            <NoteField
              className="sb-text"
              label={`Storyboard step ${index + 1}`}
              value={fact.text}
              onChange={(text) =>
                onChange(facts.map((f, i) => (i === index ? { ...f, text, state: 'edited' } : f)))
              }
            />
          </div>
        </li>
      ))}
    </ol>
  )
}

export function ReflectAlign({
  draft,
  onApprove,
  onBack,
  onEdit,
  backLabel = '← Back to capture',
  mode = 'capture',
}: {
  draft: WorkflowUnderstanding
  onApprove: (frozen: FrozenWorkflow) => void
  onBack: () => void
  /** Live-syncs every edit up to the parent so navigating away + back never
   *  resets the user's floor (the parent keeps the latest as the working draft). */
  onEdit?: (snapshot: FloorPlanSnapshot) => void
  /** Copy for the back control — pages without a capture step pass their own. */
  backLabel?: string
  /** Distinguish the standalone synthetic lab from the capture workflow. */
  mode?: 'capture' | 'proving-ground'
}) {
  const [domain, setDomain] = useState<PhysicalDomain>(draft.domain)
  const [embodiment, setEmbodiment] = useState<RobotEmbodiment>(draft.embodiment)
  const [siteMap, setSiteMap] = useState<DescriptiveSiteMap>(draft.siteMap)
  const [tool, setTool] = useState<Tool>('robot')
  const [robotPaintType, setRobotPaintType] = useState<RobotEmbodiment>(draft.embodiment)
  const [activeFleet, setActiveFleet] = useState(0)
  const [storyboard, setStoryboard] = useState(draft.storyboard)
  const [finishRules, setFinishRules] = useState(draft.finishRules)
  const [escalateRules, setEscalateRules] = useState(draft.escalateRules)
  const [refuseRules, setRefuseRules] = useState(draft.refuseRules)
  const auth = useAuth()
  // Which store the plan controls read and write. `pending` until auth answers:
  // mid-restore, `user` is null but that is not yet "signed out", and acting on it
  // wrote a signed-in user's plan to this device where their account never sees it.
  const planStore = planStoreFor(auth)
  const [savedPlans, setSavedPlans] = useState<SavedFloorPlan[]>(() =>
    planStore === 'device' ? listFloorPlans() : [],
  )
  const [selectedPlanId, setSelectedPlanId] = useState('')
  // A store failure the user has to see — chiefly a rename that did not land.
  const [planNotice, setPlanNotice] = useState('')
  // saved plans come from the account when signed in, else from this device.
  const refreshPlans = useCallback(async () => {
    if (planStore === 'pending') return
    setSavedPlans(planStore === 'account' ? await cloudListFloorPlans() : listFloorPlans())
  }, [planStore])
  // load saved plans on mount and whenever the store changes (async data load).
  useEffect(() => {
    if (planStore === 'pending') return
    let alive = true
    void (async () => {
      const next = planStore === 'account' ? await cloudListFloorPlans() : listFloorPlans()
      if (alive) setSavedPlans(next)
    })()
    return () => { alive = false }
  }, [planStore])

  // Push every edit up to the parent so navigating away + back never resets the
  // floor (the parent keeps the latest as the working draft). The callback lives
  // in a ref — updated in an effect, not during render — so the parent re-rendering
  // doesn't re-fire the sync. The mount-time sync is a harmless no-op (same values).
  const onEditRef = useRef(onEdit)
  useEffect(() => { onEditRef.current = onEdit })
  useEffect(() => {
    onEditRef.current?.({ domain, embodiment, siteMap, storyboard, finishRules, escalateRules, refuseRules })
  }, [domain, embodiment, siteMap, storyboard, finishRules, escalateRules, refuseRules])

  const fleets = siteFleets(siteMap)
  const af = clampN(activeFleet, 0, fleets.length - 1)
  const robotTotal = totalIn(fleets, 'robots')
  const itemTotal = totalIn(fleets, 'items')
  const dropTotal = totalIn(fleets, 'drops')
  const activeColor = FLEET_COLORS[af % FLEET_COLORS.length]
  const proving = mode === 'proving-ground'
  // The scored robot types, in the oracle's episode order, with where each one is.
  const types = floorTypes(siteMap, embodiment)

  // The grid is one Tab stop (roving tabindex); arrow keys move a visible focus
  // across it. `cursor` is the cell that owns tabIndex 0, `hover` the cell under
  // the pointer: both feed the readout, which describes what a tap would do.
  const [cursor, setCursor] = useState<GridPos>({ x: 0, y: 0 })
  const [hover, setHover] = useState<GridPos | null>(null)
  const [focused, setFocused] = useState<GridPos | null>(null)
  // The readout follows whichever the visitor used last: the pointer or the keyboard.
  const [look, setLook] = useState<GridPos | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const gridRef = useRef<HTMLDivElement>(null)
  const fleetsRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const cx = clampN(cursor.x, 0, siteMap.width - 1)
  const cy = clampN(cursor.y, 0, siteMap.height - 1)

  // Clear, then set on the next frame, so a repeated sentence is still announced.
  function announce(text: string) {
    setAnnouncement('')
    requestAnimationFrame(() => setAnnouncement(text))
  }
  // Every edit starts from a pinned floor (`pinCellNumbers`), so item, drop, wall,
  // hazard and human-only numbers never shift under the visitor (robots are numbered
  // within their fleet). A no-op keeps the old object. Any edit other than a resize
  // ends a pending resize confirm, a refusal note and the offer to undo a resize.
  function edit(fn: (m: DescriptiveSiteMap) => DescriptiveSiteMap) {
    forgetResize()
    setSiteMap((m) => {
      const pinned = pinCellNumbers(m)
      const next = fn(pinned)
      return next === pinned ? m : next
    })
  }
  function tapCell(x: number, y: number) {
    const base = pinCellNumbers(siteMap)
    const next = applyTool(base, x, y, tool, af, robotPaintType, embodiment)
    const result = tapResult(base, next, x, y, tool, af, embodiment)
    announce(result.past)
    setCursor({ x, y })
    if (!result.changed) return
    forgetResize()
    setSiteMap(next)
  }

  // ── Resize: never a silent loss ──
  // A shrink that would remove placed cells, or move the oracle's scored lane,
  // waits for an explicit confirm that lists exactly what goes. An applied resize
  // can be undone in one tap until the floor changes any other way.
  type StepKey = 'cols-less' | 'cols-more' | 'rows-less' | 'rows-more'
  const [sizePreview, setSizePreview] = useState<StepKey | null>(null)
  const [pendingResize, setPendingResize] = useState<{ base: DescriptiveSiteMap; plan: ResizePlan; trigger: HTMLButtonElement | null } | null>(null)
  const [resizeRefusal, setResizeRefusal] = useState<{ base: DescriptiveSiteMap; text: string } | null>(null)
  const [lastResize, setLastResize] = useState<{ before: DescriptiveSiteMap; after: DescriptiveSiteMap; from: string; to: string; removed: string; trigger: HTMLButtonElement | null } | null>(null)
  const confirmTitleRef = useRef<HTMLParagraphElement>(null)
  const undoRef = useRef<HTMLButtonElement>(null)
  const sizeGroupRef = useRef<HTMLDivElement>(null)
  // Each is also bound to the exact floor it was made for, so none can outlive it.
  const pending = pendingResize?.base === siteMap ? pendingResize : null
  const refusal = resizeRefusal?.base === siteMap ? resizeRefusal.text : ''
  const undoable = lastResize?.after === siteMap ? lastResize : null
  const sizeOf = (m: { width: number; height: number }) => `${m.width} × ${m.height}`

  function forgetResize() {
    setPendingResize(null)
    setResizeRefusal(null)
    setLastResize(null)
  }
  function requestResize(w: number, h: number, trigger: HTMLButtonElement | null) {
    const plan = planResize(pinCellNumbers(siteMap), w, h)
    setResizeRefusal(null)
    if (plan.blocked) {
      setPendingResize(null)
      const move = plan.blocked.items && plan.blocked.drops ? 'an item and a drop' : plan.blocked.items ? 'an item' : 'a drop'
      const text = `The floor stays ${sizeOf(siteMap)}. Making it ${sizeOf(plan)} would remove ${emptied(plan.blocked)}, and the floor keeps at least one item and one drop. Place ${move} inside the smaller floor first.`
      setResizeRefusal({ base: siteMap, text })
      announce(text) // through the live region, so a repeated refusal is heard again
      return
    }
    if (plan.lost.length || plan.lane.length) {
      setPendingResize({ base: siteMap, plan, trigger })
      requestAnimationFrame(() => confirmTitleRef.current?.focus())
      return
    }
    applyResize(siteMap, plan, trigger, false)
  }
  function applyResize(before: DescriptiveSiteMap, plan: ResizePlan, trigger: HTMLButtonElement | null, focusUndo: boolean) {
    if (!plan.next) return
    const removed = describeResize(pinCellNumbers(before), plan, embodiment).brief
    setSiteMap(plan.next)
    setLastResize({ before, after: plan.next, from: sizeOf(before), to: sizeOf(plan), removed, trigger })
    setPendingResize(null)
    announce(`The floor is now ${sizeOf(plan)}${removed ? `; removed ${removed}` : ''}. Undo resize brings back the ${sizeOf(before)} floor.`)
    // After a confirm, or when the stepper just reached its limit (disabled, so it
    // drops focus), focus goes to Undo: one keypress from the exact prior floor.
    requestAnimationFrame(() => { if (focusUndo || !trigger || trigger.disabled) undoRef.current?.focus() })
  }
  function confirmResize() {
    if (!pending) return
    applyResize(pending.base, pending.plan, pending.trigger, true)
  }
  function cancelResize() {
    if (!pendingResize) return
    const trigger = pendingResize.trigger
    setPendingResize(null)
    announce(`Kept the ${sizeOf(siteMap)} floor. Nothing was removed.`)
    trigger?.focus()
  }
  /** Undo the last resize. From the keyboard, focus returns to the stepper that
   *  started it; a pointer tap leaves the page where it is (no scroll jump). */
  function undoResize(e: { detail: number }) {
    if (!undoable) return
    setSiteMap(undoable.before)
    setLastResize(null)
    announce(`Undid the resize. The floor is ${undoable.from} again, with every cell, robot type and number as it was.`)
    if (e.detail > 0) return
    requestAnimationFrame(() => {
      const target = undoable.trigger && !undoable.trigger.disabled ? undoable.trigger : sizeGroupRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      target?.focus()
    })
  }
  /** What one size step would do, in words: the stepper's description and the hover/focus preview. */
  function describeStep(w: number, h: number): string {
    const what = w < siteMap.width ? `Removes column ${colLetter(w)}`
      : h < siteMap.height ? `Removes row ${h + 1}`
      : w > siteMap.width ? `Adds an empty column ${colLetter(siteMap.width)}`
      : `Adds an empty row ${siteMap.height + 1}`
    const plan = planResize(pinCellNumbers(siteMap), w, h)
    if (plan.blocked) return `${what}: refused, because it would remove ${emptied(plan.blocked)}, and the floor keeps at least one item and one drop.`
    if (plan.lost.length) {
      const n = plan.lost.length
      return `${what}, which holds ${n} placed cell${n === 1 ? '' : 's'} (${describeResize(pinCellNumbers(siteMap), plan, embodiment).brief}). You see the full list and confirm before anything is removed.`
    }
    if (plan.lane.length) return `${what}, which moves the oracle’s scored lane. You confirm first.`
    return w < siteMap.width || h < siteMap.height ? `${what}, which is empty. Nothing placed is removed.` : `${what}.`
  }
  const sizeSteps: { key: StepKey; name: string; glyph: string; w: number; h: number; off: boolean }[] = [
    { key: 'cols-less', name: 'Fewer columns', glyph: '−', w: siteMap.width - 1, h: siteMap.height, off: siteMap.width <= GRID_MIN },
    { key: 'cols-more', name: 'More columns', glyph: '+', w: siteMap.width + 1, h: siteMap.height, off: siteMap.width >= GRID_MAX },
    { key: 'rows-less', name: 'Fewer rows', glyph: '−', w: siteMap.width, h: siteMap.height - 1, off: siteMap.height <= GRID_MIN },
    { key: 'rows-more', name: 'More rows', glyph: '+', w: siteMap.width, h: siteMap.height + 1, off: siteMap.height >= GRID_MAX },
  ]
  // The ghost: what the hovered or focused stepper would do from the CURRENT size
  // (so it follows along after each step), or the size awaiting confirm.
  const hovered = sizeSteps.find((s) => s.key === sizePreview && !s.off)
  const preview = pending ? { w: pending.plan.width, h: pending.plan.height } : hovered ? { w: hovered.w, h: hovered.h } : null
  const gridW = Math.max(siteMap.width, preview?.w ?? 0)
  const gridH = Math.max(siteMap.height, preview?.h ?? 0)
  const goes = (x: number, y: number) => !!preview && (x >= preview.w || y >= preview.h)
  const renderStep = (s: (typeof sizeSteps)[number]) => (
    <button
      key={s.key}
      type="button"
      className="btn ghost"
      disabled={s.off}
      aria-label={s.name}
      aria-describedby={s.off ? undefined : `pg-size-${s.key}`}
      onClick={(e) => requestResize(s.w, s.h, e.currentTarget)}
      onMouseEnter={() => setSizePreview(s.key)}
      onMouseLeave={() => setSizePreview(null)}
      onFocus={() => setSizePreview(s.key)}
      onBlur={() => setSizePreview(null)}
    >
      {s.glyph}
    </button>
  )
  const resizeView = pending ? describeResize(pinCellNumbers(siteMap), pending.plan, embodiment) : null
  /** "every drop", "every item", or both: what a refused resize would have emptied. */
  function emptied(b: NonNullable<ResizePlan['blocked']>) {
    return b.items && b.drops ? 'every item and every drop' : b.items ? 'every item' : 'every drop'
  }
  function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement
    if (t.dataset.x === undefined || e.altKey || e.ctrlKey || e.metaKey) return
    const x = Number(t.dataset.x)
    const y = Number(t.dataset.y)
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [x - 1, y], ArrowRight: [x + 1, y], ArrowUp: [x, y - 1], ArrowDown: [x, y + 1],
      Home: [0, y], End: [siteMap.width - 1, y],
    }
    const to = moves[e.key]
    if (!to) return
    e.preventDefault()
    const nx = clampN(to[0], 0, siteMap.width - 1)
    const ny = clampN(to[1], 0, siteMap.height - 1)
    setCursor({ x: nx, y: ny })
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-x="${nx}"][data-y="${ny}"]`)?.focus()
  }
  // Scroll the fleet cards to just below the site header + the stuck editor bar,
  // then focus the active fleet, so focus never lands under the bar.
  function showControls() {
    const fleetsEl = fleetsRef.current
    if (!fleetsEl) return
    const header = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0
    const bar = barRef.current?.getBoundingClientRect().height ?? 0
    // 'instant', not the page's smooth scroll: a smooth scroll is cancelled by the focus() below.
    window.scrollTo({ top: fleetsEl.getBoundingClientRect().top + window.scrollY - (header + bar + 14), behavior: 'instant' })
    fleetsEl.querySelector<HTMLButtonElement>('.smp-fleet.on .smp-fleet-select')?.focus({ preventScroll: true })
  }
  const toolPhrase = `${TOOL_LABEL[tool]} tool${tool === 'robot' ? ` (${getEmbodimentProfile(robotPaintType).label})` : ''}`
  // What a grid tap places: the one setting that decides a new robot's type.
  const placing = tool === 'robot' ? robotNoun(robotPaintType) : tool === 'human' ? 'Human-only cell' : TOOL_LABEL[tool]
  const readout = look && look.x < siteMap.width && look.y < siteMap.height
    ? (() => {
        const base = pinCellNumbers(siteMap)
        const info = cellInfo(base, look.x, look.y, embodiment)
        const next = applyTool(base, look.x, look.y, tool, af, robotPaintType, embodiment)
        const what = tapResult(base, next, look.x, look.y, tool, af, embodiment).future
        return `${coordOf(look.x, look.y)}: ${info.desc}. A tap with the ${toolPhrase} ${what}.`
      })()
    : undoable
      ? `The floor is ${undoable.to} now (it was ${undoable.from})${undoable.removed ? `; the resize removed ${undoable.removed}` : ''}. Undo resize brings back the ${undoable.from} floor exactly.`
      : `Active: Fleet ${af + 1} · ${toolPhrase}. Point at a cell, or move with the arrow keys, to see what a tap does there.`

  function approve() {
    onApprove(
      freezeWorkflow({
        ...draft,
        domain,
        embodiment,
        siteMap,
        storyboard,
        finishRules,
        escalateRules,
        refuseRules,
      }),
    )
  }

  // Add one of a layer to a specific fleet (placed on the first free cell), and
  // make that fleet + tool active so the next grid tap continues there. On the
  // proving ground a robot added here takes the placement type, exactly like a
  // robot placed by a grid tap: one setting decides every new robot's type.
  function addToFleet(fleetIdx: number, layer: 'robot' | 'item' | 'drop') {
    setActiveFleet(fleetIdx)
    setTool(layer)
    edit((m) => {
      const fs = siteFleets(m)
      if (!fs[fleetIdx] || fs[fleetIdx][LAYER_OF[layer]].length >= MAX_PER_FLEET) return m
      const free = firstFreeCell(m)
      return free ? applyTool(m, free.x, free.y, layer, fleetIdx, proving && layer === 'robot' ? robotPaintType : undefined) : m
    })
  }
  function removeFromFleet(fleetIdx: number, layer: 'robot' | 'item' | 'drop') {
    setActiveFleet(fleetIdx)
    setTool(layer)
    edit((m) => {
      const fs = cloneFleets(siteFleets(m))
      const key = LAYER_OF[layer]
      if (!fs[fleetIdx] || fs[fleetIdx][key].length === 0) return m
      if ((layer === 'item' || layer === 'drop') && totalIn(fs, key) <= 1) return m // keep ≥1 anchor
      fs[fleetIdx][key] = fs[fleetIdx][key].slice(0, -1)
      return normalizeFleets(m, fs)
    })
  }
  // Add a new fleet seeded with one robot / item / drop on free cells. On the
  // proving ground the new fleet starts as the placement type.
  function addFleet() {
    if (fleets.length >= MAX_FLEETS) return
    const newIdx = fleets.length
    edit((m) => {
      const fs = cloneFleets(siteFleets(m))
      if (fs.length >= MAX_FLEETS) return m
      fs.push({ robots: [], items: [], drops: [], embodiment: proving ? robotPaintType : undefined })
      let next = normalizeFleets(m, fs)
      for (const layer of ['robot', 'item', 'drop'] as const) {
        const free = firstFreeCell(next)
        if (free) next = applyTool(next, free.x, free.y, layer, newIdx)
      }
      return next
    })
    setActiveFleet(newIdx)
  }
  // Set a fleet's robot type (capture mode's fleet selector). It drives the grid
  // label + the 2D/3D model for that fleet's robots that have no type of their own.
  function setFleetEmbodiment(fleetIdx: number, emb: RobotEmbodiment) {
    setActiveFleet(fleetIdx)
    edit((m) => {
      const fs = cloneFleets(siteFleets(m))
      if (!fs[fleetIdx]) return m
      fs[fleetIdx] = { ...fs[fleetIdx], embodiment: emb }
      return normalizeFleets(m, fs)
    })
  }
  function removeFleet(fleetIdx: number) {
    edit((m) => {
      const fs = cloneFleets(siteFleets(m))
      if (fs.length <= 1) return m
      fs.splice(fleetIdx, 1)
      if (totalIn(fs, 'items') === 0 || totalIn(fs, 'drops') === 0) return m // keep oracle anchors
      return normalizeFleets(m, fs)
    })
    setActiveFleet((a) => (a >= fleetIdx && a > 0 ? a - 1 : a))
  }
  // ── Saved floor plans (account when signed in, else this device) ──
  // Every plan write goes through here, so the account/device choice is made once.
  const planWriter: FloorPlanWriter = {
    save: async (name, snapshot, replacingId) =>
      planStore === 'account' ? await cloudSaveFloorPlan(name, snapshot) : saveFloorPlan(name, snapshot, replacingId),
    remove: async (id) => {
      return planStore === 'account' ? await cloudDeleteFloorPlan(id) : deleteFloorPlan(id)
    },
  }

  async function handleSavePlan() {
    if (planStore === 'pending') return
    const suggested = `${getDomainTheme(domain).label} — ${robotTotal} robot${robotTotal === 1 ? '' : 's'}`
    const name = window.prompt('Name this floor plan', suggested)
    if (name === null) return
    setPlanNotice('')
    const snapshot = { domain, embodiment, siteMap, storyboard, finishRules, escalateRules, refuseRules }
    // A rejected write used to pass silently, leaving the user sure they had saved.
    if (!(await planWriter.save(name, snapshot))) {
      setPlanNotice(SAVE_FAILED_NOTICE)
      return
    }
    await refreshPlans()
  }
  function handleLoadPlan(p: SavedFloorPlan) {
    setAnnouncement('')
    forgetResize()
    setDomain(p.domain)
    setEmbodiment(p.embodiment)
    setSiteMap(p.siteMap)
    setStoryboard(p.storyboard)
    setFinishRules(p.finishRules)
    setEscalateRules(p.escalateRules)
    setRefuseRules(p.refuseRules)
    setActiveFleet(0)
  }
  async function handleDeletePlan(id: string) {
    if (planStore === 'pending') return
    setPlanNotice('')
    if (!(await planWriter.remove(id))) {
      setPlanNotice('Couldn’t delete — your plan is still saved. Try again.')
      return
    }
    setSelectedPlanId((s) => (s === id ? '' : s))
    await refreshPlans()
  }
  // Pick a plan from the dropdown → load it into the editor.
  function handleSelectPlan(id: string) {
    setPlanNotice('')
    setSelectedPlanId(id)
    const p = savedPlans.find((x) => x.id === id)
    if (p) handleLoadPlan(p)
  }
  // Rename = save under the new name, then drop the old one (same-name overwrite is
  // handled by the store). `renameFloorPlan` gates that delete on a CONFIRMED save —
  // it used to be unconditional, so a failed save destroyed the plan being renamed.
  async function handleRenamePlan() {
    if (planStore === 'pending') return
    const p = savedPlans.find((x) => x.id === selectedPlanId)
    if (!p) return
    const name = window.prompt('Rename floor plan', p.name)
    if (name === null) return
    setPlanNotice('')
    const result = await renameFloorPlan(p, name, planWriter)
    if (result.status === 'failed') {
      setPlanNotice(result.message)
      return
    }
    if (result.status === 'unchanged') return
    if (result.status === 'partial') setPlanNotice(result.message)
    setSelectedPlanId(result.plan.id)
    await refreshPlans()
  }

  // Reset every placement back to the template's default floor + size (one fleet).
  function clearAll() {
    setAnnouncement('')
    forgetResize()
    setTool('robot')
    setActiveFleet(0)
    setSiteMap(draft.siteMap)
  }

  return (
    <section className="reflect">
      <div className="flow-shell wide">
        <button className="btn ghost back" onClick={onBack}>
          {backLabel}
        </button>
        <div className="flow-kicker">{mode === 'proving-ground' ? '01 · Draw the floor' : 'Review & confirm'}</div>
        <h2 className="flow-title">{mode === 'proving-ground' ? 'Make this floor your experiment.' : 'Does this match the real workflow?'}</h2>
        <p className="flow-sub">
          {mode === 'proving-ground' ? <>Start with this synthetic template. Change walls, hazards, and robot types to see the fixed oracle's evaluation update below. The editable storyboard and rules are descriptive notes; they do not change the oracle.</> : <>Origin drafted the floor, the plan, and the safety calls below from what you submitted. Fix
          anything that’s wrong — none of it is graded yet. When you approve, this exact version is
          locked, and evidence-backed verification scores <em>that</em>, never a moving target.</>}
        </p>

        {mode === 'capture' && <StepBridge done="Brain drafted your plan + the three safety calls" next="confirm them — on approve, this exact version is frozen and scored." />}

        {mode !== 'proving-ground' && <ol className="align-flow" aria-label="What happens to your edits">
          <li><b>Now</b> — your draft, fully editable</li>
          <li><b>On approve</b> — locked into a frozen snapshot</li>
          <li><b>Then</b> — verified against telemetry, never a model</li>
        </ol>}

        <div className="align-grid">
          <div className="align-panel site-map-panel">
            <div className="smp-head">
              <div>
                <div className="panel-kicker">{proving ? 'Floor and fleets' : 'Build your site'}</div>
                <p className="smp-sub">
                  Size each fleet — its robots, the items they carry, and their drop-offs — then tap
                  the grid to place or move them into the <strong>active</strong> fleet. Deployment
                  intent for the illustration; it never changes scored physics.
                </p>
              </div>
              <button
                className="smp-clear"
                onClick={clearAll}
                disabled={siteMap === draft.siteMap}
                title="Reset the floor and grid size to this template’s default"
              >
                ↺ Reset floor
              </button>
            </div>

            <div className="smp-saved">
              <div className="smp-plans-row">
                <label className="smp-plans-field">
                  <span className="smp-plans-label">My Plans</span>
                  <select
                    className="smp-plans-select"
                    value={selectedPlanId}
                    onChange={(e) => handleSelectPlan(e.target.value)}
                    disabled={savedPlans.length === 0}
                    aria-label="Load a saved floor plan"
                  >
                    <option value="">{savedPlans.length ? '— load a saved floor —' : '— no saved floors yet —'}</option>
                    {savedPlans.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <button className="smp-save-btn" onClick={handleSavePlan} disabled={planStore === 'pending'}>💾 Save current</button>
                {selectedPlanId && <button className="smp-plans-action" onClick={handleRenamePlan} disabled={planStore === 'pending'}>Rename</button>}
                {selectedPlanId && <button className="smp-plans-action danger" onClick={() => handleDeletePlan(selectedPlanId)} disabled={planStore === 'pending'}>Delete</button>}
              </div>
              <span className="smp-sync-note">
                {planStore === 'account' && '🔒 Synced to your account — your templates are private to you and load on any device.'}
                {planStore === 'device' && 'Saved in this browser only. Plans saved while signed in are stored separately in your account.'}
                {planStore === 'pending' && 'Checking your account — saving is paused until we know where your templates belong.'}
              </span>
              <p className="smp-plans-notice" role="status">{planNotice}</p>
            </div>

            {/* The editor bar: sticky under the site header for as long as this panel
                (fleets, tools, grid) is on screen, so the active fleet, tool and type
                never scroll away. It summarises; the controls stay where they are. */}
            {proving && (
              <div className="pg-editbar" role="group" aria-label="Editing now" ref={barRef}>
                <p className="pg-editbar-state">
                  <span className="pg-editbar-dot" style={{ background: activeColor }} aria-hidden="true" />
                  <span><b>Fleet {af + 1}</b><span className="pg-editbar-k"> active</span></span>
                  <span className="pg-editbar-sep" aria-hidden="true">·</span>
                  {/* The placement tool, never the fleet: what the next tap or + places. */}
                  <span>
                    <span className="pg-editbar-long">Placement tool</span><span className="pg-editbar-short" aria-hidden="true">Tool</span>: <b>{placing}</b>
                  </span>
                </p>
                {undoable && (
                  <button type="button" className="pg-editbar-change pg-editbar-undo" ref={undoRef} onClick={undoResize}>
                    Undo resize<span className="pg-editbar-k"> (back to {undoable.from})</span>
                  </button>
                )}
                <button type="button" className="pg-editbar-change" onClick={showControls}>
                  Change<span className="pg-editbar-k"> fleet or tool</span>
                </button>
                <FloorCountStrip map={siteMap} fallback={embodiment} />
              </div>
            )}

            <div className="smp-fleets" role="group" aria-label="Fleets to deploy" ref={fleetsRef}>
              {fleets.map((f, fi) => {
                const color = FLEET_COLORS[fi % FLEET_COLORS.length]
                const active = fi === af
                const rows: { layer: 'robot' | 'item' | 'drop'; label: string }[] = [
                  { layer: 'robot', label: 'robot' },
                  { layer: 'item', label: 'item' },
                  { layer: 'drop', label: 'drop' },
                ]
                return (
                  <div
                    key={fi}
                    className={`smp-fleet ${active ? 'on' : ''}`}
                    style={{ '--smp-c': color } as CSSProperties}
                    role="group"
                    aria-label={`Fleet ${fi + 1}`}
                  >
                    <div className="smp-fleet-head">
                      <button type="button" className="smp-fleet-select" aria-label={`Select fleet ${fi + 1}`} aria-pressed={active} onClick={() => setActiveFleet(fi)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 0, color: 'inherit', font: 'inherit', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                      <span className="smp-fleet-dot" style={{ background: color }} aria-hidden="true" />
                      <span className="smp-fleet-name">Fleet {fi + 1}</span>
                      {active ? (
                        <span className="smp-fleet-active">active</span>
                      ) : (
                        <span className="smp-fleet-pick">tap to select</span>
                      )}
                      </button>
                      {fleets.length > 1 && (
                        <button
                          className="smp-fleet-remove"
                          aria-label={`Remove fleet ${fi + 1}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            removeFleet(fi)
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div className="smp-fleet-steppers">
                      {rows.map(({ layer, label }) => {
                        const count = f[LAYER_OF[layer]].length
                        const minLock = (layer === 'item' || layer === 'drop') && totalIn(fleets, LAYER_OF[layer]) <= 1
                        return (
                          <div key={layer} className="smp-stepper">
                            <button
                              className="smp-step-btn"
                              aria-label={`One fewer ${label} in fleet ${fi + 1}`}
                              disabled={count === 0 || minLock}
                              onClick={(e) => {
                                e.stopPropagation()
                                removeFromFleet(fi, layer)
                              }}
                            >
                              −
                            </button>
                            <span className="smp-step-val">
                              <strong>{count}</strong>
                              <small>
                                {label}
                                {count === 1 ? '' : 's'}
                              </small>
                            </span>
                            <button
                              className="smp-step-btn"
                              aria-label={`One more ${proving && layer === 'robot' ? robotNoun(robotPaintType) : label} in fleet ${fi + 1}`}
                              disabled={count >= MAX_PER_FLEET}
                              onClick={(e) => {
                                e.stopPropagation()
                                addToFleet(fi, layer)
                              }}
                            >
                              +
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    {proving ? (
                      // The types this fleet actually has, counted the way the oracle
                      // resolves them, so the card, the type panel and the result agree.
                      <div className="smp-fleet-types">
                        <span className="smp-fleet-types-label">Robot types</span>
                        {(() => {
                          const here = types.filter((t) => t.byFleet.some((b) => b.fleet === fi))
                          if (!here.length) {
                            return <p className="smp-fleet-types-empty">No robots. The oracle still scores this fleet as {getEmbodimentProfile(f.embodiment ?? embodiment).label}.</p>
                          }
                          return (
                            <ul className="smp-type-chips">
                              {here.map((t) => {
                                const n = t.byFleet.find((b) => b.fleet === fi)?.robots ?? 0
                                return (
                                  <li key={t.embodiment} className="smp-type-chip">
                                    <b>{EMBODIMENT_CODE[t.embodiment]}</b> {getEmbodimentProfile(t.embodiment).label}{' '}
                                    <span aria-hidden="true">×{n}</span>
                                    <span className="sr-only">: {n} {n === 1 ? 'robot' : 'robots'}</span>
                                  </li>
                                )
                              })}
                            </ul>
                          )
                        })()}
                      </div>
                    ) : (
                      <label className="smp-fleet-emb" onClick={(e) => e.stopPropagation()}>
                        <span className="smp-fleet-emb-label">Robot type</span>
                        <select
                          className="smp-fleet-emb-select"
                          value={f.embodiment ?? embodiment}
                          onChange={(e) => setFleetEmbodiment(fi, e.target.value as RobotEmbodiment)}
                        >
                          {ROBOT_EMBODIMENTS.filter((opt) => opt !== 'other').map((opt) => (
                            <option key={opt} value={opt}>{getEmbodimentProfile(opt).label}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                )
              })}
              {fleets.length < MAX_FLEETS && (
                <button className="smp-add-fleet" onClick={addFleet}>
                  <span aria-hidden="true">+</span> Add fleet
                </button>
              )}
            </div>

            <div className="smp-palette" role="group" aria-label="Placement tool — tap the grid to place">
              <span className="smp-palette-label">
                {proving ? 'Placement tool' : 'Tool'} · tap the grid to place into <strong>Fleet {af + 1}</strong>
              </span>
              <div className="smp-tools">
                {PALETTE.map((t) => (
                  <button
                    key={t.id}
                    className={`smp-tool ${tool === t.id ? 'on' : ''}`}
                    aria-pressed={tool === t.id}
                    onClick={() => setTool(t.id)}
                    style={tool === t.id ? ({ '--smp-c': t.id === 'robot' || t.id === 'item' || t.id === 'drop' ? activeColor : t.color } as CSSProperties) : undefined}
                  >
                    <span className="smp-glyph" style={{ background: t.id === 'robot' || t.id === 'item' || t.id === 'drop' ? activeColor : t.color }}>{t.glyph}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {tool === 'robot' && (
              <div className="smp-rtype" role="group" aria-label="Robot type to place">
                <span className="smp-rtype-label">
                  {proving ? (
                    <>Placement type: every robot you place, or add with +, is this type. <strong>Tap a placed robot to change it to this type.</strong></>
                  ) : (
                    <>Robot type — place a mix, then <strong>tap a robot to change its type</strong></>
                  )}
                </span>
                <div className="smp-rtype-chips">
                  {ROBOT_EMBODIMENTS.filter((e) => e !== 'other').map((e) => (
                    <button
                      key={e}
                      className={`smp-rtype-chip ${robotPaintType === e ? 'on' : ''}`}
                      aria-pressed={robotPaintType === e}
                      onClick={() => setRobotPaintType(e)}
                      title={getEmbodimentProfile(e).label}
                    >
                      <b>{EMBODIMENT_CODE[e]}</b> {getEmbodimentProfile(e).label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid-size" role="group" aria-label="Grid size" ref={sizeGroupRef}>
              <span className="grid-size-label">Grid size — match your floor</span>
              <div className="grid-size-controls">
                <div className="stepper" aria-label="Columns (width)">
                  {renderStep(sizeSteps[0])}
                  <span className="stepper-val">{siteMap.width} <small>cols</small></span>
                  {renderStep(sizeSteps[1])}
                </div>
                <span className="grid-size-x" aria-hidden="true">×</span>
                <div className="stepper" aria-label="Rows (height)">
                  {renderStep(sizeSteps[2])}
                  <span className="stepper-val">{siteMap.height} <small>rows</small></span>
                  {renderStep(sizeSteps[3])}
                </div>
              </div>
              {/* Why a stepper stops: the gym's supported range, in visible text. */}
              <p className="grid-size-range">
                This synthetic gym supports {GRID_MIN} to {GRID_MAX} columns ({colLetter(0)} to {colLetter(GRID_MAX - 1)}) and {GRID_MIN} to {GRID_MAX} rows.
              </p>
              {sizeSteps.map((s) => !s.off && <span key={s.key} id={`pg-size-${s.key}`} hidden>{describeStep(s.w, s.h)}</span>)}
              {/* Space is kept for this line so the grid below never jumps on hover. */}
              {!pending && <p className="grid-size-preview">{hovered ? describeStep(hovered.w, hovered.h) : ''}</p>}
              {refusal && !pending && <p className="grid-size-refusal">{refusal}</p>}
              {!proving && undoable && (
                <button type="button" className="btn ghost" ref={undoRef} onClick={undoResize}>Undo resize (back to {undoable.from})</button>
              )}
            </div>

            {/* A shrink that would remove placed cells, or move the scored lane, waits
                here. Nothing changes until the visitor confirms; Escape keeps the floor. */}
            {pending && resizeView && (
              <div
                className="resize-confirm"
                role="group"
                aria-labelledby="pg-resize-title"
                onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); cancelResize() } }}
              >
                <p className="resize-confirm-title" id="pg-resize-title" tabIndex={-1} ref={confirmTitleRef}>
                  {pending.plan.lost.length
                    ? `Making the floor ${sizeOf(pending.plan)} removes ${pending.plan.lost.length} placed cell${pending.plan.lost.length === 1 ? '' : 's'}:`
                    : `Making the floor ${sizeOf(pending.plan)} moves the oracle’s scored lane:`}
                </p>
                {resizeView.groups.length > 0 && (
                  <ul className="resize-loss">
                    {resizeView.groups.map((g) => (
                      <li key={g.title}><b>{g.title}:</b> {g.entries.join('; ')}</li>
                    ))}
                  </ul>
                )}
                {resizeView.lane.map((line) => <p key={line} className="resize-lane">{line}</p>)}
                <p className="resize-confirm-note">
                  Nothing changes until you choose. The cells outlined with dashes on the grid are the ones that go. After a resize, Undo resize brings back this exact floor.
                </p>
                <div className="resize-confirm-actions">
                  <button type="button" className="btn primary resize-confirm-go" onClick={confirmResize}>
                    {pending.plan.lost.length ? `Remove ${pending.plan.lost.length} cell${pending.plan.lost.length === 1 ? '' : 's'} and resize` : 'Resize'}
                  </button>
                  <button type="button" className="btn ghost resize-confirm-keep" onClick={cancelResize}>Keep the floor as it is</button>
                </div>
              </div>
            )}

            {/* Floor header: the size in words and a synthetic scale, so 108 squares
                read as a room. The scale is a stated convention of this synthetic floor,
                never a claim about a real building. */}
            {proving && (
              <div className="floor-head">
                <p className="floor-head-title">
                  <b>Floor</b> · {siteMap.width} wide × {siteMap.height} deep · {siteMap.width * siteMap.height} cells
                </p>
                <p className="floor-head-scale">
                  In this synthetic floor, one cell is about one metre square, so this floor is about{' '}
                  {siteMap.width} m wide × {siteMap.height} m deep: an illustrative bay, not a real facility.
                </p>
              </div>
            )}

            {/* Docked legend: the exact marks the grid draws, before the first tap. */}
            {proving && (
              <div className="grid-legend" role="group" aria-label="Legend">
                <p className="grid-legend-title"><b>Legend</b> Tap a tool, then tap the floor.</p>
                <p className="grid-legend-note">
                  Robot, item (I) and drop (D) in each fleet’s colour{fleets.length > 1 ? '; F1 marks Fleet 1' : ''}:
                </p>
                <ul className="grid-legend-fleets">
                  {fleets.map((f, fi) => {
                    const c = FLEET_COLORS[fi % FLEET_COLORS.length]
                    // The codes this fleet's cells actually show (a fleet can hold a mix).
                    const fleetType = f.embodiment ?? embodiment
                    const codes = [...new Set((f.robots.length ? f.robots.map((r) => siteMap.robotTypes?.[`${r.x},${r.y}`] ?? fleetType) : [fleetType]).map((e) => EMBODIMENT_CODE[e]))]
                    return (
                      <li key={fi}>
                        {codes.map((code) => (
                          <span key={code} className="lg-cell" style={{ background: c, color: '#fff', borderColor: c }} aria-hidden="true">{code}</span>
                        ))}
                        <span className="lg-cell cell-item" style={{ color: c, borderColor: c }} aria-hidden="true">I</span>
                        <span className="lg-cell" style={{ color: c, borderColor: c, background: `color-mix(in srgb, ${c} 14%, #fff)` }} aria-hidden="true">D</span>
                        <span>{fleets.length > 1 ? `F${fi + 1}` : `Fleet ${fi + 1}`}<span className="sr-only">{fleets.length > 1 ? `, Fleet ${fi + 1}` : ''}</span></span>
                      </li>
                    )
                  })}
                </ul>
                <ul className="grid-legend-global">
                  <li><span className="lg-cell cell-wall" aria-hidden="true">W</span> Wall</li>
                  <li><span className="lg-cell cell-hazard" aria-hidden="true">!</span> Hazard: off-limits to robots</li>
                  <li><span className="lg-cell cell-human" aria-hidden="true">H</span> Human-only: reserved for people</li>
                </ul>
              </div>
            )}

            {/* Fixed 44px tracks inside a keyboard-reachable scroller. `1fr` tracks
                collapsed to their 43.6px min-content floor on a phone, so a 12-wide map
                laid out 589px inside a 231px column and `overflow-x: clip` on body
                DESTROYED the excess: 45 of 108 cells were painted off-viewport and
                untappable at 375px (54 of 108 at 320px). Drawing the floor is this
                page's primary interaction, so the cells must stay reachable AND stay at
                the 44px touch target. The wrapper carries role/tabIndex/aria-label so the
                horizontal scroll is operable by keyboard, matching the /trust scoreboard
                scroller pattern. Column letters and row numbers ride along as axes; the
                row numbers stay pinned at the left edge while the grid scrolls sideways. */}
            <div
              className="site-grid-scroll"
              role="region"
              aria-label="Floor plan grid (scrollable)"
              aria-describedby={proving ? 'pg-grid-keys' : undefined}
              tabIndex={0}
            >
              <div
                className={`site-grid${proving ? ' site-grid--axes' : ''}`}
                ref={gridRef}
                style={{ gridTemplateColumns: proving ? `24px repeat(${gridW}, 44px)` : `repeat(${gridW}, 44px)` }}
                onKeyDown={onGridKey}
                onMouseLeave={() => { setHover(null); setLook(focused) }}
                onFocus={(e) => {
                  const t = e.target as HTMLElement
                  if (t.dataset.x === undefined) return
                  const at = { x: Number(t.dataset.x), y: Number(t.dataset.y) }
                  setFocused(at)
                  setLook(at)
                  setCursor(at)
                }}
                onBlur={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
                  setFocused(null)
                  setLook(hover)
                }}
              >
              {proving && <span className="grid-axis grid-axis--corner" aria-hidden="true" />}
              {proving && Array.from({ length: gridW }, (_, x) => (
                <span key={`col-${x}`} className={`grid-axis grid-axis--col${x >= siteMap.width ? ' grid-axis--ghost' : ''}`} aria-hidden="true">{colLetter(x)}</span>
              ))}
              {Array.from({ length: gridH }, (_, y) => [
                proving ? <span key={`row-${y}`} className={`grid-axis grid-axis--row${y >= siteMap.height ? ' grid-axis--ghost' : ''}`} aria-hidden="true">{y + 1}</span> : null,
                ...Array.from({ length: gridW }, (_, x) => {
                // A preview of cells a larger floor would add: outline only, not a cell yet.
                if (x >= siteMap.width || y >= siteMap.height) {
                  return <span key={`ghost-${x},${y}`} className="site-cell-ghost" aria-hidden="true" />
                }
                const kind = cellKind(siteMap, x, y)
                const text = cellText(fleets, siteMap, x, y, embodiment)
                // Colour robots / items / drops by their fleet; mark the cell F#.
                const loc = kind === 'robot' || kind === 'item' || kind === 'drop' ? locate(fleets, x, y) : null
                let style: CSSProperties | undefined
                let tag = ''
                if (loc) {
                  const c = FLEET_COLORS[loc.fleet % FLEET_COLORS.length]
                  if (fleets.length > 1) tag = `F${loc.fleet + 1}`
                  if (kind === 'robot') style = { background: c, color: '#fff', borderColor: c }
                  else if (kind === 'drop') style = { color: c, borderColor: c, background: `color-mix(in srgb, ${c} 14%, #fff)` }
                  else style = { color: c, borderColor: c }
                }
                const label = proving
                  ? `${coordOf(x, y)}, ${cellInfo(siteMap, x, y, embodiment).desc}`
                  : `Cell ${x},${y} ${kind}${text ? ` ${text}` : ''}${tag ? ` Fleet ${loc!.fleet + 1}` : ''}`
                return (
                  <button
                    key={keyOf({ x, y })}
                    className={`site-cell cell-${kind}${goes(x, y) ? ' is-ghost-remove' : ''}`}
                    style={style}
                    data-x={x}
                    data-y={y}
                    tabIndex={proving ? (x === cx && y === cy ? 0 : -1) : undefined}
                    onClick={() => tapCell(x, y)}
                    onMouseEnter={() => { setHover({ x, y }); setLook({ x, y }) }}
                    aria-label={label}
                  >
                    <span className="site-cell-code">{text}</span>
                    {tag && <span className="site-fleet-tag" aria-hidden="true">{tag}</span>}
                  </button>
                )
              })])}
              {proving && (
                <>
                  <span className="grid-scale-bar" style={{ gridColumn: '2 / span 3' }} aria-hidden="true" />
                  <span className="grid-scale-label" style={{ gridColumn: '2 / -1' }}>3 cells ≈ 3 m in this synthetic scale</span>
                </>
              )}
              </div>
            </div>

            {!proving && (
              <p className="smp-hint">
                The palette is the key — each tool’s colour matches what’s drawn here, and the small{' '}
                <strong>F#</strong> badge shows which fleet a cell belongs to. Tap any placed cell with
                its tool to remove it; switch tools (or fleets) to move it.
              </p>
            )}
            {proving && (
              <>
                <p className="sr-only" id="pg-grid-keys">Arrow keys move between cells; Home and End jump to the ends of a row; Enter or Space applies the active tool.</p>
                <div className="grid-readout-row">
                  <p className="grid-readout">{readout}</p>
                  {undoable && (
                    <button type="button" className="btn ghost grid-readout-undo" onClick={undoResize}>
                      Undo resize (back to {undoable.from})
                    </button>
                  )}
                </div>
                <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
              </>
            )}
          </div>

          {proving ? (
            // Fleet at a glance: every scored type on the floor, never one type
            // standing for a mixed fleet. Same list, same order as the result.
            <div className="align-panel pg-types-panel">
              <div className="panel-kicker">Robot types on this floor</div>
              <p className="pg-types-lead">
                {types.length} robot type{types.length === 1 ? '' : 's'}, each scored in its own oracle episode under 03 · Inspect the result. The fleet cards and the result list the same types.
              </p>
              <ul className="pg-types">
                {types.map((t) => {
                  const media = embodimentMedia(t.embodiment)
                  const profile = getEmbodimentProfile(t.embodiment)
                  const parts: string[] = []
                  if (t.robots) {
                    const where = t.byFleet.map((b) => `${b.robots} in Fleet ${b.fleet + 1}`)
                    parts.push(t.byFleet.length === 1
                      ? `${t.robots} ${t.robots === 1 ? 'robot' : 'robots'} in Fleet ${t.byFleet[0].fleet + 1}`
                      : `${t.robots} robots: ${listProse(where)}`)
                  }
                  for (const fleet of t.emptyFleets) parts.push(`Fleet ${fleet + 1} has no robots and is still scored as this type`)
                  return (
                    <li key={t.embodiment} className="pg-type">
                      {media ? <img className="pg-type-img" src={media.src} alt="" width={72} height={54} loading="lazy" /> : <span className="pg-type-img" aria-hidden="true" />}
                      <div>
                        <p className="pg-type-name"><b className="pg-type-code">{EMBODIMENT_CODE[t.embodiment]}</b> {profile.label}</p>
                        <p className="pg-type-where">{parts.join('; ')}.</p>
                        <p className="pg-type-note">{profile.note}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <p className="pg-types-inputs">
                <b>What decides the oracle’s verdicts:</b> the floor’s geometry (its size, walls, hazards, human-only cells, and the scored lane from {coordOf(siteMap.start.x, siteMap.start.y)} to I{cellNumber(siteMap, 'items', siteMap.item.x, siteMap.item.y)} at {coordOf(siteMap.item.x, siteMap.item.y)} and on to D{cellNumber(siteMap, 'drops', siteMap.drop.x, siteMap.drop.y)} at {coordOf(siteMap.drop.x, siteMap.drop.y)}) and the robot types it scores (each robot’s type, plus the type of any fleet with no robots). Where robots stand, the other items and drops, and the descriptive notes do not change the verdicts.
              </p>
              <label className="field">
                <span className="field-label">Domain</span>
                <select className="field-input" value={domain} onChange={(e) => setDomain(e.target.value as PhysicalDomain)}>
                  {PHYSICAL_DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {getDomainTheme(d).label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="field-hint">
                The drawings are generic reference illustrations of each type, not specific products. Each note is a modelling assumption of this synthetic gym (battery and step budget), not a measured specification.
              </p>
            </div>
          ) : (
          <div className="align-panel">
            <div className="panel-kicker">Confirmed robot context</div>
            <label className="field">
              <span className="field-label">Domain</span>
              <select className="field-input" value={domain} onChange={(e) => setDomain(e.target.value as PhysicalDomain)}>
                {PHYSICAL_DOMAINS.map((d) => (
                  <option key={d} value={d}>
                    {getDomainTheme(d).label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-embodiment">
              <span className="field-label">Robot embodiment</span>
              <select
                className="field-input"
                value={embodiment}
                onChange={(e) => setEmbodiment(e.target.value as RobotEmbodiment)}
              >
                {ROBOT_EMBODIMENTS.map((e) => (
                  <option key={e} value={e}>
                    {getEmbodimentProfile(e).label}
                  </option>
                ))}
              </select>
            </label>
            <p className="field-hint">{getEmbodimentProfile(embodiment).note}</p>

            {(() => {
              const media = embodimentMedia(embodiment)
              return (
                <figure className="embodiment-preview">
                  {media ? (
                    <img
                      key={media.src}
                      className="embodiment-media"
                      src={media.src}
                      alt={media.alt}
                      width={320}
                      height={240}
                    />
                  ) : (
                    <div className="embodiment-media embodiment-media-none" aria-hidden="true">
                      <span>No reference image</span>
                    </div>
                  )}
                  <figcaption>
                    {getEmbodimentProfile(embodiment).label}
                    <span>Reference illustration of the type — generic, not a specific product. Choosing a type changes the gym’s battery and step budget (modelling assumptions, not measured specs), which can change the oracle’s labels; the picture itself changes nothing.</span>
                  </figcaption>
                </figure>
              )
            })()}
          </div>
          )}

        </div>

        <div className="align-block">
          <div className="align-block-head">
            <span className="panel-kicker">The plan</span>
            <h2>What {robotTotal > 1 ? `your ${robotTotal} robots` : 'the robot'} will do</h2>
            <p>
              {proving ? 'Describe the intended sequence: pick up, route, drop.' : 'The sequence Origin read from your site — pick up, route, drop. Edit any step; it’s descriptive only, and verification scores nothing until you freeze.'}
            </p>
            {proving && <p className="notes-status">These notes describe intent only. They do not change the scored result, which comes from floor geometry and robot types.</p>}
          </div>
          {proving && <FloorCountStrip map={siteMap} fallback={embodiment} />}
          {(fleets.length > 1 || robotTotal > 1 || itemTotal > 1 || dropTotal > 1) && (
            <p className="plan-fleet">
              {!proving && (
                <>
                  <strong>{fleets.length} fleet{fleets.length === 1 ? '' : 's'}</strong>{' '}
                  · <strong>{robotTotal} robot{robotTotal === 1 ? '' : 's'}</strong>{' '}
                  · <strong>{itemTotal} item{itemTotal === 1 ? '' : 's'}</strong>{' '}
                  · <strong>{dropTotal} drop{dropTotal === 1 ? '' : 's'}</strong>.{' '}
                </>
              )}
              {fleets.length > 1
                ? 'Each fleet works on its own (matching colour) — its robots carry only its items to its nearest drop, '
                : 'Each item is assigned to its nearest robot, '}
              one item per trip, routing around hazards and human-only cells, then home. You’ll watch
              the fleets run together in {mode === 'proving-ground' ? 'the descriptive playback below.' : 'the supervised run next.'}
            </p>
          )}
          <StoryboardEditor facts={storyboard} onChange={setStoryboard} />
        </div>

        <div className="align-block">
          <div className="align-block-head">
            <span className="panel-kicker">The three calls</span>
            <h2>{mode === 'proving-ground' ? 'Record the intended boundaries.' : 'When it may act — and when it must stop'}</h2>
            <p>
              {mode === 'proving-ground' ? 'These editable notes describe intended behavior, not executable policy. Record when the robot should ' : 'Every job ends exactly one way. Confirm when the robot may '}
              <span className="lbl-finish">finish</span> on its own, when it must{' '}
              <span className="lbl-escalate">escalate</span> to a human, and when it must{' '}
              <span className="lbl-refuse">refuse</span> outright.
            </p>
            {proving && <p className="notes-status">These notes describe intent only. They do not change the scored result, which comes from floor geometry and robot types.</p>}
          </div>
          <div className="triad-rules">
            <TriadCard verdict="finish" name="Finish" meaning="May finish the job on its own when —" facts={finishRules} onChange={setFinishRules} />
            <TriadCard verdict="escalate" name="Escalate" meaning="Must pause and call a human when —" facts={escalateRules} onChange={setEscalateRules} />
            <TriadCard verdict="refuse" name="Refuse" meaning="Must refuse outright — never attempt — when —" facts={refuseRules} onChange={setRefuseRules} />
          </div>
        </div>

        <div className="flow-actions">
          <button className="btn primary hero-action" onClick={approve}>
            {mode === 'proving-ground' ? 'Inspect the result' : 'Approve workflow'}
          </button>
          <span className="trust-note">{mode === 'proving-ground' ? 'The deterministic oracle scores geometry and robot types. No real robot executes.' : 'Approving locks this exact snapshot — evidence-backed verification scores it, not a model.'}</span>
        </div>
      </div>
    </section>
  )
}
