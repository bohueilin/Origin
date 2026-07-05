import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import { PHYSICAL_DOMAINS, ROBOT_EMBODIMENTS, EMBODIMENT_CODE, getDomainTheme, getEmbodimentProfile, type PhysicalDomain, type RobotEmbodiment } from '../environmentPlan'
import {
  freezeWorkflow,
  siteFleets,
  normalizeFleets,
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
import { useAuth } from '../auth/AuthProvider'
import { StepBridge } from './StepBridge'
import { GRID_MIN, GRID_MAX, clampN, resizeSiteMap } from '../siteMapResize'

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
const FLEET_COLORS = ['#2f6df6', '#0f9d6e', '#b97400', '#7c3aed', '#db2777', '#0891b2']

// The placement palette doubles as the legend (paint-program model): a tool is
// always selected; tap the grid to place it, tap a placed element (or use Erase)
// to remove it. Glyph + colour here match exactly what's drawn on the grid.
const PALETTE: { id: Tool; glyph: string; label: string; color: string }[] = [
  { id: 'robot', glyph: 'R', label: 'Robot', color: '#2f6df6' },
  { id: 'item', glyph: 'I', label: 'Item', color: '#0f9d6e' },
  { id: 'drop', glyph: 'D', label: 'Drop', color: '#1d4ed8' },
  { id: 'wall', glyph: 'W', label: 'Wall', color: '#475569' },
  { id: 'hazard', glyph: '!', label: 'Hazard', color: '#e5484d' },
  { id: 'human', glyph: 'H', label: 'Human-only', color: '#b97400' },
  { id: 'clear', glyph: '⌫', label: 'Erase', color: '#64748b' },
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

/** Locate a deployed cell: which layer + fleet it belongs to, and its GLOBAL
 *  index (numbered in fleet order, then within-fleet) for the R#/I#/D# label. */
function locate(
  fleets: FleetDeployment[],
  x: number,
  y: number,
): { layer: 'robot' | 'item' | 'drop'; fleet: number; global: number } | null {
  const layers: [FleetLayer, 'robot' | 'item' | 'drop'][] = [
    ['robots', 'robot'],
    ['items', 'item'],
    ['drops', 'drop'],
  ]
  for (const [key, layer] of layers) {
    let g = 0
    for (let fi = 0; fi < fleets.length; fi += 1) {
      for (const p of fleets[fi][key]) {
        if (p.x === x && p.y === y) return { layer, fleet: fi, global: g }
        g += 1
      }
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
): DescriptiveSiteMap {
  const fleets = cloneFleets(siteFleets(map))
  const here = locate(fleets, x, y)
  const isWall = has(map.obstacles, x, y)
  const isHaz = has(map.hazards, x, y)
  const isHum = has(map.humanOnly, x, y)
  const tkey = `${x},${y}`

  // Tapping an existing robot: re-type it when a different type is painted,
  // otherwise toggle-remove. (Without a paint type, behaviour is unchanged.)
  if (tool === 'robot' && here?.layer === 'robot') {
    if (robotType && map.robotTypes?.[tkey] !== robotType) {
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

/** The glyph + number drawn in a cell. Robots read as their TYPE (HU1, DG2, AM3…);
 *  items/drops/walls/hazards/humans keep I/D/W/!/H numbering. */
function cellText(fleets: FleetDeployment[], map: DescriptiveSiteMap, x: number, y: number, fallbackEmb: RobotEmbodiment): string {
  const here = locate(fleets, x, y)
  if (here?.layer === 'robot') {
    const emb = map.robotTypes?.[`${x},${y}`] ?? fleets[here.fleet]?.embodiment ?? fallbackEmb
    return `${EMBODIMENT_CODE[emb]}${here.global + 1}`
  }
  if (here?.layer === 'item') return `I${here.global + 1}`
  if (here?.layer === 'drop') return `D${here.global + 1}`
  const wi = map.obstacles.findIndex((p) => p.x === x && p.y === y)
  if (wi >= 0) return `W${wi + 1}`
  const hz = map.hazards.findIndex((p) => p.x === x && p.y === y)
  if (hz >= 0) return `!${hz + 1}`
  const hm = map.humanOnly.findIndex((p) => p.x === x && p.y === y)
  if (hm >= 0) return `H${hm + 1}`
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
            <textarea
              value={fact.text}
              rows={2}
              onChange={(e) =>
                onChange(facts.map((f, i) => (i === index ? { ...f, text: e.target.value, state: 'edited' } : f)))
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
          <textarea
            className="sb-text"
            value={fact.text}
            rows={2}
            onChange={(e) =>
              onChange(facts.map((f, i) => (i === index ? { ...f, text: e.target.value, state: 'edited' } : f)))
            }
          />
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
}: {
  draft: WorkflowUnderstanding
  onApprove: (frozen: FrozenWorkflow) => void
  onBack: () => void
  /** Live-syncs every edit up to the parent so navigating away + back never
   *  resets the user's floor (the parent keeps the latest as the working draft). */
  onEdit?: (snapshot: FloorPlanSnapshot) => void
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
  const signedIn = auth.user != null
  const [savedPlans, setSavedPlans] = useState<SavedFloorPlan[]>(() => listFloorPlans())
  const [selectedPlanId, setSelectedPlanId] = useState('')
  // saved plans come from the account when signed in, else from this device.
  const refreshPlans = useCallback(async () => {
    const next = signedIn ? await cloudListFloorPlans() : listFloorPlans()
    setSavedPlans(next)
  }, [signedIn])
  // load saved plans on mount and whenever auth state changes (async data load).
  useEffect(() => {
    let alive = true
    void (async () => {
      const next = signedIn ? await cloudListFloorPlans() : listFloorPlans()
      if (alive) setSavedPlans(next)
    })()
    return () => { alive = false }
  }, [signedIn])

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
  // make that fleet + tool active so the next grid tap continues there.
  function addToFleet(fleetIdx: number, layer: 'robot' | 'item' | 'drop') {
    setActiveFleet(fleetIdx)
    setTool(layer)
    setSiteMap((m) => {
      const fs = siteFleets(m)
      if (!fs[fleetIdx] || fs[fleetIdx][LAYER_OF[layer]].length >= MAX_PER_FLEET) return m
      const free = firstFreeCell(m)
      return free ? applyTool(m, free.x, free.y, layer, fleetIdx) : m
    })
  }
  function removeFromFleet(fleetIdx: number, layer: 'robot' | 'item' | 'drop') {
    setActiveFleet(fleetIdx)
    setTool(layer)
    setSiteMap((m) => {
      const fs = cloneFleets(siteFleets(m))
      const key = LAYER_OF[layer]
      if (!fs[fleetIdx] || fs[fleetIdx][key].length === 0) return m
      if ((layer === 'item' || layer === 'drop') && totalIn(fs, key) <= 1) return m // keep ≥1 anchor
      fs[fleetIdx][key] = fs[fleetIdx][key].slice(0, -1)
      return normalizeFleets(m, fs)
    })
  }
  // Add a new fleet seeded with one robot / item / drop on free cells.
  function addFleet() {
    if (fleets.length >= MAX_FLEETS) return
    const newIdx = fleets.length
    setSiteMap((m) => {
      const fs = cloneFleets(siteFleets(m))
      if (fs.length >= MAX_FLEETS) return m
      fs.push({ robots: [], items: [], drops: [] })
      let next = normalizeFleets(m, fs)
      for (const layer of ['robot', 'item', 'drop'] as const) {
        const free = firstFreeCell(next)
        if (free) next = applyTool(next, free.x, free.y, layer, newIdx)
      }
      return next
    })
    setActiveFleet(newIdx)
  }
  // Set a fleet's robot type. Descriptive only (never touches the oracle path) —
  // it drives the grid label + the 2D/3D robot model for that fleet's robots.
  function setFleetEmbodiment(fleetIdx: number, emb: RobotEmbodiment) {
    setActiveFleet(fleetIdx)
    setSiteMap((m) => {
      const fs = cloneFleets(siteFleets(m))
      if (!fs[fleetIdx]) return m
      fs[fleetIdx] = { ...fs[fleetIdx], embodiment: emb }
      return normalizeFleets(m, fs)
    })
  }
  function removeFleet(fleetIdx: number) {
    setSiteMap((m) => {
      const fs = cloneFleets(siteFleets(m))
      if (fs.length <= 1) return m
      fs.splice(fleetIdx, 1)
      if (totalIn(fs, 'items') === 0 || totalIn(fs, 'drops') === 0) return m // keep oracle anchors
      return normalizeFleets(m, fs)
    })
    setActiveFleet((a) => (a >= fleetIdx && a > 0 ? a - 1 : a))
  }
  // ── Saved floor plans (account when signed in, else this device) ──
  async function handleSavePlan() {
    const suggested = `${getDomainTheme(domain).label} — ${robotTotal} robot${robotTotal === 1 ? '' : 's'}`
    const name = window.prompt('Name this floor plan', suggested)
    if (name === null) return
    const snapshot = { domain, embodiment, siteMap, storyboard, finishRules, escalateRules, refuseRules }
    if (signedIn) await cloudSaveFloorPlan(name, snapshot)
    else saveFloorPlan(name, snapshot)
    await refreshPlans()
  }
  function handleLoadPlan(p: SavedFloorPlan) {
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
    if (signedIn) await cloudDeleteFloorPlan(id)
    else deleteFloorPlan(id)
    setSelectedPlanId((s) => (s === id ? '' : s))
    await refreshPlans()
  }
  // Pick a plan from the dropdown → load it into the editor.
  function handleSelectPlan(id: string) {
    setSelectedPlanId(id)
    const p = savedPlans.find((x) => x.id === id)
    if (p) handleLoadPlan(p)
  }
  // Rename = save under the new name, then drop the old one (same-name overwrite is handled by the store).
  async function handleRenamePlan() {
    const p = savedPlans.find((x) => x.id === selectedPlanId)
    if (!p) return
    const name = window.prompt('Rename floor plan', p.name)
    if (name === null || !name.trim() || name.trim() === p.name) return
    const snapshot = { domain: p.domain, embodiment: p.embodiment, siteMap: p.siteMap, storyboard: p.storyboard, finishRules: p.finishRules, escalateRules: p.escalateRules, refuseRules: p.refuseRules }
    if (signedIn) await cloudSaveFloorPlan(name.trim(), snapshot)
    else saveFloorPlan(name.trim(), snapshot)
    await handleDeletePlan(p.id)
    await refreshPlans()
  }

  // Reset every placement back to the template's default floor + size (one fleet).
  function clearAll() {
    setTool('robot')
    setActiveFleet(0)
    setSiteMap(draft.siteMap)
  }

  return (
    <section className="reflect">
      <div className="flow-shell wide">
        <button className="btn ghost back" onClick={onBack}>
          ← Back to capture
        </button>
        <div className="flow-kicker">Review &amp; confirm</div>
        <h1>Does this match the real workflow?</h1>
        <p className="flow-sub">
          Origin drafted the floor, the plan, and the safety calls below from what you submitted. Fix
          anything that’s wrong — none of it is graded yet. When you approve, this exact version is
          locked, and evidence-backed verification scores <em>that</em>, never a moving target.
        </p>

        <StepBridge done="Brain drafted your plan + the three safety calls" next="confirm them — on approve, this exact version is frozen and scored." />

        <ol className="align-flow" aria-label="What happens to your edits">
          <li><b>Now</b> — your draft, fully editable</li>
          <li><b>On approve</b> — locked into a frozen snapshot</li>
          <li><b>Then</b> — verified against telemetry, never a model</li>
        </ol>

        <div className="align-grid">
          <div className="align-panel site-map-panel">
            <div className="smp-head">
              <div>
                <div className="panel-kicker">Build your site</div>
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
                ↺ Clear all
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
                <button className="smp-save-btn" onClick={handleSavePlan}>💾 Save current</button>
                {selectedPlanId && <button className="smp-plans-action" onClick={handleRenamePlan}>Rename</button>}
                {selectedPlanId && <button className="smp-plans-action danger" onClick={() => handleDeletePlan(selectedPlanId)}>Delete</button>}
              </div>
              <span className="smp-sync-note">
                {signedIn
                  ? '🔒 Synced to your account — your templates are private to you and load on any device.'
                  : 'Saved on this device only. Sign in to sync your templates to your account and use them anywhere.'}
              </span>
            </div>

            <div className="smp-fleets" role="group" aria-label="Fleets to deploy">
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
                    onClick={() => setActiveFleet(fi)}
                  >
                    <div className="smp-fleet-head">
                      <span className="smp-fleet-dot" style={{ background: color }} aria-hidden="true" />
                      <span className="smp-fleet-name">Fleet {fi + 1}</span>
                      {active ? (
                        <span className="smp-fleet-active">active</span>
                      ) : (
                        <span className="smp-fleet-pick">tap to select</span>
                      )}
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
                              aria-label={`One more ${label} in fleet ${fi + 1}`}
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
                Tool · tap the grid to place into <strong>Fleet {af + 1}</strong>
              </span>
              <div className="smp-tools">
                {PALETTE.map((t) => (
                  <button
                    key={t.id}
                    className={`smp-tool ${tool === t.id ? 'on' : ''}`}
                    aria-pressed={tool === t.id}
                    onClick={() => setTool(t.id)}
                    style={tool === t.id ? ({ '--smp-c': t.color } as CSSProperties) : undefined}
                  >
                    <span className="smp-glyph" style={{ background: t.color }}>{t.glyph}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {tool === 'robot' && (
              <div className="smp-rtype" role="group" aria-label="Robot type to place">
                <span className="smp-rtype-label">
                  Robot type — place a mix, then <strong>tap a robot to change its type</strong>
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

            <div className="grid-size" role="group" aria-label="Grid size">
              <span className="grid-size-label">Grid size — match your floor</span>
              <div className="grid-size-controls">
                <div className="stepper" aria-label="Columns (width)">
                  <button className="btn ghost" disabled={siteMap.width <= GRID_MIN} onClick={() => setSiteMap((m) => resizeSiteMap(m, m.width - 1, m.height))} aria-label="Fewer columns">−</button>
                  <span className="stepper-val">{siteMap.width} <small>cols</small></span>
                  <button className="btn ghost" disabled={siteMap.width >= GRID_MAX} onClick={() => setSiteMap((m) => resizeSiteMap(m, m.width + 1, m.height))} aria-label="More columns">+</button>
                </div>
                <span className="grid-size-x" aria-hidden="true">×</span>
                <div className="stepper" aria-label="Rows (height)">
                  <button className="btn ghost" disabled={siteMap.height <= GRID_MIN} onClick={() => setSiteMap((m) => resizeSiteMap(m, m.width, m.height - 1))} aria-label="Fewer rows">−</button>
                  <span className="stepper-val">{siteMap.height} <small>rows</small></span>
                  <button className="btn ghost" disabled={siteMap.height >= GRID_MAX} onClick={() => setSiteMap((m) => resizeSiteMap(m, m.width, m.height + 1))} aria-label="More rows">+</button>
                </div>
              </div>
            </div>

            <div className="site-grid" style={{ gridTemplateColumns: `repeat(${siteMap.width}, 1fr)` }}>
              {Array.from({ length: siteMap.width * siteMap.height }, (_, i) => {
                const x = i % siteMap.width
                const y = Math.floor(i / siteMap.width)
                const kind = cellKind(siteMap, x, y)
                const text = cellText(fleets, siteMap, x, y, embodiment)
                // Colour robots / items / drops by their fleet; tag the cell with F#.
                const loc = kind === 'robot' || kind === 'item' || kind === 'drop' ? locate(fleets, x, y) : null
                let style: CSSProperties | undefined
                let tag = ''
                if (loc) {
                  const c = FLEET_COLORS[loc.fleet % FLEET_COLORS.length]
                  if (fleets.length > 1) tag = `Fleet ${loc.fleet + 1}`
                  if (kind === 'robot') style = { background: c, color: '#fff', borderColor: c }
                  else if (kind === 'drop') style = { color: c, borderColor: c, background: `color-mix(in srgb, ${c} 14%, #fff)` }
                  else style = { color: c, borderColor: c }
                }
                return (
                  <button
                    key={keyOf({ x, y })}
                    className={`site-cell cell-${kind}`}
                    style={style}
                    onClick={() => setSiteMap((m) => applyTool(m, x, y, tool, af, robotPaintType))}
                    aria-label={`Cell ${x},${y} ${kind}${text ? ` ${text}` : ''}${tag ? ` ${tag}` : ''}`}
                  >
                    {text}
                    {tag && <span className="site-fleet-tag">{tag}</span>}
                  </button>
                )
              })}
            </div>

            <p className="smp-hint">
              The palette is the key — each tool’s colour matches what’s drawn here, and the small{' '}
              <strong>F#</strong> badge shows which fleet a cell belongs to. Tap any placed cell with
              its tool to remove it; switch tools (or fleets) to move it.
            </p>
          </div>

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
                    media.kind === 'video' ? (
                      <video
                        key={media.src}
                        className="embodiment-media"
                        src={media.src}
                        autoPlay
                        muted
                        loop
                        playsInline
                        aria-label={media.alt}
                      />
                    ) : (
                      <img
                        key={media.src}
                        className="embodiment-media"
                        src={media.src}
                        alt={media.alt}
                      />
                    )
                  ) : (
                    <div className="embodiment-media embodiment-media-none" aria-hidden="true">
                      <span>No reference image</span>
                    </div>
                  )}
                  <figcaption>
                    {getEmbodimentProfile(embodiment).label}
                    <span>Illustrative — the embodiment sets the gym profile, not the score.</span>
                  </figcaption>
                </figure>
              )
            })()}
          </div>

        </div>

        <div className="align-block">
          <div className="align-block-head">
            <span className="panel-kicker">The plan</span>
            <h2>What {robotTotal > 1 ? `your ${robotTotal} robots` : 'the robot'} will do</h2>
            <p>
              The sequence Origin read from your site — pick up, route, drop. Edit any step; it’s
              descriptive only, and verification scores nothing until you freeze.
            </p>
          </div>
          {(fleets.length > 1 || robotTotal > 1 || itemTotal > 1 || dropTotal > 1) && (
            <p className="plan-fleet">
              <strong>{fleets.length} fleet{fleets.length === 1 ? '' : 's'}</strong>{' '}
              · <strong>{robotTotal} robot{robotTotal === 1 ? '' : 's'}</strong>{' '}
              · <strong>{itemTotal} item{itemTotal === 1 ? '' : 's'}</strong>{' '}
              · <strong>{dropTotal} drop{dropTotal === 1 ? '' : 's'}</strong>.{' '}
              {fleets.length > 1
                ? 'Each fleet works on its own (matching colour) — its robots carry only its items to its nearest drop, '
                : 'Each item is assigned to its nearest robot, '}
              one item per trip, routing around hazards and human-only cells, then home. You’ll watch
              the fleets run together in the supervised run next.
            </p>
          )}
          <StoryboardEditor facts={storyboard} onChange={setStoryboard} />
        </div>

        <div className="align-block">
          <div className="align-block-head">
            <span className="panel-kicker">The three calls</span>
            <h2>When it may act — and when it must stop</h2>
            <p>
              Every job ends exactly one way. Confirm when the robot may{' '}
              <span className="lbl-finish">finish</span> on its own, when it must{' '}
              <span className="lbl-escalate">escalate</span> to a human, and when it must{' '}
              <span className="lbl-refuse">refuse</span> outright.
            </p>
          </div>
          <div className="triad-rules">
            <TriadCard verdict="finish" name="Finish" meaning="May finish the job on its own when —" facts={finishRules} onChange={setFinishRules} />
            <TriadCard verdict="escalate" name="Escalate" meaning="Must pause and call a human when —" facts={escalateRules} onChange={setEscalateRules} />
            <TriadCard verdict="refuse" name="Refuse" meaning="Must refuse outright — never attempt — when —" facts={refuseRules} onChange={setRefuseRules} />
          </div>
        </div>

        <div className="flow-actions">
          <button className="btn primary hero-action" onClick={approve}>
            Approve workflow
          </button>
          <span className="trust-note">Approving locks this exact snapshot — evidence-backed verification scores it, not a model.</span>
        </div>
      </div>
    </section>
  )
}

