// Adapt a Staer warehouse floor (from the cached catalog) into Origin capture
// fields, so picking a reference floor flows into the SAME readiness funnel as a
// described/uploaded site. Descriptive-only: this pre-fills the human-reviewed
// form; the deterministic oracle still judges downstream.

import type { PhysicalDomain, RobotEmbodiment } from './environmentPlan'
import type { FloorCatalogEntry } from './brainTypes'

export interface CaptureFields {
  outcome: string
  description: string
  rules: string
  domain: PhysicalDomain
  embodiment: RobotEmbodiment
}

/** Plain scenario name for a template card — strips dataset jargon people don't
 *  recognize (the "Staer ·" / "MAPF ·" source prefix and "+ ARMBench"-style
 *  suffixes), leaving e.g. "Cross-dock rush", "Compact pick face". */
export function prettyFloorLabel(label: string): string {
  let s = (label || '')
    .replace(/^\s*(staer|mapf)\s*[·:|-]\s*/i, '')
    .replace(/\s*\+\s*[A-Za-z].*$/, '')
    .trim()
  if (!s) s = label
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Human-readable industry label, e.g. "automotive_clips_brackets" → "Automotive · clips brackets". */
export function prettyIndustry(industry?: string): string {
  if (!industry || industry === 'general') return 'General warehouse'
  const parts = industry.split('_')
  const head = parts[0]
  const rest = parts.slice(1).join(' ')
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  return rest ? `${cap(head)} · ${rest}` : cap(head)
}

/** Layout summary chips, e.g. ["6 docks", "8 aisles", "3 robots", "2 no-go"]. */
export function layoutChips(entry: FloorCatalogEntry): string[] {
  const l = (entry.layout ?? {}) as Record<string, unknown>
  const n = (k: string) => (typeof l[k] === 'number' ? (l[k] as number) : undefined)
  const chips: string[] = []
  const push = (v: number | undefined, label: string) => { if (v != null) chips.push(`${v} ${label}`) }
  push(n('docks'), 'docks')
  push(n('aisles'), 'aisles')
  push(n('staging_lanes'), 'staging')
  push(n('robots'), 'robots')
  push(n('no_go_zones'), 'no-go')
  return chips
}

// 15 real Staer warehouse scene photos live in public/factoryceo/floorplans/.
// Each staer-scene*.jpg is a 640×360 composite = a 2×2 grid of 320×180 views.
// We crop quadrants via CSS background-position (no separate assets needed).
const STAER_SCENES = 15
const pad2 = (n: number) => String(n).padStart(2, '0')

export interface SceneView {
  label: string
  /** CSS background-position for a 200%×200% background (the 4 quadrants). */
  pos: string
}
export const SCENE_VIEWS: SceneView[] = [
  { label: 'Real photo', pos: '0% 0%' },
  { label: 'Depth', pos: '100% 0%' },
  { label: 'Segmentation', pos: '0% 100%' },
  { label: 'Instances', pos: '100% 100%' },
]

/** A distinct real-warehouse hero photo per floor (by index). */
export function floorHeroImage(index: number): string {
  return `/factoryceo/floorplans/staer-scene${pad2((index % STAER_SCENES) + 1)}.jpg`
}

/** The schematic CAD layout plan for a floor (the customizable template), if any. */
export function floorPlanImage(entry: FloorCatalogEntry): string | undefined {
  return entry.floorplan?.file
}

/** Pre-fill the capture form from a chosen Staer floor. */
export function floorToCaptureFields(entry: FloorCatalogEntry): CaptureFields {
  const scenario = entry.scenario?.trim()
  const noGo = (entry.layout as Record<string, unknown> | undefined)?.no_go_zones
  const robots = (entry.layout as Record<string, unknown> | undefined)?.robots
  const outcome = `Operate "${prettyFloorLabel(entry.label)}" safely — a robot earning verified readiness on this floor.`
  const description =
    scenario && scenario.length > 8
      ? scenario
      : `${prettyIndustry(entry.industry)} warehouse floor with ${entry.n_jobs ?? '—'} jobs over ${entry.horizon_days ?? '—'} days; the robot must route around hazards and human-only zones.`
  const rules = [
    'Never enter no-go / human-only zones',
    'Escalate when no safe route fits the robot budget',
    typeof noGo === 'number' && noGo > 0 ? `Respect ${noGo} declared no-go zone(s)` : '',
    typeof robots === 'number' && robots > 1 ? `Coordinate ${robots} robots without conflicts` : '',
  ].filter(Boolean).join('\n')
  return { outcome, description, rules, domain: 'warehouse', embodiment: 'amr' }
}
