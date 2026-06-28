// Typed contracts for the FactoryCEO "brain" (the plan → verify → repair → RL
// subsystem we consolidated into Origin). These replace the teammate's
// `Json = Record<string, any>` so the brain data flows through Origin lint-clean
// (no `any`). Deep/loosely-shaped fields are typed `unknown` and narrowed at use.

/** Loose JSON object — use only where the shape is genuinely open-ended. */
export type Json = Record<string, unknown>

// ---- capture input ----------------------------------------------------------
export interface BrainFile {
  name: string
  type: string
  /** base64 data URL of a sampled frame / thumbnail (metadata-only in the demo). */
  dataUrl?: string
}
export interface BrainInput {
  text: string
  files: BrainFile[]
}

// ---- verifier + repair ------------------------------------------------------
export interface VerifierError {
  type: string
  detail: string
  refs?: Record<string, string>
}
export interface VerifierResult {
  reward: number
  n_hard: number
  errors: VerifierError[]
}
/** One step of the recursive repair trace (loosely shaped across versions). */
export interface RepairStep {
  error?: VerifierError | string
  repair_action?: string
  action?: string
  reward_after?: number
  errors_after?: number
  [k: string]: unknown
}

// ---- humanoid task queue (drives MuJoCo + the 3D floor) ----------------------
export interface IsaacTaskStep {
  job: string
  operation: string
  task: string
  machine: string
  machine_xy: [number, number]
  start_hr: number
  end_hr: number
  embodiment: 'humanoid' | 'human' | string
}
export interface FloorLayout {
  floorplan_id?: string
  cell_spacing?: number
  bounds?: number[]
  stations?: Record<string, Json>
  machines?: Record<string, Json>
  n_stations?: number
  kinds?: Record<string, string>
  layout?: unknown
}
export interface IsaacTasks {
  meta: {
    verified: boolean
    hard_violations: number
    safety_incidents?: number
    horizon_hours?: number
    machines?: Json
    floor_layout?: FloorLayout
  }
  safety_controls?: Json[]
  robot_queues: Record<string, IsaacTaskStep[]>
  all_queues?: Record<string, IsaacTaskStep[]>
}

// ---- episode + reward -------------------------------------------------------
export interface FactoryState {
  horizon_days?: number
  machines?: Json[]
  operators?: Json[]
  materials?: Json[]
  jobs?: Json[]
  rfqs?: Json[]
}
export interface Episode {
  synth_id?: string
  exercise?: string[]
  observation?: { messy_prompt?: string; factory_state?: FactoryState }
  initial_plan?: Json
  verifier_before?: VerifierResult
  repair_trace?: RepairStep[]
  final_plan?: Json
  verifier_after?: VerifierResult
  ruler_soft?: number
}
export interface RewardBundle {
  reward: number
  verifier: number
  ruler?: number
  ruler_backend?: string
  ruler_rationale?: string
}

// ---- intake / reasoning -----------------------------------------------------
export interface Intake {
  industry?: string
  n_jobs?: number
  source?: string
  summary?: string
  layout?: Json
  floorplan?: { id?: string; file?: string }
  job_source?: Json
  provenance?: Json
  scenario?: string
  scenario_method?: string
  scenario_note?: string
}
export interface Reasoning {
  observations?: string[]
  assumptions?: string[]
  plan?: string[]
  risks?: string[]
}

// ---- a full brain run (cached library/{id}.json or a live result) -----------
export interface BrainRun {
  episode?: Episode
  isaac_tasks?: IsaacTasks
  naive_isaac_tasks?: IsaacTasks
  naive_verdict?: { hard_violations: number }
  intake?: Intake
  reward?: RewardBundle
  reasoning?: Reasoning
  region?: { verified?: boolean }
  /** Per-model HUD rollout evidence, when present. */
  job_source?: Json
}

// ---- floor catalog (public/factoryceo/library.json) -------------------------
export interface FloorCatalogEntry {
  id: string
  label: string
  industry?: string
  machines?: string[]
  n_jobs?: number
  horizon_days?: number
  layout?: Json
  floorplan?: { id?: string; file?: string }
  job_source?: Json
  scenario?: string
  provenance?: Json
  metrics?: Json
  verified?: boolean
  naive_violations?: number
}
export interface FloorCatalog {
  floors: FloorCatalogEntry[]
  count: number
  note?: string
}

// ---- streaming events (POST /plan_from_input_stream) ------------------------
export interface BrainStreamEvent {
  type: string
  stage?: string
  message?: string
  data?: BrainRun
}
