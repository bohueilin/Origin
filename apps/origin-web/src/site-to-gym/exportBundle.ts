import { stableHash } from '../captureManifest'
import type { CustomerFloorSpec } from './customerFloorExport'
import type { EvidenceBundle, ReviewState, RobotReadinessTask, SiteGymTrace, SiteRepresentation, ReadinessMetrics } from './types'

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

export function bundleClaimBoundaries(boundaries: readonly string[]): string {
  return [
    '# Origin Site-to-Gym Claim Boundaries',
    '',
    ...boundaries.map((boundary) => `- ${boundary}`),
    '- Human review is required before treating a generated map as an approved customer environment.',
    '- Exported artifacts are pilot-readiness evidence, not compliance certification.',
    '',
  ].join('\n')
}

export function buildEvidenceBundle(input: {
  siteRepresentation: SiteRepresentation
  tasks: readonly RobotReadinessTask[]
  metrics: ReadinessMetrics
  trace: SiteGymTrace
  claimBoundaries: readonly string[]
  reviewState: ReviewState
  customerFloor: CustomerFloorSpec
}): EvidenceBundle {
  const gymTasks = input.tasks.map((task) => ({
    id: task.id,
    category: task.category,
    description: task.description,
    riskClass: task.risk_class,
    expectedOracleVerdict: task.expectedOracleVerdict,
    requiredEvidence: task.required_evidence,
    sourceMapFeature: task.source_map_feature,
    reason: task.reason,
    task: task.warehouseTask,
  }))
  const oracleLabels = input.tasks.map((task) => ({
    taskId: task.id,
    verdict: task.expectedOracleVerdict,
    reason: task.oracle.reason,
    pathLength: task.oracle.pathLength,
  }))
  const bundleId = stableHash('bundle', {
    site: input.siteRepresentation.site_id,
    tasks: gymTasks.map((task) => [task.id, task.expectedOracleVerdict]),
    trace: input.trace.digest,
    review: input.reviewState.status,
  })
  return {
    bundleId,
    siteRepresentation: input.siteRepresentation,
    gymTasks,
    oracleLabels,
    readinessMetrics: input.metrics,
    trace: input.trace,
    claimBoundaries: [...input.claimBoundaries],
    reviewState: input.reviewState,
    customerFloor: input.customerFloor,
    files: [
      { path: 'origin-site-gym-bundle/site-representation.json', mimeType: 'application/json', content: json(input.siteRepresentation) },
      { path: 'origin-site-gym-bundle/customer-floor.json', mimeType: 'application/json', content: json(input.customerFloor) },
      { path: 'origin-site-gym-bundle/gym-tasks.json', mimeType: 'application/json', content: json(gymTasks) },
      { path: 'origin-site-gym-bundle/oracle-labels.json', mimeType: 'application/json', content: json(oracleLabels) },
      { path: 'origin-site-gym-bundle/readiness-metrics.json', mimeType: 'application/json', content: json(input.metrics) },
      { path: 'origin-site-gym-bundle/trace.json', mimeType: 'application/json', content: json(input.trace) },
      { path: 'origin-site-gym-bundle/claim-boundaries.md', mimeType: 'text/markdown', content: bundleClaimBoundaries(input.claimBoundaries) },
    ],
  }
}

export function bundleToClipboardText(bundle: EvidenceBundle): string {
  return json({
    bundleId: bundle.bundleId,
    siteRepresentation: bundle.siteRepresentation,
    customerFloor: bundle.customerFloor,
    gymTasks: bundle.gymTasks,
    oracleLabels: bundle.oracleLabels,
    readinessMetrics: bundle.readinessMetrics,
    trace: bundle.trace,
    claimBoundaries: bundle.claimBoundaries,
    reviewState: bundle.reviewState,
  })
}

export function downloadEvidenceBundle(bundle: EvidenceBundle): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return
  const blob = new Blob([bundleToClipboardText(bundle)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${bundle.bundleId}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
