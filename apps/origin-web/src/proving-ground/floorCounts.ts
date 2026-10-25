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

/** One scored robot type: how many robots of it each fleet has, and which empty
 *  fleets are scored as it (the oracle scores an empty fleet as its fleet type). */
export interface FloorType {
  embodiment: RobotEmbodiment
  robots: number
  byFleet: { fleet: number; robots: number }[]
  emptyFleets: number[]
}

/** The robot types on the floor, in the oracle's episode order. Each robot resolves
 *  exactly as `deployedEmbodiments` resolves it — its own type, else its fleet's,
 *  else the workflow fallback — so the fleet cards, the type panel and the result
 *  list the same types. */
export function floorTypes(map: DescriptiveSiteMap, fallback: RobotEmbodiment): FloorType[] {
  const types = deployedEmbodiments(map, fallback).map((embodiment): FloorType => ({ embodiment, robots: 0, byFleet: [], emptyFleets: [] }))
  const entry = (e: RobotEmbodiment) => types.find((t) => t.embodiment === e)
  siteFleets(map).forEach((f, fleet) => {
    const fleetType = f.embodiment ?? fallback
    if (!f.robots.length) {
      entry(fleetType)?.emptyFleets.push(fleet)
      return
    }
    for (const r of f.robots) {
      const t = entry(map.robotTypes?.[`${r.x},${r.y}`] ?? fleetType)
      if (!t) continue
      t.robots += 1
      const row = t.byFleet.find((b) => b.fleet === fleet)
      if (row) row.robots += 1
      else t.byFleet.push({ fleet, robots: 1 })
    }
  })
  return types
}
