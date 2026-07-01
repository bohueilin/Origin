import { stableHash } from '../captureManifest'
import type { DescriptiveSiteMap } from '../workflowDraft'
import type { ReviewState, SiteRepresentation, SiteToGymRun } from './types'

type Cell = { x: number; y: number }

export interface CustomerRestrictedCell extends Cell {
  kind: 'hazard' | 'human_only'
  reason: string
  source?: string
}

export interface CustomerFloorSpec {
  schema_version: 'origin.customer_floor.v1'
  customer_id: string
  customer_name: string
  site_id: string
  site_name: string
  source_domain: 'Customer-owned floor plans'
  license_class: 'customer_owned'
  lane: 'CUSTOMER_OWNED'
  rights_note: string
  generated_from: {
    origin_web_bundle: true
    site_representation_id: string
    review_status: ReviewState['status']
    parser_source: SiteRepresentation['parserSource']
    requires_human_review: boolean
    provenance_count: number
  }
  conversion_warnings: string[]
  site_map: {
    width: number
    height: number
    obstacles: Cell[]
    hazards: Cell[]
    humanOnly: Cell[]
    restricted: CustomerRestrictedCell[]
    safe_starts: Cell[]
    safe_items: Cell[]
    safe_drops: Cell[]
    target_counts: {
      finish: number
      escalate: number
      refuse: number
    }
  }
}

const clampInt = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(value)))

const cellKey = (cell: Cell): string => `${cell.x},${cell.y}`

function normalizeCell(cell: Cell, width: number, height: number): Cell {
  return {
    x: clampInt(cell.x, 0, Math.max(0, width - 1)),
    y: clampInt(cell.y, 0, Math.max(0, height - 1)),
  }
}

function uniqueCells(cells: readonly Cell[], width: number, height: number): Cell[] {
  const seen = new Set<string>()
  const out: Cell[] = []
  for (const raw of cells) {
    const cell = normalizeCell(raw, width, height)
    const key = cellKey(cell)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cell)
  }
  return out
}

function freeCells(map: DescriptiveSiteMap): Cell[] {
  const blocked = new Set([
    ...map.obstacles.map(cellKey),
    ...map.hazards.map(cellKey),
    ...map.humanOnly.map(cellKey),
  ])
  const out: Cell[] = []
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const cell = { x, y }
      if (!blocked.has(cellKey(cell))) out.push(cell)
    }
  }
  return out
}

function nearestFreeCells(map: DescriptiveSiteMap, anchors: readonly Cell[], count: number): Cell[] {
  const free = freeCells(map)
  return free
    .map((cell) => ({
      cell,
      score: Math.min(
        ...anchors.map((anchor) => Math.abs(anchor.x - cell.x) + Math.abs(anchor.y - cell.y)),
      ),
    }))
    .sort((a, b) => a.score - b.score || a.cell.y - b.cell.y || a.cell.x - b.cell.x)
    .map((item) => item.cell)
    .slice(0, count)
}

function sampleCells(map: DescriptiveSiteMap, primary: Cell, fallbackAnchors: readonly Cell[], count = 8): Cell[] {
  return uniqueCells([primary, ...nearestFreeCells(map, [primary, ...fallbackAnchors], count * 2)], map.width, map.height)
    .filter((cell) => !map.obstacles.some((blocked) => cellKey(blocked) === cellKey(cell)))
    .slice(0, count)
}

function restrictedCells(map: DescriptiveSiteMap, representation: SiteRepresentation): CustomerRestrictedCell[] {
  const hazard = map.hazards.map((cell, index) => ({
    ...cell,
    kind: 'hazard' as const,
    reason: representation.restricted_zones[index]?.label ?? 'Customer-declared hazard/restricted zone',
    source: representation.restricted_zones[index]?.id,
  }))
  const offset = map.hazards.length
  const humanOnly = map.humanOnly.map((cell, index) => ({
    ...cell,
    kind: 'human_only' as const,
    reason: representation.restricted_zones[offset + index]?.label ?? 'Customer-declared human-only zone',
    source: representation.restricted_zones[offset + index]?.id,
  }))
  return [...hazard, ...humanOnly]
}

export function customerFloorFromSiteRepresentation(input: {
  siteRepresentation: SiteRepresentation
  siteMap: DescriptiveSiteMap
  reviewState: ReviewState
  customerId?: string
  customerName?: string
  siteName?: string
}): CustomerFloorSpec {
  const { siteRepresentation, siteMap, reviewState } = input
  const width = Math.max(2, Math.round(siteMap.width))
  const height = Math.max(2, Math.round(siteMap.height))
  const map: DescriptiveSiteMap = {
    ...siteMap,
    width,
    height,
    start: normalizeCell(siteMap.start, width, height),
    item: normalizeCell(siteMap.item, width, height),
    drop: normalizeCell(siteMap.drop, width, height),
    obstacles: uniqueCells(siteMap.obstacles, width, height),
    hazards: uniqueCells(siteMap.hazards, width, height),
    humanOnly: uniqueCells(siteMap.humanOnly, width, height),
    robots: uniqueCells(siteMap.robots ?? [], width, height),
  }
  const restricted = restrictedCells(map, siteRepresentation)
  const warnings = [
    ...(restricted.length === 0 ? ['No customer-declared hazard/human-only/restricted cells; refuse support is not estimable until the customer declares restricted zones.'] : []),
    ...(reviewState.status === 'draft' ? ['Draft map has not been approved by a human reviewer.'] : []),
    ...(siteRepresentation.requiresHumanReview ? ['Site representation is marked requiresHumanReview.'] : []),
  ]

  return {
    schema_version: 'origin.customer_floor.v1',
    customer_id: input.customerId ?? 'origin_web_customer',
    customer_name: input.customerName ?? 'Origin web customer',
    site_id: siteRepresentation.site_id,
    site_name: input.siteName ?? `Origin reviewed site ${siteRepresentation.site_id}`,
    source_domain: 'Customer-owned floor plans',
    license_class: 'customer_owned',
    lane: 'CUSTOMER_OWNED',
    rights_note: 'Generated from permissioned customer-owned site evidence in Origin web. Customer rows remain customer-owned and customer-specific.',
    generated_from: {
      origin_web_bundle: true,
      site_representation_id: siteRepresentation.site_id,
      review_status: reviewState.status,
      parser_source: siteRepresentation.parserSource,
      requires_human_review: siteRepresentation.requiresHumanReview,
      provenance_count: siteRepresentation.provenance.length,
    },
    conversion_warnings: warnings,
    site_map: {
      width,
      height,
      obstacles: map.obstacles,
      hazards: map.hazards,
      humanOnly: map.humanOnly,
      restricted,
      safe_starts: sampleCells(map, map.start, [map.item, map.drop]),
      safe_items: sampleCells(map, map.item, [map.start, map.drop]),
      safe_drops: sampleCells(map, map.drop, [map.start, map.item]),
      target_counts: { finish: 12, escalate: 12, refuse: 12 },
    },
  }
}

export function customerFloorFromSiteGymRun(run: SiteToGymRun): CustomerFloorSpec {
  return customerFloorFromSiteRepresentation({
    siteRepresentation: run.siteRepresentation,
    siteMap: run.siteMap,
    reviewState: run.reviewState,
    customerId: stableHash('customer', run.manifest.id).replace(/^customer_/, 'origin_web_'),
    customerName: 'Origin web customer evidence',
    siteName: run.manifest.outcome,
  })
}

export function customerFloorToJson(spec: CustomerFloorSpec): string {
  return `${JSON.stringify(spec, null, 2)}\n`
}
