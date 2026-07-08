// Tell white-box tier — the activation-delta probe (TaskTracker method, reimplemented).
// =============================================================================
// Clean-room reimplementation of the TaskTracker activation-delta idea (Microsoft Research):
// a model's internal "task representation" shifts when untrusted content injects a new goal.
// Take the model's activations BEFORE ingesting untrusted data and AFTER; the DELTA is the
// task drift. A linear probe trained on labeled clean-vs-poisoned deltas projects that delta
// onto a drift direction — a high projection means the data hijacked the task.
//
// HONESTY GATE (load-bearing): this needs real model hidden states, which only exist for
// OPEN-WEIGHT models. When no activations are available (an API-only model), `measure` does
// NOT claim conformance and does NOT flag a hijack — it ABSTAINS at confidence 0, contributing
// nothing to the fused gate, which falls back to the black-box conformance monitor. We never
// assert a white-box result we didn't measure.
//
// Drop-in: implements the same `ProbeSignal` interface as `conformanceProbe`, so it fuses in
// `tellGate` unchanged. See tell.ts + docs/PRIOR_ART.md.
// =============================================================================

import type { IntentMeasurement, ObservedAction, ProbeSignal } from './tell'

/** The activation delta for one action: the change in the model's task representation after
 *  ingesting untrusted content. Only obtainable from an open-weight model's hidden states. */
export interface ActivationDelta {
  vector: number[]
}

/** A trained linear probe over the activation delta. */
export interface ActivationProbeWeights {
  direction: number[] // the drift direction (unit vector)
  bias: number // shifts the decision boundary
  threshold: number // decision boundary on the projected score
  scale: number // maps |score - threshold| → a calibrated confidence
}

export interface ActivationProbeConfig {
  weights: ActivationProbeWeights
  /** Supplies the activation delta for an action, or null when activations are unavailable
   *  (API-only model). Returning null makes the probe abstain — never fabricate this. */
  readActivations: (observed: ObservedAction) => ActivationDelta | null
}

const dot = (a: number[], b: number[]): number => {
  const n = Math.min(a.length, b.length)
  let s = 0
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}
const norm = (a: number[]): number => Math.sqrt(dot(a, a))
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x))

/**
 * Train the probe from LABELED deltas (nearest-centroid / class-mean-difference — a valid,
 * deterministic linear probe): direction = unit(mean(poisoned) − mean(clean)); threshold =
 * the midpoint of the two class means projected onto that direction. Deterministic (no RNG),
 * so an episode's probe is reproducible. The labels must come from a trusted oracle, never
 * from another model grading a model.
 */
export function trainActivationProbe(cleanDeltas: ActivationDelta[], poisonedDeltas: ActivationDelta[]): ActivationProbeWeights {
  if (cleanDeltas.length === 0 || poisonedDeltas.length === 0) {
    throw new Error('trainActivationProbe needs at least one clean and one poisoned example')
  }
  const dim = cleanDeltas[0].vector.length
  const mean = (rows: ActivationDelta[]): number[] => {
    const acc = new Array(dim).fill(0)
    for (const r of rows) for (let i = 0; i < dim; i++) acc[i] += r.vector[i]
    return acc.map((v) => v / rows.length)
  }
  const muClean = mean(cleanDeltas)
  const muPoison = mean(poisonedDeltas)
  const raw = muPoison.map((v, i) => v - muClean[i])
  const len = norm(raw) || 1
  const direction = raw.map((v) => v / len)
  // Project both class means; the boundary sits at their midpoint.
  const sClean = dot(direction, muClean)
  const sPoison = dot(direction, muPoison)
  const threshold = (sClean + sPoison) / 2
  // Calibrate confidence so the class means land near ~0.88 confidence.
  const margin = Math.abs(sPoison - sClean) / 2 || 1
  return { direction, bias: 0, threshold, scale: 2 / margin }
}

/**
 * Build the white-box probe. Fuses in `tellGate` alongside `conformanceProbe()`: the black-box
 * monitor catches out-of-plan actions; this catches same-tool-different-intent hijacks (the
 * task representation drifted even though the tool is in-plan).
 */
export function makeActivationProbe(cfg: ActivationProbeConfig): ProbeSignal {
  const { direction, bias, threshold, scale } = cfg.weights
  return {
    method: 'activation-probe',
    measure(observed: ObservedAction): IntentMeasurement {
      const delta = cfg.readActivations(observed)
      if (!delta) {
        // Honest abstention — no model internals, so we measured nothing.
        return {
          conforms: true,
          hijack: false,
          confidence: 0,
          method: 'activation-probe',
          evidence: 'no model activations available (API-only model) — white-box probe inactive; gate falls back to black-box',
        }
      }
      const score = dot(direction, delta.vector) + bias
      const hijack = score > threshold
      const confidence = sigmoid(Math.abs(score - threshold) * scale)
      return {
        conforms: !hijack,
        hijack,
        confidence,
        method: 'activation-probe',
        evidence: hijack
          ? `internal task representation drifted: probe score ${score.toFixed(3)} > ${threshold.toFixed(3)} (activation-delta / TaskTracker)`
          : `task representation stable: probe score ${score.toFixed(3)} ≤ ${threshold.toFixed(3)}`,
      }
    },
  }
}
