// Readiness, not accuracy. Two moves make this section legible where a 9-line
// chart collided: (1) teach the ladder first (RslLadder), then (2) give every
// model its OWN row — a core→hard dumbbell on a shared L0–L4 axis — so the
// "cliff" (strong on core, weaker on hard) reads per model without overlap.

import type { Bundle, Scorecard } from '../types'
import { modelLabel, modelSubLabel, pct, tierColor } from '../labels'
import { RslLadder } from './RslLadder'

const RANK: Record<string, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 }
const AXIS = ['L0', 'L1', 'L2', 'L3', 'L4']

function subTier(card: Scorecard, key: 'core' | 'hard') {
  return card.breakdown.by_difficulty[key]
}
function xPct(tier: string): number {
  return ((RANK[tier] ?? 0) / 4) * 100
}

export function RslCurve({ bundle }: { bundle: Bundle }) {
  const models = Object.entries(bundle.scorecards)
    .map(([id, card]) => {
      const core = subTier(card, 'core')
      const hard = subTier(card, 'hard')
      return { id, card, core, hard }
    })
    .filter((m) => m.core && m.hard)
    .sort((a, b) => {
      const o = (RANK[b.card.rsl_tier] ?? 0) - (RANK[a.card.rsl_tier] ?? 0)
      if (o) return o
      const h = (RANK[b.hard!.rsl_tier] ?? 0) - (RANK[a.hard!.rsl_tier] ?? 0)
      if (h) return h
      return b.card.metrics.success_rate - a.card.metrics.success_rate
    })

  const siteReady = models.filter((m) => (RANK[m.card.rsl_tier] ?? 0) >= 3).map((m) => modelLabel(m.id))
  const cliff = models
    .filter((m) => (RANK[m.core!.rsl_tier] ?? 0) > (RANK[m.hard!.rsl_tier] ?? 0))
    .map((m) => modelLabel(m.id))
  const allSafe = models.length > 0 && models.every((m) => m.card.metrics.false_accept_rate === 0)

  return (
    <section className="fd-section fd-shell" id="rsl">
      <div className="fd-kicker">Readiness, not accuracy</div>
      <h2>The Robot Safety License</h2>
      <p className="fd-section-sub">
        One accuracy number hides the cliff. Origin grades each model on a 5-rung license — and
        separately on the easy (core) and hard cases — so you see exactly where it stops being
        trustworthy.
      </p>

      <RslLadder />

      <div className="rslc-board">
        <div className="rslc-axis" aria-hidden="true">
          <span className="rslc-axis-name" />
          <div className="rslc-axis-track">
            {AXIS.map((t) => (
              <span className="rslc-axis-tick" key={t} style={{ left: `${xPct(t)}%`, color: tierColor(t) }}>{t}</span>
            ))}
          </div>
          <span className="rslc-axis-tier">tier</span>
        </div>

        {models.map(({ id, card, core, hard }) => {
          const cx = xPct(core!.rsl_tier)
          const hx = xPct(hard!.rsl_tier)
          const lo = Math.min(cx, hx)
          const hi = Math.max(cx, hx)
          return (
            <div className="rslc-row" key={id}>
              <div className="rslc-name">
                <b>{modelLabel(id)}</b>
                <small>{modelSubLabel(id)}</small>
              </div>
              <div className="rslc-track">
                {AXIS.map((t) => <span className="rslc-grid" key={t} style={{ left: `${xPct(t)}%` }} />)}
                <span className="rslc-link" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
                <span
                  className="rslc-dot rslc-core"
                  style={{ left: `${cx}%`, background: tierColor(core!.rsl_tier) }}
                  title={`core: ${core!.rsl_tier} · ${pct(core!.metrics.success_rate)}`}
                />
                <span
                  className="rslc-dot rslc-hard"
                  style={{ left: `${hx}%`, borderColor: tierColor(hard!.rsl_tier) }}
                  title={`hard: ${hard!.rsl_tier} · ${pct(hard!.metrics.success_rate)}`}
                />
              </div>
              <div className="rslc-tier" style={{ color: tierColor(card.rsl_tier) }}>
                <b>{card.rsl_tier}</b>
                <small>{pct(card.metrics.success_rate)}</small>
              </div>
            </div>
          )
        })}

        <div className="rslc-legend">
          <span><span className="rslc-dot rslc-core rslc-legdot" /> core (easy) cases</span>
          <span><span className="rslc-dot rslc-hard rslc-legdot" /> hard cases</span>
          <span className="rslc-legend-note">every model holds <strong>FAR 0.00</strong> — misses are competence, never safety</span>
        </div>
      </div>

      <p className="fd-insight">
        {siteReady.length > 0 && (
          <><span className="pos">{siteReady.join(', ')}</span> {siteReady.length === 1 ? 'reaches' : 'reach'}{' '}
          <span className="pos">L3</span> — site-ready with escalation. </>
        )}
        {cliff.length > 0 && (
          <>{cliff.join(', ')} {cliff.length === 1 ? 'holds' : 'hold'} up on core but{' '}
          <span className="neg">drop a tier on hard</span> — the cliff a single score would hide. </>
        )}
        {allSafe && <>Yet not one false-accept across {models.length} models: the gate fails them for competence, never for safety. </>}
        Higher tier = more it may do without a human.
      </p>
    </section>
  )
}
