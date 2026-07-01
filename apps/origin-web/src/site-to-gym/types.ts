import type { CaptureItem, CaptureManifest } from '../captureManifest'
import type { FoundrySource } from '../foundry/types'
import type { DescriptiveSiteMap } from '../workflowDraft'
import type { WarehouseOracle, WarehouseTask, WarehouseTerminal } from '../warehouse'
import type { CustomerFloorSpec } from './customerFloorExport'

export type SiteGymStepStatus = 'pending' | 'processing' | 'complete' | 'needs_review' | 'failed'

export type SiteInputCategory =
  | 'floor_plan'
  | 'video'
  | 'photo'
  | 'reference'
  | 'safety_rule'
  | 'robot_profile'
  | 'notes'
  | 'unsupported'

export interface SiteGymPipelineStep {
  id: string
  label: string
  status: SiteGymStepStatus
  confidence: number
  artifactPreview: string
  action?: string
}

export type SiteArtifactSourceType = 'floor_plan' | 'video' | 'photo' | 'notes' | 'reference' | 'fallback'
export type SiteExtractionMethod =
  | 'parser'
  | 'keyframe'
  | 'ocr'
  | 'manual_note'
  | 'deterministic_fallback'
  | 'metadata'

export interface SiteArtifactProvenance {
  artifactId: string
  sourceInputId: string
  sourceType: SiteArtifactSourceType
  extractionMethod: SiteExtractionMethod
  confidence: number
  requiresReview: boolean
  label: string
  details: string
}

export interface FloorPlanParserResult {
  itemId: string
  ok: boolean
  method: 'parser' | 'deterministic_fallback'
  source: FoundrySource | 'unavailable'
  siteMap: DescriptiveSiteMap | null
  repairs: string[]
  model: string | null
  confidence: number
  requiresReview: boolean
  summary: string
  error?: string
}

export interface ReviewState {
  status: 'draft' | 'approved' | 'needs_correction' | 'exported'
  reviewerNotes?: string
  approvedAt?: string
  exportedAt?: string
}

export interface VideoKeyframeArtifact {
  id: string
  label: string
  offsetSeconds: number
  confidence: number
  thumbnailDataUrl?: string
  simulated: boolean
  observation: string
}

export interface SiteHint {
  id: string
  kind: 'path' | 'obstacle' | 'restricted_zone' | 'landmark' | 'scale' | 'uncertainty'
  label: string
  confidence: number
  sourceItemIds: string[]
}

export interface ExtractedSiteArtifact {
  itemId: string
  inputName: string
  category: SiteInputCategory
  status: SiteGymStepStatus
  confidence: number
  summary: string
  extractedArtifacts: string[]
  hints: SiteHint[]
  keyframes: VideoKeyframeArtifact[]
  provenance: SiteArtifactProvenance[]
  parserResult?: FloorPlanParserResult
  signageCues: SignageCue[]
  materiallyImprovedMap: boolean
  errors: string[]
}

export interface SiteRegion {
  id: string
  label: string
  type: string
  confidence: number
  sourceItemIds: string[]
}

export interface SitePath {
  id: string
  label: string
  from: [number, number]
  to: [number, number]
  confidence: number
  sourceItemIds: string[]
}

export interface SiteRepresentation {
  site_id: string
  source_inputs: SiteInputCategory[]
  dimensions: { width: number; length: number }
  zones: SiteRegion[]
  rooms: SiteRegion[]
  doors: SiteRegion[]
  paths: SitePath[]
  obstacles: SiteRegion[]
  restricted_zones: SiteRegion[]
  goals: SiteRegion[]
  uncertain_regions: SiteRegion[]
  confidence: {
    overall: number
    topology: number
    obstacle_detection: number
    zone_detection: number
  }
  provenance: SiteArtifactProvenance[]
  parserSource: 'parsed_from_floor_plan' | 'video_photo_context' | 'generated_fallback' | 'mixed_source' | 'notes_only'
  requiresHumanReview: boolean
}

export interface Site3DAwareContext {
  vertical_context: string[]
  camera_path_hints: string[]
  depth_or_scale_hints: string[]
  landmarks: string[]
  confidence: number
  boundary: string
}

export interface RobotReadinessTask {
  id: string
  category:
    | 'normal_finish'
    | 'obstacle_avoidance'
    | 'ambiguous_route'
    | 'restricted_zone'
    | 'blocked_path'
    | 'alternate_route'
    | 'ambiguous_goal'
    | 'human_only_zone'
    | 'obstacle_near_goal'
    | 'unsafe_shortcut'
    | 'multi_step_delivery'
    | 'pickup_dropoff_validation'
    | 'budget_exhaustion'
    | 'low_confidence_region'
    | 'missing_information'
    | 'human_escalation'
    | 'hard_refusal'
  description: string
  start_state: [number, number]
  goal_state: [number, number]
  constraints: string[]
  required_evidence: string[]
  source_map_feature: string
  reason: string
  risk_class: 'routine' | 'needs_review' | 'safety_critical'
  warehouseTask: WarehouseTask
  expectedOracleVerdict: WarehouseTerminal
  oracle: WarehouseOracle
}

export interface ReadinessMetrics {
  taskCount: number
  labelDistribution: Record<WarehouseTerminal, number>
  oracleAgreement: number
  falseAcceptRisk: number
  falseRefuseRisk: number
  refusalRecall: number
  balancedAccuracy: number
  taskCoverage: number
  traceCompleteness: number
  readinessScore: number
}

export interface SiteGymTrace {
  trace_id: string
  inputs: Pick<CaptureItem, 'id' | 'name' | 'type' | 'size' | 'role' | 'source'>[]
  extracted_artifacts: string[]
  artifact_provenance: SiteArtifactProvenance[]
  review_state: ReviewState
  site_representation_version: string
  gym_version: string
  oracle_version: string
  task_set_version: string
  metrics: ReadinessMetrics
  verdict: 'ready' | 'needs_review' | 'blocked'
  digest: string
}

export interface SignageCue {
  id: string
  cue: string
  normalized: string
  sourceItemId: string
  confidence: number
  contributesTo: 'restricted_zone' | 'escalation' | 'landmark' | 'hazard'
}

export interface EvidenceBundle {
  bundleId: string
  files: {
    path: string
    mimeType: string
    content: string
  }[]
  siteRepresentation: SiteRepresentation
  gymTasks: Array<{
    id: string
    category: RobotReadinessTask['category']
    description: string
    riskClass: RobotReadinessTask['risk_class']
    expectedOracleVerdict: WarehouseTerminal
    requiredEvidence: string[]
    sourceMapFeature: string
    reason: string
    task: WarehouseTask
  }>
  oracleLabels: Array<{
    taskId: string
    verdict: WarehouseTerminal
    reason: string
    pathLength: number
  }>
  readinessMetrics: ReadinessMetrics
  trace: SiteGymTrace
  claimBoundaries: string[]
  reviewState: ReviewState
  customerFloor: CustomerFloorSpec
}

export interface SiteToGymRun {
  manifest: CaptureManifest
  extractedArtifacts: ExtractedSiteArtifact[]
  siteRepresentation: SiteRepresentation
  siteMap: DescriptiveSiteMap
  threeDContext: Site3DAwareContext
  tasks: RobotReadinessTask[]
  pipelineSteps: SiteGymPipelineStep[]
  metrics: ReadinessMetrics
  trace: SiteGymTrace
  reviewState: ReviewState
  provenance: SiteArtifactProvenance[]
  parserResults: FloorPlanParserResult[]
  signageCues: SignageCue[]
  evidenceBundle: EvidenceBundle
  customerFloor: CustomerFloorSpec
  claimBoundary: string[]
}

export interface SiteToGymInput {
  manifest: CaptureManifest
  filesById?: Record<string, File>
  reviewState?: ReviewState
  parseFloorPlan?: (item: CaptureItem, file: File | undefined, manifest: CaptureManifest) => Promise<FloorPlanParserResult>
}
