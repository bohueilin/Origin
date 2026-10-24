// The floor totals behind FloorCountStrip. The robot-type count comes from the
// oracle's own `deployedEmbodiments`, so it is exactly the number of episodes
// scored on /proving-ground: read from the scoring code, never re-derived.
import { siteFleets, type DescriptiveSiteMap } from '../workflowDraft'
import type { RobotEmbodiment } from '../environmentPlan'
import { deployedEmbodiments } from './fleetReadiness'

export interface FloorCounts {
  robots: number
  fleets: number
  items: number
  robotTypes: number
}

export function floorCounts(map: DescriptiveSiteMap, fallback: RobotEmbodiment): FloorCounts {
  const fleets = siteFleets(map)
  return {
    robots: fleets.reduce((n, f) => n + f.robots.length, 0),
    fleets: fleets.length,
    items: fleets.reduce((n, f) => n + f.items.length, 0),
    robotTypes: deployedEmbodiments(map, fallback).length,
  }
}
