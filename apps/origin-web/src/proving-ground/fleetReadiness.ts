// fleetReadiness — the deterministic credential math for the proving ground.
// One episode per DISTINCT deployed robot type (per-robot painted types resolved
// first, then the fleet's type, then the workflow fallback): the same drawn floor
// is re-scored under each type's physics budget (applyEmbodiment inside
// siteMapToWarehouseTask), and the deterministic oracle alone produces every verdict.
//
// AUTONOMY IS EARNED, NEVER ASSUMED. An episode counts as a pass ONLY when the
// oracle's verdict is `finish` — a floor whose routes are walled off (escalate) or
// hazard-sealed (refuse) earns NO autonomy for that embodiment, so the level
// genuinely varies with the floor (all-finish → L4 … nothing-finishes → L0). The
// verified plan never executes an unsafe action, so its catastrophic count is 0 by
// construction; the RECKLESS counterfactual (an unverified always-act policy) is
// surfaced separately as `unverified_false_accepts` — the evidence for WHY the gate
// exists — and is never folded into the verified fleet's grade.
//
// Robot POSITIONS never enter this result (pinned by test: moving every robot
// within its fleet leaves the digest byte-identical). What DOES enter: the floor's
// full geometry (site_digest), the fleet composition counts, and the SET of
// deployed robot types — paint a new type and it earns a new episode.
import { siteFleets, type DescriptiveSiteMap } from '../workflowDraft'
import { evaluateDrawnSite, type DrawnSiteEval } from '../siteEval'
import { computeLicenseFromVerdicts, type LicenseVerdict } from '../license'
import type { LicenseState } from '../types'
import type { RobotEmbodiment } from '../environmentPlan'
import { canonical, sha256 } from '@origin/evidence/env-evidence'

export interface EmbodimentEpisode {
  embodiment: RobotEmbodiment
  evaluation: DrawnSiteEval
  verdict: LicenseVerdict
}

export interface FleetReadiness {
  episodes: EmbodimentEpisode[]
  readiness: LicenseState
  /** Refuse/finish floors probed with an UNVERIFIED always-act policy: how many
   *  embodiment episodes it would have false-accepted. Counterfactual evidence —
   *  never part of the verified fleet's grade. */
  unverifiedFalseAccepts: number
  /** Canonical object to hash + sign into the fleet readiness credential. */
  digestInput: Record<string, unknown>
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4

/** Distinct robot types actually deployed on the map, in paint order: each robot
 *  resolves per-cell painted type → its fleet's type → the workflow fallback.
 *  (Named to avoid colliding with workflowDraft's per-fleet `fleetEmbodiments`.) */
export function deployedEmbodiments(map: DescriptiveSiteMap, fallback: RobotEmbodiment): RobotEmbodiment[] {
  const out: RobotEmbodiment[] = []
  for (const f of siteFleets(map)) {
    const fleetType = f.embodiment ?? fallback
    if (!f.robots.length && !out.includes(fleetType)) out.push(fleetType)
    for (const r of f.robots) {
      const painted = map.robotTypes?.[`${r.x},${r.y}`] ?? fleetType
      if (!out.includes(painted)) out.push(painted)
    }
  }
  return out.length ? out : [fallback]
}

export function fleetReadiness(map: DescriptiveSiteMap, fallback: RobotEmbodiment): FleetReadiness {
  const episodes: EmbodimentEpisode[] = deployedEmbodiments(map, fallback).map((embodiment) => {
    const evaluation = evaluateDrawnSite(map, embodiment)
    const oracle = evaluation.oracleRollout
    // Autonomy is earned only by a safe, policy-clean FINISH. The oracle rollout's
    // own pass flag is tautological (the oracle replayed against its own label), so
    // it must never grade this surface — the floor's terminal verdict does.
    const earned = evaluation.verdict === 'finish'
    return {
      embodiment,
      evaluation,
      verdict: {
        passed: earned,
        reward: earned ? oracle.reward : 0,
        catastrophic: oracle.category === 'unsafe_zone' || oracle.falseAccept,
      },
    }
  })
  const readiness = computeLicenseFromVerdicts(episodes.map((e) => e.verdict))
  const unverifiedFalseAccepts = episodes.filter(
    (e) => e.evaluation.recklessRollout.falseAccept || e.evaluation.recklessRollout.category === 'unsafe_zone',
  ).length
  // Bind the FULL floor geometry, not just counts — two floors with equal counts
  // but different wall positions must produce different credentials.
  const siteDigest = sha256(canonical({
    width: map.width,
    height: map.height,
    start: map.start,
    item: map.item,
    drop: map.drop,
    obstacles: map.obstacles,
    hazards: map.hazards,
    humanOnly: map.humanOnly,
  }))
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
      site_digest: siteDigest,
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
      autonomy_earned: e.verdict.passed,
      reward: round4(e.verdict.reward),
      catastrophic: e.verdict.catastrophic,
    })),
    unverified_false_accepts: unverifiedFalseAccepts,
    vrl_level: readiness.level.id,
    pass_rate: round4(readiness.passRate),
    avg_reward: round4(readiness.avgReward),
    catastrophic_count: readiness.catastrophicCount,
  }
  return { episodes, readiness, unverifiedFalseAccepts, digestInput }
}
