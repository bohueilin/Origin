import { describe, expect, it } from 'vitest'
import { createCaptureManifest, fileMetaToCaptureItem } from '../captureManifest'
import { runSiteToGymPipeline } from './pipeline'
import { approveReviewState, correctionReviewState } from './humanReview'
import { createDemoSitePackage } from './samplePackage'
import type { FloorPlanParserResult } from './types'

describe('site-to-gym pipeline', () => {
  async function sampleRun() {
    const video = fileMetaToCaptureItem({ name: 'north-dock-walkthrough.mp4', type: 'video/mp4', size: 18_000_000 }, 0)
    const floor = fileMetaToCaptureItem({ name: 'factory-floor-layout.png', type: 'image/png', size: 2_100_000 }, 1)
    const photo = fileMetaToCaptureItem({ name: 'dock-door-photo.jpg', type: 'image/jpeg', size: 750_000 }, 2)
    const manifest = createCaptureManifest({
      outcome: 'Move totes from receiving to packing without entering restricted operator cells.',
      domain: 'manufacturing',
      expectedEmbodiment: 'humanoid',
      expectedEmbodiments: ['humanoid', 'amr'],
      description: 'Walk the north dock route, pick the tote, avoid the forklift lane, and drop at packing.',
      safetyRules: ['Never enter operator-only cells', 'Refuse restricted pickup zones', 'Escalate when battery cannot complete the route'],
      items: [video, floor, photo],
    })
    return runSiteToGymPipeline({ manifest })
  }

  async function parsedRun() {
    const sample = createDemoSitePackage()
    const parser = async (item: typeof sample.items[number]): Promise<FloorPlanParserResult> => ({
      itemId: item.id,
      ok: true,
      method: 'parser',
      source: 'cerebras',
      siteMap: {
        width: 9,
        height: 6,
        start: { x: 0, y: 3 },
        item: { x: 4, y: 3 },
        drop: { x: 8, y: 3 },
        obstacles: [{ x: 3, y: 1 }],
        hazards: [{ x: 7, y: 1 }],
        humanOnly: [{ x: 7, y: 5 }],
        robots: [],
      },
      repairs: ['unit-test parser map'],
      model: 'gemma-4-31b',
      confidence: 0.84,
      requiresReview: true,
      summary: 'Parsed from floor plan by gemma-4-31b.',
    })
    return runSiteToGymPipeline({ manifest: sample.manifest, parseFloorPlan: parser })
  }

  it('accepts video input and creates keyframe artifacts without storing raw files', async () => {
    const run = await sampleRun()
    const videoArtifact = run.extractedArtifacts.find((artifact) => artifact.category === 'video')
    expect(videoArtifact).toBeTruthy()
    expect(videoArtifact?.keyframes).toHaveLength(4)
    expect(videoArtifact?.keyframes.every((frame) => frame.simulated)).toBe(true)
    expect(videoArtifact?.materiallyImprovedMap).toBe(true)
    expect(JSON.stringify(run.trace.inputs)).not.toContain('File')
  })

  it('generates a structured site representation and bounded 3D-aware context', async () => {
    const run = await sampleRun()
    expect(run.siteRepresentation.source_inputs).toEqual(expect.arrayContaining(['video', 'floor_plan', 'photo']))
    expect(run.siteRepresentation.dimensions.width).toBeGreaterThan(0)
    expect(run.siteRepresentation.paths.length).toBeGreaterThan(0)
    expect(run.siteRepresentation.obstacles.length).toBeGreaterThan(0)
    expect(run.siteRepresentation.restricted_zones.length).toBeGreaterThan(0)
    expect(run.siteRepresentation.confidence.overall).toBeGreaterThan(0.6)
    expect(run.siteRepresentation.parserSource).toBe('generated_fallback')
    expect(run.siteRepresentation.requiresHumanReview).toBe(true)
    expect(run.threeDContext.camera_path_hints.join(' ')).toContain('walkthrough')
    expect(run.threeDContext.boundary).toContain('not production-grade')
  })

  it('compiles RSI tasks and labels finish/escalate/refuse with the deterministic oracle', async () => {
    const run = await sampleRun()
    expect(run.tasks.map((task) => task.category)).toEqual([
      'normal_finish',
      'obstacle_avoidance',
      'alternate_route',
      'ambiguous_route',
      'ambiguous_goal',
      'restricted_zone',
      'human_only_zone',
      'blocked_path',
      'obstacle_near_goal',
      'unsafe_shortcut',
      'low_confidence_region',
      'missing_information',
      'multi_step_delivery',
      'pickup_dropoff_validation',
      'human_escalation',
      'budget_exhaustion',
      'hard_refusal',
    ])
    const labels = new Set(run.tasks.map((task) => task.expectedOracleVerdict))
    expect(labels).toEqual(new Set(['finish', 'escalate', 'refuse']))
    for (const task of run.tasks) {
      expect(task.oracle.label).toBe(task.expectedOracleVerdict)
      expect(task.constraints).toContain('deterministic oracle is the only labeler')
      expect(task.source_map_feature.length).toBeGreaterThan(0)
      expect(task.reason).toBe(task.oracle.reason)
    }
    expect(run.metrics.labelDistribution.finish).toBeGreaterThan(0)
    expect(run.metrics.labelDistribution.escalate).toBeGreaterThan(0)
    expect(run.metrics.labelDistribution.refuse).toBeGreaterThan(0)
  })

  it('calculates readiness metrics and emits a replayable evidence trace', async () => {
    const run = await sampleRun()
    expect(run.metrics.taskCount).toBe(17)
    expect(run.metrics.balancedAccuracy).toBe(1)
    expect(run.metrics.refusalRecall).toBe(1)
    expect(run.metrics.falseAcceptRisk).toBeGreaterThan(0)
    expect(run.metrics.traceCompleteness).toBe(1)
    expect(run.trace.trace_id).toMatch(/^trace_/)
    expect(run.trace.digest).toMatch(/^digest_/)
    expect(run.trace.artifact_provenance.length).toBeGreaterThan(0)
    expect(run.trace.review_state.status).toBe('draft')
    expect(run.trace.oracle_version).toContain('2026-06-20')
    expect(run.pipelineSteps.map((step) => step.id)).toEqual([
      'intake',
      'evidence',
      'draft-map',
      'review',
      'approval',
      'gym',
      'tasks',
      'oracle',
      'metrics',
      'export',
    ])
  })

  it('uses the parser integration result when a real parser map is available', async () => {
    const run = await parsedRun()
    expect(run.parserResults[0]?.method).toBe('parser')
    expect(run.siteMap.width).toBe(9)
    expect(run.siteRepresentation.parserSource).toBe('mixed_source')
    expect(run.provenance.some((p) => p.extractionMethod === 'parser' && p.label === 'Parsed from floor plan')).toBe(true)
  })

  it('keeps fallback provenance when the parser is unavailable', async () => {
    const run = await sampleRun()
    expect(run.parserResults[0]?.method).toBe('deterministic_fallback')
    expect(run.provenance.some((p) => p.extractionMethod === 'deterministic_fallback')).toBe(true)
    expect(run.pipelineSteps.find((step) => step.id === 'review')?.status).toBe('needs_review')
  })

  it('qualifies export through human review state', async () => {
    const draft = await sampleRun()
    expect(draft.trace.verdict).toBe('needs_review')
    const approved = await runSiteToGymPipeline({
      manifest: draft.manifest,
      reviewState: approveReviewState('Reviewed map for pilot.'),
    })
    expect(approved.reviewState.status).toBe('approved')
    expect(approved.pipelineSteps.find((step) => step.id === 'approval')?.status).toBe('complete')
    const correction = await runSiteToGymPipeline({
      manifest: draft.manifest,
      reviewState: correctionReviewState('Dock lane needs correction.'),
    })
    expect(correction.pipelineSteps.find((step) => step.id === 'review')?.status).toBe('failed')
  })

  it('generates the complete portable evidence bundle', async () => {
    const run = await sampleRun()
    expect(run.evidenceBundle.bundleId).toMatch(/^bundle_/)
    expect(run.evidenceBundle.files.map((f) => f.path)).toEqual([
      'origin-site-gym-bundle/site-representation.json',
      'origin-site-gym-bundle/customer-floor.json',
      'origin-site-gym-bundle/gym-tasks.json',
      'origin-site-gym-bundle/oracle-labels.json',
      'origin-site-gym-bundle/readiness-metrics.json',
      'origin-site-gym-bundle/trace.json',
      'origin-site-gym-bundle/claim-boundaries.md',
    ])
    expect(run.evidenceBundle.gymTasks).toHaveLength(run.tasks.length)
    expect(run.evidenceBundle.oracleLabels.every((label) => ['finish', 'escalate', 'refuse'].includes(label.verdict))).toBe(true)
  })

  it('exports a CUSTOMER_OWNED customer floor JSON for the Floor-design compiler', async () => {
    const run = await sampleRun()
    const floor = run.customerFloor
    expect(floor.schema_version).toBe('origin.customer_floor.v1')
    expect(floor.source_domain).toBe('Customer-owned floor plans')
    expect(floor.license_class).toBe('customer_owned')
    expect(floor.lane).toBe('CUSTOMER_OWNED')
    expect(floor.generated_from.origin_web_bundle).toBe(true)
    expect(floor.generated_from.site_representation_id).toBe(run.siteRepresentation.site_id)
    expect(floor.site_map.width).toBe(run.siteMap.width)
    expect(floor.site_map.height).toBe(run.siteMap.height)
    expect(floor.site_map.safe_starts.length).toBeGreaterThan(0)
    expect(floor.site_map.safe_items.length).toBeGreaterThan(0)
    expect(floor.site_map.safe_drops.length).toBeGreaterThan(0)
    expect(floor.site_map.restricted.length).toBeGreaterThan(0)
    expect(floor.site_map.target_counts).toEqual({ finish: 12, escalate: 12, refuse: 12 })
    const file = run.evidenceBundle.files.find((f) => f.path.endsWith('customer-floor.json'))
    expect(file?.content).toContain('"lane": "CUSTOMER_OWNED"')
  })

  it('ships a one-click sample package with floor plan, video, photo, notes, and generated metrics', async () => {
    const sample = createDemoSitePackage()
    expect(sample.items.map((item) => item.role)).toEqual(['floor_plan', 'workflow_video', 'site_photo'])
    const run = await runSiteToGymPipeline({ manifest: sample.manifest })
    expect(run.metrics.taskCount).toBe(17)
    expect(run.signageCues.some((cue) => cue.normalized === 'restricted_area')).toBe(true)
    expect(run.evidenceBundle.siteRepresentation.site_id).toBe(run.siteRepresentation.site_id)
  })

  it('keeps the public claim boundary below certification or full reconstruction', async () => {
    const run = await sampleRun()
    const boundary = run.claimBoundary.join(' ').toLowerCase()
    expect(boundary).toContain('not production-grade')
    expect(boundary).toContain('not robot safety certification')
    expect(boundary).toContain('human review is required')
    expect(boundary).toContain('deterministic oracle')
    expect(boundary).toContain('pilot-readiness evidence')
    expect(boundary).not.toContain('certified safe')
    expect(boundary).not.toContain('slam-quality mapping')
  })
})
