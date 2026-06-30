// Real, measured results from the v1 baseline + the deterministic gym — baked so the
// public (backend-less) Pages deploy can render them. Numbers are copied verbatim from
// the Floor-design training run (outputs/rsi_dataset/baseline_v1/{metrics,eval_trained}.json
// and stats.json). This is a MEASURED run, not a projection.
//
// Honesty boundary (preserved in the UI): the v1 baseline learns to READ a floor (room-type
// classification — structural understanding), graded against a deterministic oracle. The
// finish / escalate / refuse SAFETY POLICY is labeled by that same oracle across the gym.
// Its headline is a 5-seed raw-geometry mean/range; the full feature 1.0 is only an
// oracle-recovery upper bound.

export interface LearnPoint { epoch: number; valBalancedAcc: number; loss: number }

/** The real validation balanced-accuracy curve, epoch by epoch (metrics.json history). */
export const LEARNING_CURVE: LearnPoint[] = [
  { epoch: 1, valBalancedAcc: 0.6033, loss: 1.2579 },
  { epoch: 10, valBalancedAcc: 0.6467, loss: 0.6120 },
  { epoch: 20, valBalancedAcc: 0.6399, loss: 0.5592 },
  { epoch: 30, valBalancedAcc: 0.6531, loss: 0.5409 },
  { epoch: 40, valBalancedAcc: 0.6585, loss: 0.5307 },
  { epoch: 50, valBalancedAcc: 0.6590, loss: 0.5284 },
  { epoch: 60, valBalancedAcc: 0.6566, loss: 0.5164 },
  { epoch: 70, valBalancedAcc: 0.6562, loss: 0.5196 },
  { epoch: 80, valBalancedAcc: 0.6590, loss: 0.5061 },
  { epoch: 90, valBalancedAcc: 0.6574, loss: 0.5072 },
]

export const MODEL_RESULT = {
  bestEpoch: 50,
  floorBalancedAcc: 0.0667, // always-predict-majority baseline (1 / 15 classes)
  targetBalancedAcc: 0.25, // the launch bar we set in the baseline spec
  testBalancedAcc: 0.6436, // held-out test, SAVED-weights (the honest shipped number)
  testAccuracy: 0.7222,
  classes: 15,
  samples: { train: 38779, val: 4997, test: 4620 },
  runtimeSeconds: 3.9,
} as const

/** Per-class held-out recall — what the brain actually learned to read (metrics.json test). */
export const PER_CLASS: Array<{ name: string; recall: number; support: number }> = [
  { name: 'entry', recall: 1.0, support: 25 },
  { name: 'dining', recall: 0.906, support: 64 },
  { name: 'garage', recall: 0.897, support: 39 },
  { name: 'kitchen', recall: 0.878, support: 410 },
  { name: 'hallway', recall: 0.850, support: 453 },
  { name: 'office', recall: 0.862, support: 65 },
  { name: 'living_room', recall: 0.814, support: 377 },
  { name: 'bathroom', recall: 0.764, support: 572 },
  { name: 'outdoor', recall: 0.734, support: 530 },
  { name: 'bedroom', recall: 0.730, support: 633 },
  { name: 'utility', recall: 0.729, support: 468 },
  { name: 'other', recall: 0.490, support: 983 },
]
/** Classes with no held-out examples (honest footnote, not hidden). */
export const EMPTY_CLASSES = ['laundry', 'pantry', 'structural_floor_plate']

/** The deterministic gym the policy trains in — every label from the oracle, never an LLM. */
export const GYM = {
  floors: 4704,
  finish: 1009,
  escalate: 2947,
  refuse: 748, // the safety class — synthesized hazard/blocked-egress floors, oracle-verified
  balancedView: 605, // balanced train-only view: 605 each of finish/escalate/refuse
  customerFloors: 600, // the sampled customer-gym (floor_sampler) — balanced 200/200/200
  rlRows: 6480,
  sftRows: 600,
} as const

/** The measured finish / escalate / refuse safety policy. Headline is raw geometry;
 * full 36-feature perfect score is an oracle-recovery upper bound, not a safety claim. */
export const SAFETY_POLICY = {
  featureView: 'raw_geometry',
  seedCount: 5,
  balancedMean: 0.931756,
  balancedMin: 0.917475,
  balancedMax: 0.941108,
  refuseRecallMean: 0.985714,
  refuseRecallMin: 0.964286,
  refuseRecallMax: 1.0,
  oracleRecoveryUpperBound: 1.0,
  featureDisjointBalancedAcc: 0.900331,
} as const

/** The four-stage customer journey: floor in → verified gym → robot trains → readiness out. */
export interface JourneyStage {
  key: string
  label: string
  metric: string
  detail: string
  state: 'live' | 'next'
}
export const JOURNEY: JourneyStage[] = [
  { key: 'floor', label: 'Floor in', metric: '1 plan', detail: 'A customer brings their own site map — warehouse, store, hospital wing.', state: 'live' },
  { key: 'gym', label: 'Verified gym', metric: `${GYM.floors.toLocaleString()} floors`, detail: 'Each floor is compiled to a gym and labeled finish / escalate / refuse by a deterministic oracle — never an LLM.', state: 'live' },
  { key: 'train', label: 'Robot trains', metric: `${Math.round(SAFETY_POLICY.balancedMean * 1000) / 10}%`, detail: 'A raw-geometry safety policy learns finish / escalate / refuse over 5 seeds; the oracle remains the judge.', state: 'live' },
  { key: 'license', label: 'Readiness out', metric: 'L0 → L4', detail: 'A signed readiness license: the tier it earned, its false-accept and false-reject rates, the safe path.', state: 'next' },
]
