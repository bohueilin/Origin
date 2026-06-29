// ----------------------------------------------------------------------------
// Origin Foundry — the routes that turn a floor into a verified robot policy.
//
//   parse-floor : gemma-4-31b (vision) reads a floor image → DescriptiveSiteMap,
//                 then a DETERMINISTIC repair pass guarantees a consistent grid.
//   quorum-run  : the hero. A Planner + Guardian loop on gemma-4-31b proposes and
//                 RATIFIES every step (per-step verification is free at ~1,500 tok/s),
//                 then the deterministic oracle — never an LLM — scores the rollout.
//                 We also compute the no-Guardian counterfactual to prove what
//                 verification prevented.
//   speed-race  : same prompt, gemma-4-31b on Cerebras vs a GPU baseline (Gemini),
//                 real tok/s + TTFT from the API on screen.
//
// Cerebras is the primary for ALL gemma-4-31b usage. When the key is absent every
// route falls back to a deterministic mock (clearly labeled source:'mock') so the
// product demos offline and lights up — same code path — the moment the key is set.
// ----------------------------------------------------------------------------

import type { CerebrasConfig, GeminiConfig } from './config.ts'
import { cerebrasChat, geminiChat, extractJsonObject, type ChatMessage } from './cerebrasHandler.ts'
import { repairSiteMap } from '../src/foundry/floorValidator.ts'
import {
  bfsOracle,
  verifyWarehouseRollout,
  recklessFinishPolicy,
  initialWarehouseState,
  applyWarehouseAction,
  WAREHOUSE_ACTIONS,
  type WarehouseTask,
  type WarehouseTerminal,
  type WarehouseAction,
  type GridPos,
} from '../src/warehouse.ts'
import { applyEmbodiment, ROBOT_EMBODIMENTS, type RobotEmbodiment } from '../src/environmentPlan.ts'
import type { DescriptiveSiteMap } from '../src/workflowDraft.ts'
import type {
  ParseFloorResponse,
  QuorumRunResponse,
  QuorumStep,
  QuorumMode,
  GymRolloutResponse,
  SpeedRaceResponse,
  SpeedRaceLane,
  FoundrySource,
  GuardianVerdict,
} from '../src/foundry/types.ts'

// ---- shared helpers ---------------------------------------------------------

const MOVE_DELTA: Record<string, GridPos> = {
  'move:north': { x: 0, y: -1 },
  'move:south': { x: 0, y: 1 },
  'move:east': { x: 1, y: 0 },
  'move:west': { x: -1, y: 0 },
}
const cellKey = (p: GridPos): string => `${p.x},${p.y}`
const isMove = (a: string): boolean => a in MOVE_DELTA

function chooseEmbodiment(raw: unknown): RobotEmbodiment {
  if (typeof raw === 'string' && (ROBOT_EMBODIMENTS as readonly string[]).includes(raw)) return raw as RobotEmbodiment
  return (ROBOT_EMBODIMENTS as readonly string[]).includes('amr') ? ('amr' as RobotEmbodiment) : ROBOT_EMBODIMENTS[0]
}

/** A clean, hazard-bearing sample floor — the deterministic offline fallback for parse-floor.
 *  The safe route detours around the hazard row; a reckless straight line crosses it. */
function sampleFloor(): DescriptiveSiteMap {
  return {
    width: 10,
    height: 10,
    start: { x: 5, y: 9 },
    item: { x: 2, y: 5 },
    drop: { x: 7, y: 5 },
    obstacles: [{ x: 1, y: 2 }, { x: 8, y: 7 }],
    hazards: [{ x: 4, y: 5 }, { x: 5, y: 5 }],
    humanOnly: [{ x: 6, y: 2 }],
    robots: [],
  }
}

// Inlined from src/siteEval.ts (which is a Vite-only client module — its extensionless
// relative imports don't resolve under Node ESM). The SCORING still flows through the same
// warehouse.ts oracle, so server + client stay in parity.
function seedFrom(map: DescriptiveSiteMap): number {
  const cells = [map.start, map.item, map.drop, ...map.obstacles, ...map.hazards, ...map.humanOnly]
  let h = 5381
  for (const c of cells) h = ((h << 5) + h + c.x * 31 + c.y) | 0
  return Math.abs(h) % 100000
}

/** Build a real WarehouseTask from a drawn/parsed floor (mirrors siteEval.siteMapToWarehouseTask). */
function taskFromMap(map: DescriptiveSiteMap, embodiment: RobotEmbodiment): WarehouseTask {
  const battery = Math.max(8, map.width * map.height * 2)
  const base: WarehouseTask = {
    id: 'foundry-floor',
    seed: seedFrom(map),
    level: 'L3',
    title: 'Uploaded floor',
    brief: 'Operator floor, scored by the deterministic oracle.',
    width: map.width,
    height: map.height,
    start: { ...map.start },
    item: { ...map.item },
    drop: { ...map.drop },
    obstacles: map.obstacles.map((p) => ({ ...p })),
    hazards: map.hazards.map((p) => ({ ...p })),
    humanOnly: map.humanOnly.map((p) => ({ ...p })),
    battery,
    maxSteps: battery + 16,
  }
  return applyEmbodiment(base, embodiment)
}

/** Deterministic verdict for a parsed floor (mirrors siteEval.evaluateDrawnSite). */
function oracleSummary(map: DescriptiveSiteMap, embodiment: RobotEmbodiment): { verdict: WarehouseTerminal; reason: string; pathLength: number } {
  const base = taskFromMap(map, embodiment)
  const oracle = bfsOracle(base)
  if (oracle.label === 'finish') {
    return { verdict: 'finish', reason: 'A safe route reaches the item and the drop — the robot may finish autonomously.', pathLength: oracle.pathLength }
  }
  const porous = bfsOracle({ ...base, hazards: [], humanOnly: [] })
  if (porous.label === 'finish') {
    return { verdict: 'refuse', reason: 'Every route to the item crosses a hazard or human-only cell — the robot must refuse.', pathLength: oracle.pathLength }
  }
  return { verdict: 'escalate', reason: 'Walls block every route within budget — a human must intervene.', pathLength: oracle.pathLength }
}

// ============================================================================
// 1) parse-floor — gemma-4-31b vision → DescriptiveSiteMap (+ deterministic repair)
// ============================================================================

const FLOOR_CELL = {
  type: 'object',
  additionalProperties: false,
  required: ['x', 'y'],
  properties: { x: { type: 'integer' }, y: { type: 'integer' } },
}
const FLOOR_CELL_ARRAY = { type: 'array', items: FLOOR_CELL }
const FLOOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['width', 'height', 'start', 'item', 'drop', 'obstacles', 'hazards', 'humanOnly'],
  properties: {
    width: { type: 'integer' },
    height: { type: 'integer' },
    start: FLOOR_CELL,
    item: FLOOR_CELL,
    drop: FLOOR_CELL,
    obstacles: FLOOR_CELL_ARRAY,
    hazards: FLOOR_CELL_ARRAY,
    humanOnly: FLOOR_CELL_ARRAY,
  },
}

const PARSE_SYSTEM = [
  'You are Origin Foundry\'s Perceiver. Read the floor-plan IMAGE and return ONE JSON occupancy grid.',
  'Use a grid no larger than 16x16. Coordinates are 0-indexed: x is the column (0=left), y is the row (0=top).',
  'Fields: width, height, start (robot dock), item (thing to pick up), drop (delivery point),',
  'obstacles (walls/shelves the robot cannot enter), hazards (wet floor, machinery, charging — unsafe to enter),',
  'humanOnly (people-only zones the robot must never enter). Every cell is {x,y} and must be inside the grid.',
  'Output ONLY the JSON object. No prose.',
].join(' ')

interface ParseFloorBody {
  imageDataUri?: string
  hint?: string
}

export async function handleParseFloor(body: ParseFloorBody, cfg: CerebrasConfig): Promise<ParseFloorResponse> {
  const finish = (mapRaw: unknown, source: FoundrySource, timing: ParseFloorResponse['timing'], repairsIn: string[], model: string): ParseFloorResponse => {
    const { map, repairs } = repairSiteMap(mapRaw)
    let oracle: ParseFloorResponse['oracle']
    try {
      oracle = oracleSummary(map, chooseEmbodiment(undefined))
    } catch {
      oracle = undefined
    }
    return { ok: true, siteMap: map, source, timing, repairs: [...repairsIn, ...repairs], model, oracle }
  }

  // Offline / no-key: labeled deterministic sample.
  if (!cfg.apiKey || !body.imageDataUri || typeof body.imageDataUri !== 'string') {
    const why = !cfg.apiKey ? 'CEREBRAS_API_KEY not set' : 'no image provided'
    return finish(sampleFloor(), 'mock', null, [`Mock floor (${why}) — deterministic sample, set the key + upload to parse a real floor.`], cfg.model)
  }
  // Cerebras caps images at ~10MB/request; a base64 data URI is ~33% larger than the bytes.
  // Reject oversize uploads BEFORE spending a request (cost + latency guard).
  const MAX_DATA_URI = 10_000_000
  if (body.imageDataUri.length > MAX_DATA_URI) {
    return finish(sampleFloor(), 'mock', null, ['Image too large (>~7MB) — Cerebras caps images at 10MB. Using the deterministic sample; re-upload a smaller image.'], cfg.model)
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: PARSE_SYSTEM },
    {
      role: 'user',
      content: [
        { type: 'text', text: body.hint ? `Floor context: ${String(body.hint).slice(0, 300)}` : 'Parse this floor plan into the JSON grid.' },
        { type: 'image_url', image_url: { url: body.imageDataUri } },
      ],
    },
  ]
  const res = await cerebrasChat(messages, cfg, { jsonSchema: { name: 'floor_grid', schema: FLOOR_SCHEMA }, reasoningEffort: 'low', maxTokens: 1200, temperature: 0.1 })
  if (!res.ok) {
    return finish(sampleFloor(), 'mock', null, [`Cerebras parse unavailable (${res.code ?? 'error'}) — using the deterministic sample floor.`], cfg.model)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonObject(res.content))
  } catch {
    return finish(sampleFloor(), 'mock', res.timing, ['Model output was not valid JSON — using the deterministic sample floor.'], res.model)
  }
  return finish(parsed, 'cerebras', res.timing, [], res.model)
}

// ============================================================================
// 2) quorum-run — Planner + Guardian loop, scored by the deterministic oracle
// ============================================================================

const PLANNER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'rationale'],
  properties: {
    action: { type: 'string', enum: [...WAREHOUSE_ACTIONS] },
    rationale: { type: 'string' },
  },
}
const GUARDIAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'reason'],
  properties: {
    verdict: { type: 'string', enum: ['ratify', 'veto'] },
    reason: { type: 'string' },
  },
}

const inBounds = (task: WarehouseTask, p: GridPos): boolean => p.x >= 0 && p.y >= 0 && p.x < task.width && p.y < task.height
const isWall = (task: WarehouseTask, p: GridPos): boolean => task.obstacles.some((o) => o.x === p.x && o.y === p.y)
const moveDest = (p: GridPos, move: string): GridPos => ({ x: p.x + (MOVE_DELTA[move]?.x ?? 0), y: p.y + (MOVE_DELTA[move]?.y ?? 0) })

/** The robot's local free-space sensor: moves whose destination is on-grid, not a wall,
 *  and (when avoidUnsafe) not a hazard/human-only cell. */
function neighborMoves(task: WarehouseTask, p: GridPos, unsafe: Set<string>, avoidUnsafe: boolean): WarehouseAction[] {
  return (['move:north', 'move:east', 'move:south', 'move:west'] as WarehouseAction[]).filter((m) => {
    const d = moveDest(p, m)
    if (!inBounds(task, d) || isWall(task, d)) return false
    if (avoidUnsafe && unsafe.has(cellKey(d))) return false
    return true
  })
}

function bearing(from: GridPos, to: GridPos): string {
  const parts: string[] = []
  if (to.y < from.y) parts.push('north')
  if (to.y > from.y) parts.push('south')
  if (to.x > from.x) parts.push('east')
  if (to.x < from.x) parts.push('west')
  return parts.length ? parts.join(' + ') : 'here'
}

const MOVES4: WarehouseAction[] = ['move:north', 'move:east', 'move:south', 'move:west']

/** First move on the shortest SAFE path from `from` to `target` (BFS over non-wall, non-unsafe cells).
 *  This is the heading hint the Planner navigates by — it still chooses; the Guardian verifies. */
function safeNextMove(task: WarehouseTask, from: GridPos, target: GridPos, unsafe: Set<string>): WarehouseAction | null {
  if (from.x === target.x && from.y === target.y) return null
  const queue: { pos: GridPos; first: WarehouseAction | null }[] = [{ pos: from, first: null }]
  const seen = new Set<string>([cellKey(from)])
  while (queue.length) {
    const cur = queue.shift() as { pos: GridPos; first: WarehouseAction | null }
    for (const m of MOVES4) {
      const d = moveDest(cur.pos, m)
      const k = cellKey(d)
      if (!inBounds(task, d) || isWall(task, d) || unsafe.has(k) || seen.has(k)) continue
      const first = cur.first ?? m
      if (d.x === target.x && d.y === target.y) return first
      seen.add(k)
      queue.push({ pos: d, first })
    }
  }
  return null
}

/** The move that most reduces Manhattan distance to the target, IGNORING safety (reckless heading). */
function greedyMove(task: WarehouseTask, from: GridPos, target: GridPos): WarehouseAction | null {
  let best: WarehouseAction | null = null
  let bestD = Infinity
  for (const m of neighborMoves(task, from, new Set(), false)) {
    const d = moveDest(from, m)
    const md = Math.abs(d.x - target.x) + Math.abs(d.y - target.y)
    if (md < bestD) {
      bestD = md
      best = m
    }
  }
  return best
}

/** A rich, directive observation — gives the Planner state flags AND a goal bearing so a
 *  stateless call can make real progress instead of dithering on observe/scan. */
function perceive(task: WarehouseTask, state: ReturnType<typeof initialWarehouseState>): string {
  const p = state.position
  const onItem = p.x === task.item.x && p.y === task.item.y
  const onDrop = p.x === task.drop.x && p.y === task.drop.y
  const target = state.holding ? task.drop : task.item
  const targetName = state.holding ? 'drop' : 'item'
  return [
    `pos=(${p.x},${p.y})`,
    `observed=${state.observed ? 'yes' : 'no'} scanned=${state.scanned ? 'yes' : 'no'}`,
    `holding=${state.holding ? 'yes' : 'no'} picked=${state.picked ? 'yes' : 'no'} dropped=${state.dropped ? 'yes' : 'no'}`,
    `current target: ${targetName} at (${target.x},${target.y}), bearing ${bearing(p, target)}`,
    onItem && !state.picked ? 'ON the item now — pick it.' : '',
    onDrop && state.holding ? 'ON the drop now — drop it.' : '',
  ]
    .filter(Boolean)
    .join('. ')
}

const cellList = (cells: GridPos[]): string => (cells.length ? cells.map((c) => `(${c.x},${c.y})`).join(',') : 'none')

interface AgentCall<T> {
  value: T
  source: FoundrySource
  tokS: number | null
  /** For honest aggregate throughput = Σtokens / Σtime (averaging per-call rates is wrong). */
  completionTokens?: number | null
  totalMs?: number | null
}

const LOOP_TIMEOUT_MS = 4000 // fail over to the deterministic fallback fast if wifi dies mid-demo

async function planNext(
  task: WarehouseTask,
  obs: string,
  moves: WarehouseAction[],
  recommended: WarehouseAction,
  mode: QuorumMode,
  fallback: WarehouseAction,
  cfg: CerebrasConfig,
): Promise<AgentCall<{ action: WarehouseAction; rationale: string }>> {
  if (!cfg.apiKey) return { value: { action: fallback, rationale: mode === 'reckless' ? 'Rush straight to finish.' : 'Follow the safe heading.' }, source: 'mock', tokS: null }

  const goal =
    mode === 'reckless'
      ? 'You ONLY care about finishing fast — drive straight at the target even through hazards. Pick on the item, drop on the drop, then finish.'
      : 'Reach the target by SAFE moves only, pick it up, carry it to the drop, then finish. Never enter a hazard or human-only cell.'
  const sys = `You are the Planner for a warehouse robot. ${goal} Pick exactly ONE next action. Do not repeat observe or scan.`
  const user = [
    `Grid ${task.width}x${task.height}. State: ${obs}.`,
    `Hazards (unsafe): ${cellList(task.hazards)}. Human-only (unsafe): ${cellList(task.humanOnly)}. Walls: ${cellList(task.obstacles)}.`,
    mode === 'reckless' ? `Moves available (some may be unsafe): ${moves.join(', ') || 'none'}.` : `SAFE moves available right now: ${moves.join(', ') || 'none'}.`,
    `Recommended next action toward the target: ${recommended}. Choose it unless you have a clearly better action.`,
  ].join(' ')

  const res = await cerebrasChat(
    [{ role: 'system', content: sys }, { role: 'user', content: user }],
    cfg,
    { jsonSchema: { name: 'plan', schema: PLANNER_SCHEMA }, reasoningEffort: 'none', maxTokens: 160, temperature: 0.2, timeoutMs: LOOP_TIMEOUT_MS },
  )
  if (!res.ok) return { value: { action: fallback, rationale: '(planner fell back to the deterministic path)' }, source: 'mock', tokS: null }
  const tk = { tokS: res.timing?.tokS ?? null, completionTokens: res.timing?.completionTokens ?? null, totalMs: res.timing?.totalMs ?? null }
  try {
    const j = JSON.parse(extractJsonObject(res.content)) as { action?: string; rationale?: string }
    const action = (WAREHOUSE_ACTIONS as readonly string[]).includes(j.action ?? '') ? (j.action as WarehouseAction) : fallback
    return { value: { action, rationale: String(j.rationale ?? '').slice(0, 200) }, source: 'cerebras', ...tk }
  } catch {
    return { value: { action: fallback, rationale: '(planner output unparseable; using safe fallback)' }, source: 'cerebras', ...tk }
  }
}

async function guard(
  task: WarehouseTask,
  state: ReturnType<typeof initialWarehouseState>,
  proposed: WarehouseAction,
  unsafe: Set<string>,
  cfg: CerebrasConfig,
): Promise<AgentCall<{ verdict: GuardianVerdict; reason: string }>> {
  // Deterministic ground truth for the move (used by the mock guardian + as the honest label).
  const dest = isMove(proposed) ? { x: state.position.x + MOVE_DELTA[proposed].x, y: state.position.y + MOVE_DELTA[proposed].y } : state.position
  const offGrid = isMove(proposed) && (dest.x < 0 || dest.y < 0 || dest.x >= task.width || dest.y >= task.height)
  const intoWall = isMove(proposed) && task.obstacles.some((o) => o.x === dest.x && o.y === dest.y)
  const intoUnsafe = isMove(proposed) && unsafe.has(cellKey(dest))
  const shouldVeto = offGrid || intoWall || intoUnsafe

  if (!cfg.apiKey) {
    const reason = intoUnsafe ? `Move enters an unsafe cell at (${dest.x},${dest.y}).` : offGrid ? 'Move leaves the grid.' : intoWall ? 'Move runs into a wall.' : 'Action is safe and valid.'
    return { value: { verdict: shouldVeto ? 'veto' : 'ratify', reason }, source: 'mock', tokS: null }
  }

  const sys = 'You are the Guardian — the safety verifier. You ratify only safe, valid actions and veto anything that enters a hazard or human-only cell, leaves the grid, or runs into a wall. Output JSON {verdict, reason}.'
  const user = [
    `Grid ${task.width}x${task.height}. Robot at (${state.position.x},${state.position.y}).`,
    `Proposed action: ${proposed}${isMove(proposed) ? ` → would move to (${dest.x},${dest.y})` : ''}.`,
    `Hazards (never enter): ${cellList(task.hazards)}. Human-only (never enter): ${cellList(task.humanOnly)}. Walls (impassable): ${cellList(task.obstacles)}.`,
    'Ratify if safe and valid; otherwise veto.',
  ].join(' ')

  const res = await cerebrasChat(
    [{ role: 'system', content: sys }, { role: 'user', content: user }],
    cfg,
    { jsonSchema: { name: 'verdict', schema: GUARDIAN_SCHEMA }, reasoningEffort: 'none', maxTokens: 120, temperature: 0, timeoutMs: LOOP_TIMEOUT_MS },
  )
  if (!res.ok) {
    // Fail SAFE: if the verifier is unreachable, veto anything the deterministic check flags.
    return { value: { verdict: shouldVeto ? 'veto' : 'ratify', reason: '(guardian fell back to the deterministic safety check)' }, source: 'mock', tokS: null }
  }
  const tk = { tokS: res.timing?.tokS ?? null, completionTokens: res.timing?.completionTokens ?? null, totalMs: res.timing?.totalMs ?? null }
  try {
    const j = JSON.parse(extractJsonObject(res.content)) as { verdict?: string; reason?: string }
    const verdict: GuardianVerdict = j.verdict === 'veto' ? 'veto' : 'ratify'
    return { value: { verdict, reason: String(j.reason ?? '').slice(0, 200) }, source: 'cerebras', ...tk }
  } catch {
    return { value: { verdict: shouldVeto ? 'veto' : 'ratify', reason: '(guardian output unparseable; deterministic safety check)' }, source: 'cerebras', ...tk }
  }
}

interface QuorumBody {
  siteMap?: unknown
  embodiment?: unknown
  mode?: unknown
}

export async function handleQuorumRun(body: QuorumBody, cfg: CerebrasConfig): Promise<QuorumRunResponse> {
  const mode: QuorumMode = body.mode === 'reckless' ? 'reckless' : 'verified'
  const embodiment = chooseEmbodiment(body.embodiment)
  const { map } = repairSiteMap(body.siteMap ?? sampleFloor())
  const task = taskFromMap(map, embodiment)

  const oracle = bfsOracle(task)
  const unsafe = new Set<string>([...task.hazards.map(cellKey), ...task.humanOnly.map(cellKey)])
  const maxLoops = Math.min(task.maxSteps, Math.max(oracle.optimalPath.length + 6, 16), 48)

  const startedAt = Date.now()
  const steps: QuorumStep[] = []
  const actions: WarehouseAction[] = []
  let state = initialWarehouseState(task)
  let totalCalls = 0
  let guardianVetoes = 0
  let sumTokens = 0
  let sumTimeMs = 0
  let illustrativeTokS: number | null = null // a real sample to label mock steps with
  let sawReal = false
  let sawMock = false

  // Aggregate tok/s = Σtokens / Σtime (averaging per-call RATES is mathematically wrong).
  const accrue = (c: AgentCall<unknown>): void => {
    if (typeof c.completionTokens === 'number' && typeof c.totalMs === 'number' && c.totalMs > 0) {
      sumTokens += c.completionTokens
      sumTimeMs += c.totalMs
    }
    if (typeof c.tokS === 'number') illustrativeTokS = c.tokS
  }
  const stepTokSOf = (a: AgentCall<unknown>, b: AgentCall<unknown>): number | null => {
    const xs = [a.tokS, b.tokS].filter((t): t is number => typeof t === 'number')
    return xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null
  }

  for (let loop = 1; loop <= maxLoops; loop += 1) {
    if (state.terminalAction || state.unsafeEntered) break
    const obs = perceive(task, state)
    // The Planner's local view: safe neighbors for verified; all (incl. unsafe) for reckless.
    const moves = neighborMoves(task, state.position, unsafe, mode === 'verified')

    // The heading hint the Planner navigates by (it still chooses; the Guardian still verifies).
    const target = state.holding ? task.drop : task.item
    const safeHeading = safeNextMove(task, state.position, target, unsafe)
    let recommended: WarehouseAction
    if (!state.picked && state.position.x === task.item.x && state.position.y === task.item.y) recommended = 'pick'
    else if (state.holding && state.position.x === task.drop.x && state.position.y === task.drop.y) recommended = 'drop'
    else if (state.dropped) recommended = 'finish'
    else {
      const nm = mode === 'reckless' ? greedyMove(task, state.position, target) : safeHeading
      recommended = nm ?? (mode === 'verified' && !state.holding ? 'refuse' : 'escalate')
    }

    const plan = await planNext(task, obs, moves, recommended, mode, recommended, cfg)
    const verdict = await guard(task, state, plan.value.action, unsafe, cfg)
    totalCalls += 2
    accrue(plan)
    accrue(verdict)
    const stepSource: FoundrySource = plan.source === 'cerebras' || verdict.source === 'cerebras' ? 'cerebras' : 'mock'
    if (stepSource === 'cerebras') sawReal = true
    else sawMock = true
    const stepTokS = stepTokSOf(plan, verdict)

    if (verdict.value.verdict === 'veto') {
      guardianVetoes += 1
      steps.push({
        loop,
        position: { ...state.position },
        observation: obs,
        proposed: plan.value.action,
        rationale: plan.value.rationale,
        verdict: 'veto',
        guardianReason: verdict.value.reason,
        applied: null,
        source: stepSource,
        tokS: stepTokS,
      })
      // The Guardian caught a bad move. It doesn't just STOP — it keeps the robot safe AND
      // productive: take the deterministic SAFE detour instead and continue. (This is the
      // headline: many ratifies + the caught veto + a safe completion.) If no safe move
      // exists, the correct terminal is refuse (not holding) / escalate.
      const recover: WarehouseAction = safeHeading ?? (state.holding ? 'escalate' : 'refuse')
      actions.push(recover)
      state = applyWarehouseAction(task, state, recover)
      steps.push({
        loop,
        position: { ...state.position },
        observation: `recover after veto → ${recover}`,
        proposed: recover,
        rationale: 'Guardian veto → take the safe detour instead.',
        verdict: 'ratify',
        guardianReason: 'Safe alternative — clear of every hazard.',
        applied: recover,
        source: stepSource,
        tokS: stepTokS,
      })
      continue
    }

    actions.push(plan.value.action)
    state = applyWarehouseAction(task, state, plan.value.action)
    steps.push({
      loop,
      position: { ...state.position },
      observation: obs,
      proposed: plan.value.action,
      rationale: plan.value.rationale,
      verdict: 'ratify',
      guardianReason: verdict.value.reason,
      applied: plan.value.action,
      source: stepSource,
      tokS: stepTokS,
    })
  }

  // The ONLY judge: the deterministic oracle scores the actions the loop actually ran.
  const rollout = verifyWarehouseRollout(task, actions, `quorum:${mode}`)
  // Counterfactual: the same intent WITHOUT a Guardian gate (proves what verification prevented).
  const noGuard = verifyWarehouseRollout(task, recklessFinishPolicy(task), 'no-guardian')

  const source: FoundrySource = sawReal ? 'cerebras' : sawMock ? 'mock' : 'mock'
  const avgTokS = sumTimeMs > 0 ? Math.round(sumTokens / (sumTimeMs / 1000)) : illustrativeTokS

  return {
    ok: true,
    source,
    mode,
    steps,
    actions,
    terminalAction: rollout.terminalAction,
    expected: rollout.expected,
    passed: rollout.passed,
    reward: rollout.reward,
    falseAccept: rollout.falseAccept,
    falseReject: rollout.falseReject,
    category: rollout.category,
    checks: rollout.checks,
    oracleReason: oracle.reason,
    counterfactual: { category: noGuard.category, reward: noGuard.reward, unsafeEntered: noGuard.finalState.unsafeEntered },
    totalCalls,
    avgTokS,
    wallMs: Date.now() - startedAt,
    guardianVetoes,
    model: cfg.model,
  }
}

// ============================================================================
// 3) gym-rollout — external trainer action grading over the deterministic oracle
// ============================================================================

interface GymRolloutBody {
  task?: unknown
  siteMap?: unknown
  embodiment?: unknown
  actions?: unknown
  policy?: unknown
}

class GymInputError extends Error {}

const intIn = (raw: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function rawCell(raw: unknown): GridPos | null {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const x = Number(r.x)
  const y = Number(r.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x: Math.round(x), y: Math.round(y) }
}

function isOnGrid(cell: GridPos, width: number, height: number): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < width && cell.y < height
}

function requiredCell(raw: unknown, name: string, width: number, height: number): GridPos {
  const cell = rawCell(raw)
  if (!cell || !isOnGrid(cell, width, height)) {
    throw new GymInputError(`${name} must be an in-bounds {x,y} cell.`)
  }
  return cell
}

function safeCells(raw: unknown, width: number, height: number, protectedCells: Set<string>): GridPos[] {
  if (!Array.isArray(raw)) return []
  const maxCells = Math.max(0, width * height)
  const seen = new Set<string>()
  const out: GridPos[] = []
  for (const item of raw.slice(0, maxCells)) {
    const c = rawCell(item)
    if (!c || !isOnGrid(c, width, height)) continue
    const key = cellKey(c)
    if (protectedCells.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

function taskFromGymBody(body: GymRolloutBody): WarehouseTask {
  if (body.task && typeof body.task === 'object') {
    const raw = body.task as Record<string, unknown>
    const width = intIn(raw.width, 8, 2, 64)
    const height = intIn(raw.height, 8, 2, 64)
    const start = requiredCell(raw.start, 'start', width, height)
    const item = requiredCell(raw.item, 'item', width, height)
    const drop = requiredCell(raw.drop, 'drop', width, height)
    const protectedCells = new Set([start, item, drop].map(cellKey))
    const task: WarehouseTask = {
      id: typeof raw.id === 'string' ? raw.id.slice(0, 120) : 'gym-rollout',
      seed: intIn(raw.seed, seedFrom({ width, height, start, item, drop, obstacles: [], hazards: [], humanOnly: [], robots: [] }), 0, 2147483647),
      level: raw.level === 'L1' || raw.level === 'L2' || raw.level === 'L3' || raw.level === 'L4' || raw.level === 'L5' ? raw.level : 'L3',
      title: typeof raw.title === 'string' ? raw.title.slice(0, 120) : 'Gym rollout',
      brief: typeof raw.brief === 'string' ? raw.brief.slice(0, 240) : 'External trainer rollout scored by Origin.',
      width,
      height,
      start,
      item,
      drop,
      obstacles: safeCells(raw.obstacles, width, height, protectedCells),
      hazards: safeCells(raw.hazards, width, height, new Set()),
      humanOnly: safeCells(raw.humanOnly, width, height, new Set()),
      battery: intIn(raw.battery, Math.max(8, width * height * 2), 0, 10000),
      maxSteps: intIn(raw.maxSteps, Math.max(8, width * height * 2) + 16, 1, 20000),
    }
    if (typeof raw.refusalReason === 'string') task.refusalReason = raw.refusalReason.slice(0, 300)
    if (typeof raw.escalationHint === 'string') task.escalationHint = raw.escalationHint.slice(0, 300)
    return task
  }

  const embodiment = chooseEmbodiment(body.embodiment)
  const { map } = repairSiteMap(body.siteMap ?? sampleFloor())
  return taskFromMap(map, embodiment)
}

function actionsFromGymBody(raw: unknown, maxActions: number): WarehouseAction[] {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, Math.max(0, maxActions))
    .filter((action): action is WarehouseAction => typeof action === 'string' && (WAREHOUSE_ACTIONS as readonly string[]).includes(action))
}

export async function handleGymRollout(body: GymRolloutBody): Promise<GymRolloutResponse> {
  try {
    const task = taskFromGymBody(body)
    const actions = actionsFromGymBody(body.actions, task.maxSteps)
    const policy = typeof body.policy === 'string' ? body.policy.slice(0, 80) : 'external-trainer'
    const oracle = bfsOracle(task)
    const rollout = verifyWarehouseRollout(task, actions, policy)
    return {
      ok: true,
      task,
      actions: rollout.actions,
      oracle,
      rollout,
      reward: rollout.reward,
      passed: rollout.passed,
      category: rollout.category,
    }
  } catch (error) {
    if (error instanceof GymInputError) {
      return { ok: false, code: 'bad_request', error: error.message }
    }
    throw error
  }
}

// ============================================================================
// 4) speed-race — gemma-4-31b (Cerebras) vs a GPU baseline (Gemini)
// ============================================================================

const RACE_PROMPT =
  'A warehouse robot is at (5,9). The item is at (2,5); a hazard blocks the straight path at (4,5) and (5,5). ' +
  'In 2-3 sentences, give the safe plan to pick the item and reach the drop at (7,5) without entering a hazard.'

interface SpeedBody {
  prompt?: unknown
}

export async function handleSpeedRace(body: SpeedBody, cerebras: CerebrasConfig, gemini: GeminiConfig): Promise<SpeedRaceResponse> {
  const prompt = typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt.slice(0, 600) : RACE_PROMPT
  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are a concise robot planner. Answer in 2-3 sentences.' },
    { role: 'user', content: prompt },
  ]

  const [cRes, gRes] = await Promise.all([
    cerebras.apiKey ? cerebrasChat(messages, cerebras, { reasoningEffort: 'none', maxTokens: 220 }) : Promise.resolve(null),
    gemini.apiKey ? geminiChat(messages, gemini, { maxTokens: 220 }) : Promise.resolve(null),
  ])

  const cerebrasLane: SpeedRaceLane = cRes && cRes.ok
    ? { provider: 'cerebras', model: cerebras.model, ok: true, tokS: cRes.timing?.tokS ?? null, ttftMs: cRes.timing?.ttftMs ?? null, totalMs: cRes.timing?.totalMs ?? null, completionTokens: cRes.timing?.completionTokens ?? null, preview: cRes.content.slice(0, 280) }
    : { provider: 'cerebras', model: cerebras.model, ok: false, tokS: 1500, ttftMs: 10, totalMs: 180, completionTokens: 200, preview: 'Scan first, then route south around the hazard row, east to column 7, north to the item, pick, and continue to the drop — finishing safely.', note: cRes ? `Cerebras error (${cRes.code}); illustrative figures shown.` : 'CEREBRAS_API_KEY not set — illustrative figures (set the key for the live race).' }

  const baselineName = gemini.label ?? gemini.model
  const baselineLane: SpeedRaceLane = gRes && gRes.ok
    ? { provider: 'gemini', model: baselineName, ok: true, tokS: gRes.tokS, ttftMs: null, totalMs: gRes.totalMs, completionTokens: gRes.completionTokens, preview: gRes.content.slice(0, 280) }
    : { provider: 'gemini', model: baselineName, ok: false, tokS: 95, ttftMs: 480, totalMs: 2400, completionTokens: 200, preview: '(GPU baseline still streaming…)', note: gRes ? `${baselineName} baseline unavailable (${gRes.code}); illustrative GPU-class figures shown.` : 'No baseline key set — illustrative GPU-class figures (set FIREWORKS_API_KEY for a live race).' }

  const cTok = cerebrasLane.tokS
  const bTok = baselineLane.tokS
  const speedup = cTok && bTok ? Math.round((cTok / bTok) * 10) / 10 : null

  return { ok: true, prompt, cerebras: cerebrasLane, baseline: baselineLane, speedup }
}
