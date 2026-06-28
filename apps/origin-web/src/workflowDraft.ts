import { summarizeInputManifest, stableHash, type CaptureItem, type CaptureManifest, type FloorLayoutSpec } from './captureManifest'
import {
  PHYSICAL_DOMAINS,
  ROBOT_EMBODIMENTS,
  applyEmbodiment,
  getDomainTheme,
  type PhysicalDomain,
  type RobotEmbodiment,
  type WorkflowPlanInput,
} from './environmentPlan'
import { bfsOracle, warehouseTasks, type GridPos, type WarehouseAction, type WarehouseTerminal } from './warehouse'

export type FactState = 'ai_proposed' | 'edited' | 'confirmed'
export type Confidence = 'high' | 'medium' | 'low'

export interface ProvenanceFact {
  id: string
  text: string
  state: FactState
  confidence: Confidence
  sourceItemIds: string[]
}

export interface DescriptiveSiteMap {
  width: number
  height: number
  start: GridPos
  item: GridPos
  drop: GridPos
  obstacles: GridPos[]
  hazards: GridPos[]
  humanOnly: GridPos[]
  /**
   * Intended robot deployment positions (R1, R2, …) — DESCRIPTIVE ONLY. They
   * capture the operator's multi-robot deployment intent for storytelling and a
   * future multi-robot simulation. They never reach the oracle/reward/license:
   * `frozenToPlanInput` does not pass the site map, so robots stay pure provenance.
   */
  robots: GridPos[]
  /**
   * Per-robot type, keyed by its placement cell ("x,y" → embodiment). Lets one
   * deployment mix robot types (a humanoid + a dog + a drone…) at the same robot
   * count. Resolution at render: this map → the robot's fleet type → the workflow
   * type. Descriptive only — never reaches the oracle. Absent → all inherit the fleet/workflow type.
   */
  robotTypes?: Record<string, RobotEmbodiment>
  /**
   * Additional pickup items beyond the primary `item` (descriptive multi-item
   * intent). The deterministic oracle still scores the single primary `item`;
   * the proving-ground animation routes a robot to each placed item.
   */
  items?: GridPos[]
  /**
   * Additional drop-off points beyond the primary `drop` (D2, D3 …). Each robot
   * joins the FLEET of its nearest drop and delivers only there. The oracle still
   * scores the single primary `drop`; multi-drop is descriptive + animated.
   */
  drops?: GridPos[]
  /**
   * Explicit fleets — the authoritative multi-fleet grouping when present. Each
   * fleet owns its robots, pickup items, and drop-off points; its robots serve
   * only its own items and drops. `robots` / `items` / `drops` / `item` / `drop`
   * above are kept in sync (flattened, with fleet 0 supplying the oracle anchors)
   * by `normalizeFleets`. When absent, `siteFleets` synthesizes one fleet from the
   * flat fields so older maps keep working.
   */
  fleets?: FleetDeployment[]
}

/** One fleet's deployment intent: its robots, the items they pick, and the
 *  drop-off points they deliver to. Descriptive only — the oracle never sees it. */
export interface FleetDeployment {
  robots: GridPos[]
  items: GridPos[]
  drops: GridPos[]
  /** The robot type this fleet deploys (humanoid / dog / amr / arm / carrier / drone).
   *  Descriptive only — the oracle never sees it; it drives the 2D label + 3D model.
   *  Undefined → inherit the workflow-level embodiment. */
  embodiment?: RobotEmbodiment
}

/** MVP caps: up to 6 fleets, and up to 6 robots / items / drops within each. */
export const MAX_FLEETS = 6
export const MAX_PER_FLEET = 6

function dedupe(cells: GridPos[]): GridPos[] {
  const seen = new Set<string>()
  return cells.filter((p) => {
    const k = `${p.x},${p.y}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const samePos = (a: GridPos, b: GridPos) => a.x === b.x && a.y === b.y

/** The authoritative fleet grouping. Uses explicit `fleets` when present;
 *  otherwise synthesizes a single fleet from the flat fields (back-compat). */
export function siteFleets(map: DescriptiveSiteMap): FleetDeployment[] {
  if (map.fleets && map.fleets.length) {
    return map.fleets.map((f) => ({
      robots: dedupe(f.robots ?? []),
      items: dedupe(f.items ?? []),
      drops: dedupe(f.drops ?? []),
      embodiment: f.embodiment,
    }))
  }
  return [
    {
      robots: dedupe(map.robots ?? []),
      items: dedupe([map.item, ...(map.items ?? [])]),
      drops: dedupe([map.drop, ...(map.drops ?? [])]),
    },
  ]
}

/** Rebuild the flat fields + oracle anchors from an edited fleet list. Fleet 0
 *  supplies the primary item/drop the deterministic oracle scores; everything is
 *  de-duplicated so a cell never belongs to two layers. */
export function normalizeFleets(map: DescriptiveSiteMap, fleets: FleetDeployment[]): DescriptiveSiteMap {
  const clean = (fleets.length ? fleets : [{ robots: [], items: [], drops: [] }]).map((f) => ({
    robots: dedupe(f.robots ?? []),
    items: dedupe(f.items ?? []),
    drops: dedupe(f.drops ?? []),
    embodiment: f.embodiment,
  }))
  const allRobots = dedupe(clean.flatMap((f) => f.robots))
  const allItems = dedupe(clean.flatMap((f) => f.items))
  const allDrops = dedupe(clean.flatMap((f) => f.drops))
  // Oracle anchors come from the first fleet that actually has an item/drop (not
  // strictly fleet 0 — it may have been emptied), falling back to the prior anchor.
  const item = allItems[0] ?? map.item
  const drop = allDrops[0] ?? map.drop
  return {
    ...map,
    fleets: clean,
    robots: allRobots,
    items: allItems.filter((p) => !samePos(p, item)),
    drops: allDrops.filter((p) => !samePos(p, drop)),
    item,
    drop,
  }
}

/** All pickup cells across every fleet, de-duplicated. */
export function siteItems(map: DescriptiveSiteMap): GridPos[] {
  return dedupe(siteFleets(map).flatMap((f) => f.items))
}

/** All drop-off cells across every fleet, de-duplicated. */
export function siteDrops(map: DescriptiveSiteMap): GridPos[] {
  return dedupe(siteFleets(map).flatMap((f) => f.drops))
}

/** Per-fleet robot type, each fleet inheriting `fallback` when it set no override. */
export function fleetEmbodiments(map: DescriptiveSiteMap, fallback: RobotEmbodiment): RobotEmbodiment[] {
  return siteFleets(map).map((f) => f.embodiment ?? fallback)
}

export interface WorkflowUnderstanding {
  id: string
  captureId: string
  domain: PhysicalDomain
  embodiment: RobotEmbodiment
  inputManifestSummary: string
  sourceItems: CaptureItem[]
  siteMap: DescriptiveSiteMap
  storyboard: ProvenanceFact[]
  finishRules: ProvenanceFact[]
  escalateRules: ProvenanceFact[]
  refuseRules: ProvenanceFact[]
  successCriteria: ProvenanceFact[]
  manual: boolean
}

export interface FrozenWorkflow {
  id: string
  captureId: string
  domain: PhysicalDomain
  embodiment: RobotEmbodiment
  inputManifestSummary: string
  frozenWorkflowSummary: string
  approvedFactsHash: string
  selectedTaskIds: string[]
  siteMap: DescriptiveSiteMap
  storyboard: ProvenanceFact[]
  terminalRules: {
    finish: ProvenanceFact[]
    escalate: ProvenanceFact[]
    refuse: ProvenanceFact[]
  }
  sourceItems: CaptureItem[]
}

function fact(id: string, text: string, sourceItemIds: string[], confidence: Confidence = 'medium'): ProvenanceFact {
  return { id, text, state: 'ai_proposed', confidence, sourceItemIds }
}

function firstSource(items: readonly CaptureItem[], role?: CaptureItem['role']): string[] {
  const found = role ? items.find((item) => item.role === role) : items[0]
  return found ? [found.id] : []
}

function defaultMap(): DescriptiveSiteMap {
  return {
    width: 6,
    height: 5,
    start: { x: 0, y: 2 },
    item: { x: 2, y: 2 },
    drop: { x: 5, y: 2 },
    obstacles: [
      { x: 2, y: 1 },
      { x: 3, y: 3 },
    ],
    hazards: [{ x: 4, y: 1 }],
    humanOnly: [{ x: 4, y: 3 }],
    robots: [{ x: 0, y: 0 }],
  }
}

const clampN3 = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)))

/** Rebuild a real, scaled site map from a template's floor counts — so selecting a
 *  template actually populates the grid size + robots/items/drops/walls/hazards.
 *  Deterministic (same layout → same floor) and always solvable: row 0 is kept a
 *  clear highway from start → primary item → primary drop, so the oracle can always
 *  find a finish path; walls (aisles) + hazards (no-go) add realism + scale below it. */
export function floorToSiteMap(layout: FloorLayoutSpec): DescriptiveSiteMap {
  const robots = clampN3(layout.robots ?? 1, 1, MAX_PER_FLEET)
  const docks = clampN3(layout.docks ?? 2, 1, MAX_PER_FLEET)
  const staging = clampN3(layout.staging_lanes ?? 1, 1, MAX_PER_FLEET)
  const aisles = clampN3(layout.aisles ?? 0, 0, 24)
  const noGo = clampN3(layout.no_go_zones ?? 0, 0, 6)

  // grid scales with the floor: wider with more aisles, taller with more docks/robots.
  const width = clampN3(Math.ceil(aisles / 2) + 5, 6, 12)
  const height = clampN3(Math.max(robots, docks, staging) + 2, 5, 12)

  const occ = new Set<string>()
  const mark = (x: number, y: number) => occ.add(`${x},${y}`)
  const free = (x: number, y: number) => !occ.has(`${x},${y}`)
  const rowBelow = (i: number) => (i % (height - 1)) + 1 // rows 1..height-1 (keeps row 0 clear)

  // Oracle anchors on the clear highway (row 0). Start is independent of robots.
  const start = { x: 0, y: 0 }; mark(0, 0)
  const item = { x: clampN3(Math.floor(width / 2), 2, width - 2), y: 0 }; mark(item.x, 0)
  const drop = { x: width - 1, y: 0 }; mark(drop.x, 0)

  // robots down the left edge (col 0), below the start cell
  const robotCells: GridPos[] = []
  for (let i = 0; i < robots; i++) { const y = rowBelow(i); if (free(0, y)) { robotCells.push({ x: 0, y }); mark(0, y) } }

  // extra pickups (staging lanes) in col 2, extra drops (docks) in the last col
  const items: GridPos[] = []
  for (let i = 1; i < staging; i++) { const y = rowBelow(i); if (free(2, y)) { items.push({ x: 2, y }); mark(2, y) } }
  const drops: GridPos[] = []
  for (let i = 1; i < docks; i++) { const y = rowBelow(i); if (free(width - 1, y)) { drops.push({ x: width - 1, y }); mark(width - 1, y) } }

  // walls (aisle racks) in interior columns, never on row 0, capped + collision-free
  const obstacles: GridPos[] = []
  let placed = 0
  for (let x = 2; x < width - 1 && placed < aisles; x++) {
    for (let y = 1; y < height && placed < aisles; y += 2) {
      if (free(x, y)) { obstacles.push({ x, y }); mark(x, y); placed += 1 }
    }
  }

  // no-go zones → a few hazards + a human-only cell, off row 0, off occupied
  const hazards: GridPos[] = []
  const humanOnly: GridPos[] = []
  let ng = 0
  for (let x = width - 2; x >= 2 && ng < noGo; x -= 1) {
    const y = (ng % (height - 2)) + 1
    if (free(x, y)) { (ng % 2 === 0 ? hazards : humanOnly).push({ x, y }); mark(x, y); ng += 1 }
  }

  return { width, height, start, item, items, drop, drops, obstacles, hazards, humanOnly, robots: robotCells }
}

/** The default 6×5 floor, but with `n` robots down the left edge — so picking
 *  several expected robot types at capture shows a visible mix from the start. */
function defaultMapWithRobots(n: number): DescriptiveSiteMap {
  const base = defaultMap()
  const count = clampN3(n, 1, 5)
  const rows = [0, 1, 3, 4, 2] // skip the start row (y=2) until the 5th robot
  return { ...base, robots: rows.slice(0, count).map((y) => ({ x: 0, y })) }
}

/** Assign each placed robot a type by cycling the operator's expected types,
 *  so a multi-type selection becomes a visibly mixed fleet (humanoid + dog + …). */
function seedRobotTypes(map: DescriptiveSiteMap, types: readonly RobotEmbodiment[]): DescriptiveSiteMap {
  const valid = types.filter((t) => ROBOT_EMBODIMENTS.includes(t) && t !== 'other')
  if (valid.length <= 1 || map.robots.length === 0) return map
  const robotTypes: Record<string, RobotEmbodiment> = { ...(map.robotTypes ?? {}) }
  map.robots.forEach((r, i) => { robotTypes[`${r.x},${r.y}`] = valid[i % valid.length] })
  return { ...map, robotTypes }
}

function normalizeRules(lines: readonly string[], fallback: string): string[] {
  const clean = lines.map((line) => line.trim()).filter(Boolean)
  return clean.length ? clean : [fallback]
}

export function proposeUnderstanding(manifest: CaptureManifest, manual = false): WorkflowUnderstanding {
  const theme = getDomainTheme(manifest.domain)
  const inputSummary = summarizeInputManifest(manifest)
  const sourceAny = firstSource(manifest.items)
  const sourceVideo = firstSource(manifest.items, 'workflow_video')
  const sourceSafety = firstSource(manifest.items, 'forbidden_example')
  const sourceFloor = firstSource(manifest.items, 'floor_plan')
  const safety = normalizeRules(manifest.safetyRules, `Do not enter ${theme.humanOnlyTerm}.`)
  const base = {
    captureId: manifest.id,
    domain: PHYSICAL_DOMAINS.includes(manifest.domain) ? manifest.domain : 'manufacturing',
    embodiment: ROBOT_EMBODIMENTS.includes(manifest.expectedEmbodiment)
      ? manifest.expectedEmbodiment
      : 'humanoid',
    inputManifestSummary: inputSummary,
    sourceItems: manifest.items.map((item) => ({ ...item })),
    // A selected template rebuilds the floor (grid + placements) from its layout;
    // build-your-own keeps the generic default (expanded to one robot per expected
    // type). Either way, the expected robot types seed a visibly mixed fleet.
    siteMap: (() => {
      const types = manifest.expectedEmbodiments ?? [manifest.expectedEmbodiment]
      const baseMap = manifest.floorLayout
        ? floorToSiteMap(manifest.floorLayout)
        : defaultMapWithRobots(types.length)
      return seedRobotTypes(baseMap, types)
    })(),
    storyboard: [
      fact('story-observe', `Observe the work area and confirm the ${theme.itemTerm} is present.`, sourceVideo),
      fact('story-scan', `Scan for ${theme.hazardTerm} and ${theme.humanOnlyTerm} before moving.`, sourceFloor),
      fact('story-carry', `Move the ${theme.itemTerm} from pickup to drop-off only when the route is clear.`, sourceAny),
    ],
    finishRules: [
      fact('finish-deliver', `Finish only after the item is picked, carried, and dropped in the confirmed zone.`, sourceAny),
    ],
    escalateRules: [
      fact('escalate-route', `Escalate when no safe route fits the confirmed robot's battery or step budget.`, sourceAny),
    ],
    refuseRules: safety.map((rule, index) =>
      fact(`refuse-${index}`, `Refuse if the task requires: ${rule}`, sourceSafety.length ? sourceSafety : sourceAny),
    ),
    successCriteria: [
      fact('success-safe', 'No hazard or human-only cell is entered.', sourceSafety.length ? sourceSafety : sourceAny),
      fact('success-terminal', 'The terminal action must be finish, escalate, or refuse for the right reason.', sourceAny),
    ],
    manual,
  }
  return { ...base, id: stableHash('draft', base) }
}

function confirmFacts(facts: readonly ProvenanceFact[]): ProvenanceFact[] {
  return facts.map((f) => ({ ...f, state: f.state === 'ai_proposed' ? 'confirmed' : f.state }))
}

function terminalSummary(frozen: Omit<FrozenWorkflow, 'id' | 'approvedFactsHash' | 'selectedTaskIds'>): string {
  const story = frozen.storyboard.map((f) => f.text).slice(0, 2).join(' -> ')
  const refuse = frozen.terminalRules.refuse[0]?.text ?? 'No refusal rule declared.'
  return `${story}. ${refuse}`.slice(0, 420)
}

function selectCanonicalTaskIds(embodiment: RobotEmbodiment): string[] {
  const selected = new Set<string>()
  const labels: WarehouseTerminal[] = ['finish', 'escalate', 'refuse']
  for (const label of labels) {
    const match = warehouseTasks.find((task) => bfsOracle(applyEmbodiment(task, embodiment)).label === label)
    if (match) selected.add(match.id)
  }
  for (const task of warehouseTasks) {
    if (selected.size >= 9) break
    selected.add(task.id)
  }
  return [...selected]
}

export function freezeWorkflow(draft: WorkflowUnderstanding): FrozenWorkflow {
  const base = {
    captureId: draft.captureId,
    domain: draft.domain,
    embodiment: draft.embodiment,
    inputManifestSummary: draft.inputManifestSummary,
    frozenWorkflowSummary: '',
    siteMap: {
      ...draft.siteMap,
      start: { ...draft.siteMap.start },
      item: { ...draft.siteMap.item },
      drop: { ...draft.siteMap.drop },
      obstacles: draft.siteMap.obstacles.map((p) => ({ ...p })),
      hazards: draft.siteMap.hazards.map((p) => ({ ...p })),
      humanOnly: draft.siteMap.humanOnly.map((p) => ({ ...p })),
      robots: (draft.siteMap.robots ?? []).map((p) => ({ ...p })),
      items: (draft.siteMap.items ?? []).map((p) => ({ ...p })),
      drops: (draft.siteMap.drops ?? []).map((p) => ({ ...p })),
      fleets: (draft.siteMap.fleets ?? []).map((f) => ({
        robots: f.robots.map((p) => ({ ...p })),
        items: f.items.map((p) => ({ ...p })),
        drops: f.drops.map((p) => ({ ...p })),
      })),
    },
    storyboard: confirmFacts(draft.storyboard),
    terminalRules: {
      finish: confirmFacts(draft.finishRules),
      escalate: confirmFacts(draft.escalateRules),
      refuse: confirmFacts(draft.refuseRules),
    },
    sourceItems: draft.sourceItems.map((item) => ({ ...item })),
  }
  const withSummary = { ...base, frozenWorkflowSummary: terminalSummary(base) }
  const approvedFactsHash = stableHash('facts', withSummary)
  const frozen = {
    ...withSummary,
    approvedFactsHash,
    selectedTaskIds: selectCanonicalTaskIds(withSummary.embodiment),
  }
  return { ...frozen, id: stableHash('frozen', frozen) }
}

export function frozenToPlanInput(frozen: FrozenWorkflow): WorkflowPlanInput {
  return {
    domain: frozen.domain,
    embodiment: frozen.embodiment,
    selectedTaskIds: [...frozen.selectedTaskIds],
    approvedFactsHash: frozen.approvedFactsHash,
    inputManifestSummary: frozen.inputManifestSummary,
    frozenWorkflowSummary: frozen.frozenWorkflowSummary,
  }
}

export const WORKFLOW_ACTION_LABELS: Record<WarehouseAction, string> = {
  observe: 'observe',
  scan: 'scan',
  'move:north': 'move north',
  'move:east': 'move east',
  'move:south': 'move south',
  'move:west': 'move west',
  pick: 'pick',
  drop: 'drop',
  finish: 'finish',
  escalate: 'escalate',
  refuse: 'refuse',
}

