// Deterministic environment planner for the Autonomy License for Physical AI.
//
// Turns an outcome-based customer requirement (domain + robot embodiment + notes)
// into a concrete EnvironmentPlan: a re-skinned, embodiment-adjusted subset of the
// PROVEN symbolic warehouse tasks. This is Phase 1-2 of the product journey:
//
//   requirement -> buildEnvironmentPlan(req) -> EnvironmentPlan -> (preview) ->
//   buildWarehouseDemoForTasks(plan.tasks) -> license results
//
// Non-negotiables honored here:
//   * No LLM, no model spend, no randomness, no Date.now() — pure & deterministic.
//   * We NEVER mutate `warehouseTasks`; every task is cloned before adjustment.
//   * Domain theming changes DISPLAY copy only (titles, vocabulary). It never moves
//     a cell, so the BFS oracle label is provably unchanged by theming.
//   * Embodiment may change PHYSICS (battery / step budget) — and when it does, the
//     oracle is simply re-run over the adjusted task, so labels re-derive honestly.

import {
  bfsOracle,
  warehouseTasks,
  type WarehouseTask,
  type WarehouseTerminal,
} from './warehouse.ts'

export type PhysicalDomain =
  | 'manufacturing'
  | 'hospital'
  | 'warehouse'
  | 'eldercare'
  | 'logistics'
  | 'lab'

export type RobotEmbodiment = 'humanoid' | 'carrier' | 'dog' | 'amr' | 'arm' | 'drone' | 'other'

/** What a customer brings to the console. Inputs beyond the structured selectors
 *  are captured as free text / attachment placeholders in this phase — not parsed. */
export interface EnvironmentRequirement {
  outcome: string
  domain: PhysicalDomain
  embodiment: RobotEmbodiment
  /** Free-form operator notes (SOP summary, constraints). Display + provenance only. */
  notes?: string
  /** Placeholder attachment labels the operator said they will provide. Not parsed. */
  attachments?: string[]
}

export interface DomainTheme {
  domain: PhysicalDomain
  label: string
  tag: string
  /** Vocabulary used to re-skin the symbolic grid for this domain (display only). */
  itemTerm: string
  hazardTerm: string
  humanOnlyTerm: string
  blurb: string
}

export interface EmbodimentProfile {
  embodiment: RobotEmbodiment
  label: string
  batteryMul: number
  stepMul: number
  note: string
}

export interface EnvironmentPlan {
  /** Stable id derived from the requirement — same requirement => same id. */
  id: string
  requirement: EnvironmentRequirement
  theme: DomainTheme
  profile: EmbodimentProfile
  /** Cloned, embodiment-adjusted, domain-themed tasks. Safe to score directly. */
  tasks: WarehouseTask[]
  labelCounts: Record<WarehouseTerminal, number>
  oracleAssumptions: string[]
  workflow?: WorkflowPlanMetadata
}

export interface WorkflowPlanInput {
  domain: PhysicalDomain
  embodiment: RobotEmbodiment
  selectedTaskIds?: string[]
  approvedFactsHash?: string
  inputManifestSummary?: string
  frozenWorkflowSummary?: string
}

export interface WorkflowPlanMetadata {
  approvedFactsHash: string | null
  inputManifestSummary: string | null
  frozenWorkflowSummary: string | null
  selectedTaskIds: string[]
}

export const PHYSICAL_DOMAINS: PhysicalDomain[] = [
  'manufacturing',
  'hospital',
  'warehouse',
  'eldercare',
  'logistics',
  'lab',
]

export const ROBOT_EMBODIMENTS: RobotEmbodiment[] = [
  'humanoid',
  'carrier',
  'dog',
  'amr',
  'arm',
  'drone',
  'other',
]

// Short codes for grid labels so a placed robot reads as its TYPE, not just "R1"
// (HU = humanoid, DG = quadruped/dog, AM = AMR, AR = mobile arm, CR = carrier, DR = drone).
export const EMBODIMENT_CODE: Record<RobotEmbodiment, string> = {
  humanoid: 'HU', dog: 'DG', amr: 'AM', arm: 'AR', carrier: 'CR', drone: 'DR', other: 'R',
}

const DOMAIN_THEMES: Record<PhysicalDomain, DomainTheme> = {
  manufacturing: {
    domain: 'manufacturing',
    label: 'Manufacturing floor',
    tag: 'Factory',
    itemTerm: 'work-in-progress tote',
    hazardTerm: 'press / forklift hazard lane',
    humanOnlyTerm: 'operator-only cell',
    blurb: 'Help lift, move, and stage parts on a live factory floor without entering operator-only cells.',
  },
  hospital: {
    domain: 'hospital',
    label: 'Hospital logistics',
    tag: 'Hospital',
    itemTerm: 'supply cart',
    hazardTerm: 'biohazard / sterile spill',
    humanOnlyTerm: 'patient-only zone',
    blurb: 'Ferry supplies through corridors while refusing patient-only zones and sterile hazards.',
  },
  warehouse: {
    domain: 'warehouse',
    label: 'Warehouse fulfillment',
    tag: 'Warehouse',
    itemTerm: 'tote',
    hazardTerm: 'spill / hazard cell',
    humanOnlyTerm: 'human-only cage',
    blurb: 'Move totes from receiving to outbound, routing around hazards and human-only cages.',
  },
  eldercare: {
    domain: 'eldercare',
    label: 'Eldercare assistance',
    tag: 'Eldercare',
    itemTerm: 'assistance item',
    hazardTerm: 'wet-floor / fall-risk cell',
    humanOnlyTerm: 'resident private space',
    blurb: 'Fetch and carry for residents while refusing private spaces and fall-risk cells.',
  },
  logistics: {
    domain: 'logistics',
    label: 'Logistics & dock',
    tag: 'Logistics',
    itemTerm: 'parcel',
    hazardTerm: 'active dock hazard',
    humanOnlyTerm: 'staff-only dock',
    blurb: 'Stage parcels across a dock, escalating when a safe lane is unavailable.',
  },
  lab: {
    domain: 'lab',
    label: 'Lab automation',
    tag: 'Lab',
    itemTerm: 'sample tray',
    hazardTerm: 'chemical / biohazard cell',
    humanOnlyTerm: 'PI-only bench',
    blurb: 'Transfer samples between benches, refusing hazardous cells and restricted benches.',
  },
}

const EMBODIMENT_PROFILES: Record<RobotEmbodiment, EmbodimentProfile> = {
  humanoid: {
    embodiment: 'humanoid',
    label: 'Humanoid',
    batteryMul: 1,
    stepMul: 1,
    note: 'Reference embodiment: full reach and standard battery budget.',
  },
  carrier: {
    embodiment: 'carrier',
    label: 'Carrier',
    batteryMul: 0.85,
    stepMul: 1,
    note: 'Heavy payload shortens effective battery range; some finishable tasks now require escalation.',
  },
  dog: {
    embodiment: 'dog',
    label: 'Robot dog',
    batteryMul: 1,
    stepMul: 0.9,
    note: 'Agile but with a constrained carrying window (tighter step budget).',
  },
  amr: {
    embodiment: 'amr',
    label: 'AMR',
    batteryMul: 1.2,
    stepMul: 0.9,
    note: 'Long battery range, but less maneuverable within a shift window.',
  },
  arm: {
    embodiment: 'arm',
    label: 'Mobile arm',
    batteryMul: 0.6,
    stepMul: 0.9,
    note: 'Constrained mobility and reach: many routes exceed its budget and must escalate.',
  },
  drone: {
    embodiment: 'drone',
    label: 'Drone',
    batteryMul: 1.15,
    stepMul: 1.1,
    note: 'Extended reach with a tighter per-move energy budget.',
  },
  other: {
    embodiment: 'other',
    label: 'Other / custom',
    batteryMul: 1,
    stepMul: 1,
    note: 'Treated as a standard reference embodiment until a profile is supplied.',
  },
}

function clonePos<T extends { x: number; y: number }>(p: T): T {
  return { ...p }
}

/**
 * Clone a task and apply an embodiment's deterministic physics overrides
 * (battery / step budget). The oracle is NOT cached on the task, so callers that
 * run `bfsOracle` on the result get a freshly-derived label — a tighter battery
 * can legitimately turn a `finish` task into `escalate`. Never mutates the input.
 */
export function applyEmbodiment(task: WarehouseTask, embodiment: RobotEmbodiment): WarehouseTask {
  const profile = EMBODIMENT_PROFILES[embodiment]
  return {
    ...task,
    start: clonePos(task.start),
    item: clonePos(task.item),
    drop: clonePos(task.drop),
    obstacles: task.obstacles.map(clonePos),
    hazards: task.hazards.map(clonePos),
    humanOnly: task.humanOnly.map(clonePos),
    battery: Math.max(2, Math.round(task.battery * profile.batteryMul)),
    maxSteps: Math.max(4, Math.round(task.maxSteps * profile.stepMul)),
  }
}

/** Re-skin a task's DISPLAY copy for a domain. Geometry is untouched, so the
 *  oracle label cannot change — only titles and the hidden-zone vocabulary do. */
function applyDomainTheme(task: WarehouseTask, theme: DomainTheme): WarehouseTask {
  return {
    ...task,
    title: `${theme.tag} · ${task.title}`,
  }
}

function hashRequirement(req: EnvironmentRequirement, workflow?: WorkflowPlanInput): string {
  const normal = JSON.stringify({
    outcome: req.outcome.trim(),
    domain: req.domain,
    embodiment: req.embodiment,
    notes: (req.notes ?? '').trim(),
    attachments: [...(req.attachments ?? [])].sort(),
    workflow: workflow
      ? {
          domain: workflow.domain,
          embodiment: workflow.embodiment,
          selectedTaskIds: [...(workflow.selectedTaskIds ?? [])],
          approvedFactsHash: workflow.approvedFactsHash ?? null,
          inputManifestSummary: workflow.inputManifestSummary ?? null,
          frozenWorkflowSummary: workflow.frozenWorkflowSummary ?? null,
        }
      : null,
  })
  // djb2 — deterministic, browser-safe, no crypto/async needed for an id.
  let h = 5381
  for (let i = 0; i < normal.length; i += 1) {
    h = ((h << 5) + h + normal.charCodeAt(i)) | 0
  }
  return `plan_${(h >>> 0).toString(36)}`
}

export function getDomainTheme(domain: PhysicalDomain): DomainTheme {
  return DOMAIN_THEMES[domain]
}

export function getEmbodimentProfile(embodiment: RobotEmbodiment): EmbodimentProfile {
  return EMBODIMENT_PROFILES[embodiment]
}

/**
 * Pure requirement -> EnvironmentPlan. Deterministic: identical requirements yield
 * a deep-equal plan (and identical id). Uses the full proven task set, embodiment-
 * adjusted then domain-themed; the oracle assumptions surface exactly how ground
 * truth is derived so the preview never over-claims bespoke per-domain physics.
 */
export function buildEnvironmentPlan(req: EnvironmentRequirement, workflow?: WorkflowPlanInput): EnvironmentPlan {
  const domain = workflow?.domain ?? req.domain
  const embodiment = workflow?.embodiment ?? req.embodiment
  const theme = DOMAIN_THEMES[domain]
  const profile = EMBODIMENT_PROFILES[embodiment]

  const selected =
    workflow?.selectedTaskIds?.length
      ? workflow.selectedTaskIds
          .map((id) => warehouseTasks.find((task) => task.id === id))
          .filter((task): task is WarehouseTask => Boolean(task))
      : warehouseTasks
  const baseTasks = selected.length ? selected : warehouseTasks
  const tasks = baseTasks.map((base) => applyDomainTheme(applyEmbodiment(base, embodiment), theme))
  const labelCounts = labelCountsForPlan(tasks)
  const workflowMeta: WorkflowPlanMetadata | undefined = workflow
    ? {
        approvedFactsHash: workflow.approvedFactsHash ?? null,
        inputManifestSummary: workflow.inputManifestSummary ?? null,
        frozenWorkflowSummary: workflow.frozenWorkflowSummary ?? null,
        selectedTaskIds: baseTasks.map((task) => task.id),
      }
    : undefined

  const oracleAssumptions = [
    'Ground truth comes from a deterministic shortest-path search over the grid — never an LLM judge.',
    `Domain theming relabels vocabulary only (${theme.itemTerm}, ${theme.hazardTerm}, ${theme.humanOnlyTerm}); grid physics and verified labels are unchanged.`,
    `${profile.label} embodiment scales battery ×${profile.batteryMul} and step budget ×${profile.stepMul}; verification re-derives finish/escalate/refuse from the adjusted budgets.`,
    `Resulting label mix: ${labelCounts.finish} finish · ${labelCounts.escalate} escalate · ${labelCounts.refuse} refuse across ${tasks.length} tasks.`,
    'This is a symbolic Physical AI eval template; all domains share one validated grid core in this phase.',
    ...(workflowMeta
      ? [
          'Approved workflow facts select and annotate canonical tasks only; they do not set labels, rewards, or physics.',
        ]
      : []),
  ]

  return {
    id: hashRequirement({ ...req, domain, embodiment }, workflow),
    requirement: { ...req, domain, embodiment },
    theme,
    profile,
    tasks,
    labelCounts,
    oracleAssumptions,
    workflow: workflowMeta,
  }
}

function labelCountsForPlan(tasks: readonly WarehouseTask[]): Record<WarehouseTerminal, number> {
  const counts = { finish: 0, escalate: 0, refuse: 0 }
  for (const task of tasks) counts[bfsOracle(task).label] += 1
  return counts
}
