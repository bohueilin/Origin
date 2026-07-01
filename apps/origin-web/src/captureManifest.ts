import type { PhysicalDomain, RobotEmbodiment } from './environmentPlan'

export const CAPTURE_ROLES = [
  'workflow_video',
  'site_photo',
  'floor_plan',
  'sop',
  'forbidden_example',
  'robot_profile',
  'google_drive',
] as const

export type CaptureRole = (typeof CAPTURE_ROLES)[number]
export type CaptureItemKind = 'local_file' | 'google_drive_link'

export interface CaptureItem {
  id: string
  kind: CaptureItemKind
  name: string
  type: string
  size: number | null
  role: CaptureRole
  source: 'local_metadata' | 'declared_link'
}

/** Structured floor counts a chosen template carries — used to rebuild a scaled
 *  site map (grid size + placements) instead of the generic default floor. */
export interface FloorLayoutSpec {
  docks?: number
  aisles?: number
  staging_lanes?: number
  robots?: number
  no_go_zones?: number
}

export interface CaptureManifest {
  id: string
  outcome: string
  domain: PhysicalDomain
  expectedEmbodiment: RobotEmbodiment
  /** The full set of robot types the operator expects (up to 5) — seeds a mixed
   *  fleet. `expectedEmbodiment` stays the primary (first) for back-compat. */
  expectedEmbodiments?: RobotEmbodiment[]
  description: string
  safetyRules: string[]
  items: CaptureItem[]
  /** Present when a template was selected — drives the rebuilt floor. */
  floorLayout?: FloorLayoutSpec
}

export interface SerializableFileMeta {
  name: string
  type: string
  size: number
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`
}

export function stableHash(prefix: string, value: unknown): string {
  const input = stableStringify(value)
  let h = 5381
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) | 0
  return `${prefix}_${(h >>> 0).toString(36)}`
}

export function inferCaptureRole(meta: Pick<SerializableFileMeta, 'name' | 'type'>): CaptureRole {
  const name = meta.name.toLowerCase()
  const type = meta.type.toLowerCase()
  if (type.startsWith('video/')) return 'workflow_video'
  if (name.includes('floor') || name.includes('map') || name.includes('layout')) return 'floor_plan'
  if (name.includes('unsafe') || name.includes('forbidden') || name.includes('hazard')) return 'forbidden_example'
  if (name.includes('robot') || name.includes('hardware') || name.includes('spec')) return 'robot_profile'
  if (type.startsWith('image/')) return 'site_photo'
  return 'sop'
}

export function fileMetaToCaptureItem(file: SerializableFileMeta, index: number): CaptureItem {
  const item = {
    kind: 'local_file' as const,
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    role: inferCaptureRole(file),
    source: 'local_metadata' as const,
  }
  return { ...item, id: stableHash(`file_${index}`, item) }
}

export function driveLinkToCaptureItem(url: string, index: number): CaptureItem | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  const item = {
    kind: 'google_drive_link' as const,
    name: trimmed.replace(/^https?:\/\//, '').slice(0, 80),
    type: 'text/uri-list',
    size: null,
    role: 'google_drive' as const,
    source: 'declared_link' as const,
  }
  return { ...item, id: stableHash(`drive_${index}`, item) }
}

export function createCaptureManifest(input: {
  outcome: string
  domain: PhysicalDomain
  expectedEmbodiment: RobotEmbodiment
  expectedEmbodiments?: RobotEmbodiment[]
  description: string
  safetyRules: string[]
  items: CaptureItem[]
  floorLayout?: FloorLayoutSpec
}): CaptureManifest {
  const types = (input.expectedEmbodiments?.length ? input.expectedEmbodiments : [input.expectedEmbodiment]).slice(0, 5)
  const normalized = {
    outcome: input.outcome.trim(),
    domain: input.domain,
    expectedEmbodiment: types[0] ?? input.expectedEmbodiment,
    expectedEmbodiments: types,
    description: input.description.trim(),
    safetyRules: input.safetyRules.map((r) => r.trim()).filter(Boolean),
    items: input.items.map((item) => ({ ...item })),
    ...(input.floorLayout ? { floorLayout: input.floorLayout } : {}),
  }
  return { ...normalized, id: stableHash('capture', normalized) }
}

const ROLE_LABELS: Record<CaptureRole, string> = {
  workflow_video: 'workflow video',
  site_photo: 'site photo',
  floor_plan: 'floor plan',
  sop: 'SOP',
  forbidden_example: 'forbidden example',
  robot_profile: 'robot profile',
  google_drive: 'Google Drive link',
}

// Declared workflow inputs are the operator-provided facts that define the eval request:
// a non-empty outcome, a non-empty workflow description, plus each media/link item.
// Safety rules are counted separately (see summarizeInputManifest). This is metadata-only
// counting — voice/text never fabricate media items.
export function countDeclaredWorkflowInputs(
  manifest: Pick<CaptureManifest, 'outcome' | 'description' | 'items'>,
): number {
  let count = manifest.items.length
  if (manifest.outcome.trim()) count += 1
  if (manifest.description.trim()) count += 1
  return count
}

export function summarizeInputManifest(
  manifest: Pick<CaptureManifest, 'outcome' | 'description' | 'items' | 'safetyRules'>,
): string {
  const labels: string[] = []
  if (manifest.outcome.trim()) labels.push('outcome requirement')
  if (manifest.description.trim()) labels.push('workflow description')
  const roleCounts = new Map<CaptureRole, number>()
  for (const item of manifest.items) roleCounts.set(item.role, (roleCounts.get(item.role) ?? 0) + 1)
  for (const [role, count] of roleCounts) labels.push(`${count} ${ROLE_LABELS[role]}`)
  const count = countDeclaredWorkflowInputs(manifest)
  const rules = manifest.safetyRules.length ? `${manifest.safetyRules.length} safety rule(s)` : 'no explicit rules'
  return `${count} declared input(s): ${labels.join(', ') || 'none'}; ${rules}.`
}
