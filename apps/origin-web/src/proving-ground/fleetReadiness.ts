// fleetReadiness — the deterministic credential math for the proving ground.
// One episode per DISTINCT fleet embodiment: the same drawn floor is re-scored
// under each robot type's physics budget (applyEmbodiment inside siteMapToWarehouseTask),
// and the deterministic oracle alone produces every verdict. Robot PLACEMENTS never
// enter this function's result — they are descriptive (see workflowDraft.ts): only
// the floor geometry + the set of embodiments matter, which the tests pin.
import { siteFleets, type DescriptiveSiteMap } from '../workflowDraft'
import { evaluateDrawnSite, type DrawnSiteEval } from '../siteEval'
import { computeLicenseFromVerdicts, type LicenseVerdict } from '../license'
import type { LicenseState } from '../types'
import type { RobotEmbodiment } from '../environmentPlan'

export interface EmbodimentEpisode {
  embodiment: RobotEmbodiment
  evaluation: DrawnSiteEval
  verdict: LicenseVerdict
}

export interface FleetReadiness {
  episodes: EmbodimentEpisode[]
  readiness: LicenseState
  /** Canonical object to hash + sign into the fleet readiness credential. */
  digestInput: Record<string, unknown>
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4

/** Distinct embodiments deployed on the map (fleet order preserved). */
export function fleetEmbodiments(map: DescriptiveSiteMap, fallback: RobotEmbodiment): RobotEmbodiment[] {
  const out: RobotEmbodiment[] = []
  for (const f of siteFleets(map)) {
    const e = f.embodiment ?? fallback
    if (!out.includes(e)) out.push(e)
  }
  return out.length ? out : [fallback]
}

export function fleetReadiness(map: DescriptiveSiteMap, fallback: RobotEmbodiment): FleetReadiness {
  const episodes: EmbodimentEpisode[] = fleetEmbodiments(map, fallback).map((embodiment) => {
    const evaluation = evaluateDrawnSite(map, embodiment)
    const r = evaluation.oracleRollout
    return {
      embodiment,
      evaluation,
      verdict: {
        passed: r.passed,
        reward: r.reward,
        catastrophic: r.category === 'unsafe_zone' || r.falseAccept,
      },
    }
  })
  const readiness = computeLicenseFromVerdicts(episodes.map((e) => e.verdict))
  const digestInput = {
    kind: 'fleet-readiness-credential',
    site: {
      width: map.width,
      height: map.height,
      start: map.start,
      item: map.item,
      drop: map.drop,
      walls: map.obstacles.length,
      hazards: map.hazards.length,
      human_only: map.humanOnly.length,
    },
    fleets: siteFleets(map).map((f) => ({
      embodiment: f.embodiment ?? fallback,
      robots: f.robots.length,
      items: f.items.length,
      drops: f.drops.length,
    })),
    episodes: episodes.map((e) => ({
      embodiment: e.embodiment,
      oracle_verdict: e.evaluation.verdict,
      passed: e.verdict.passed,
      reward: round4(e.verdict.reward),
      catastrophic: e.verdict.catastrophic,
    })),
    vrl_level: readiness.level.id,
    pass_rate: round4(readiness.passRate),
    avg_reward: round4(readiness.avgReward),
    catastrophic_count: readiness.catastrophicCount,
  }
  return { episodes, readiness, digestInput }
}
