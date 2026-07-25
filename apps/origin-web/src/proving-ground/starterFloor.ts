// The proving-ground starter floor — a hand-authored warehouse template the
// operator immediately repaints. Three fleets of DIFFERENT embodiments (AMR /
// humanoid / quadruped) so the mixed-fleet story is visible before the first
// edit. Fleet 0 supplies the oracle anchors (start → item → drop lane); every
// placement beyond the anchors is descriptive and never changes the verdict.
import type { WorkflowUnderstanding, DescriptiveSiteMap, ProvenanceFact, FleetDeployment } from '../workflowDraft'
import { normalizeFleets } from '../workflowDraft'

const fact = (id: string, text: string): ProvenanceFact => ({
  id,
  text,
  state: 'confirmed',
  confidence: 'high',
  sourceItemIds: [],
})

const P = (x: number, y: number) => ({ x, y })

function starterSiteMap(): DescriptiveSiteMap {
  const fleets: FleetDeployment[] = [
    // Fleet 0 — AMRs on the main pick lane. Its first item/drop anchor the oracle.
    { embodiment: 'amr', robots: [P(1, 3), P(1, 5)], items: [P(9, 4)], drops: [P(11, 4)] },
    // Fleet 1 — a humanoid working the upper aisle.
    { embodiment: 'humanoid', robots: [P(2, 1)], items: [P(5, 2)], drops: [P(8, 1)] },
    // Fleet 2 — a quadruped runner on the lower aisle.
    { embodiment: 'dog', robots: [P(2, 7)], items: [P(5, 6)], drops: [P(8, 7)] },
  ]
  const base: DescriptiveSiteMap = {
    width: 12,
    height: 9,
    start: P(0, 4),
    item: P(9, 4),
    drop: P(11, 4),
    // Racking aisles — row 4 (the licensed lane) stays clear.
    obstacles: [P(3, 1), P(3, 2), P(3, 6), P(3, 7), P(7, 2), P(7, 3), P(7, 5), P(7, 6)],
    // A forklift corridor across the top — hazard cells the oracle never crosses.
    hazards: [P(5, 0), P(6, 0), P(7, 0)],
    // The packing bay is human-only.
    humanOnly: [P(10, 1), P(11, 1)],
    robots: [],
  }
  return normalizeFleets(base, fleets)
}

/** A fresh, self-contained draft for the proving ground — no capture step needed. */
export function starterUnderstanding(): WorkflowUnderstanding {
  return {
    id: 'proving-ground-draft',
    captureId: 'proving-ground-template',
    domain: 'warehouse',
    embodiment: 'amr',
    inputManifestSummary: 'Starter template floor (hand-authored) — repaint anything.',
    sourceItems: [],
    siteMap: starterSiteMap(),
    storyboard: [
      fact('pg-story-1', 'Robots pick items from the racking aisles and deliver to their fleet drop point.'),
      fact('pg-story-2', 'The forklift corridor and the packing bay are off-limits to every robot.'),
    ],
    finishRules: [fact('pg-finish-1', 'A route to the item and the drop exists that avoids every hazard and human-only cell.')],
    escalateRules: [fact('pg-escalate-1', 'Walls block every route — a human must re-plan the floor.')],
    refuseRules: [fact('pg-refuse-1', 'Every route crosses a hazard or human-only cell — the robot must refuse the order.')],
    successCriteria: [fact('pg-success-1', 'Every fleet embodiment earns its verdict from the deterministic oracle on this exact floor.')],
    manual: true,
  }
}
