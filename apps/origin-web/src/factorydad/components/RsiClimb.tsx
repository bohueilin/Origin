import type { Bundle } from '../types'
import { modelLabel, tierColor } from '../labels'

// Real anchors come from the measured scorecards; the pass-by-pass trajectory is
// an explicitly-labeled projection of the RSI loop, not a trained run.
const TIER_Y: Record<string, number> = { L4: 44, L3: 99, L2: 154, L1: 209, L0: 255 }
const TIER_RANK: Record<string, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 }
const PASSES = [
  { x: 120, tier: 'L1', fails: 12, label: 'pass 0' },
  { x: 285, tier: 'L2', fails: 6, label: 'pass 1' },
  { x: 450, tier: 'L3', fails: 1, label: 'pass 2' },
  { x: 565, tier: 'L3', fails: 0, label: 'pass 3' },
]
const X0 = 150
const X1 = 560

export function RsiClimb({ bundle }: { bundle: Bundle }) {
  // Measured anchors, sorted low→high tier; spread across x so they don't stack.
  const anchors = Object.entries(bundle.scorecards)
    .map(([id, c]) => ({ id, tier: c.rsl_tier }))
    .sort((a, b) => (TIER_RANK[a.tier] ?? 0) - (TIER_RANK[b.tier] ?? 0))
  const pending = bundle.pending_models ?? []
  const points = PASSES.map((p) => `${p.x},${TIER_Y[p.tier]}`).join(' ')
  const top = anchors[anchors.length - 1]
  const xAt = (i: number) => (anchors.length <= 1 ? (X0 + X1) / 2 : X0 + ((X1 - X0) * i) / (anchors.length - 1))
  // Per-tier model summary for the caption (instead of crowding the SVG with 9 labels).
  const byTier = ['L3', 'L2', 'L1', 'L0'].map((t) => ({
    tier: t,
    names: anchors.filter((a) => a.tier === t).map((a) => modelLabel(a.id)),
  })).filter((g) => g.names.length > 0)

  return (
    <section className="fd-section fd-shell" id="rsi">
      <div className="fd-kicker">Projected improvement</div>
      <h2>Where the loop is headed — projected from measured anchors.</h2>
      <p className="fd-section-sub">
        <strong>{anchors.length} models are measured</strong> today (dots below). The pass-by-pass
        climb is a <strong>projection</strong> of how readiness would improve as failures become
        training rows for the next brain — not a trained run. A policy can never buy a tier by being
        unsafe.
      </p>

      <div className="fd-card fd-rsi">
        <div className="fd-rsi-legend" aria-hidden="true">
          <span className="fd-rsi-leg fd-rsi-leg-measured"><span className="fd-rsi-swatch" /> Measured anchors</span>
          <span className="fd-rsi-leg fd-rsi-leg-proj"><span className="fd-rsi-swatch" /> Projected path</span>
        </div>
        <svg viewBox="0 0 620 296" role="img"
             aria-label="Measured model tiers plotted against a projected RSI training climb from L1 to L3, above a safety floor at L0">
          {(['L4', 'L3', 'L2', 'L1'] as const).map((t) => (
            <g key={t}>
              <line x1="96" y1={TIER_Y[t]} x2="600" y2={TIER_Y[t]} stroke="var(--line)" strokeWidth={1} />
              <text x="84" y={TIER_Y[t] + 4} textAnchor="end" style={{ fill: 'var(--muted)', fontSize: 12 }}>
                {t}{t === 'L3' ? ' site-ready' : t === 'L2' ? ' limited' : t === 'L1' ? ' supervised' : ''}
              </text>
            </g>
          ))}

          {/* safety floor */}
          <line x1="96" y1={TIER_Y.L0} x2="600" y2={TIER_Y.L0} stroke="var(--neg)" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.75} />
          <text x="100" y={TIER_Y.L0 + 18} style={{ fill: 'var(--neg)', fontSize: 11 }}>
            L0 safety floor — any unsafe act drops here, whatever the score
          </text>

          {/* the projected climb (dashed = projection, not measured) */}
          <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth={2.5}
                    strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
          {PASSES.map((p) => (
            <g key={p.label}>
              <circle cx={p.x} cy={TIER_Y[p.tier]} r={6}
                      fill="var(--panel)" stroke="var(--accent)" strokeWidth={2} opacity={0.7} />
              <text x={p.x} y={284} textAnchor="middle" style={{ fill: 'var(--muted)', fontSize: 12 }}>{p.label}</text>
            </g>
          ))}

          {/* measured anchors — solid dots at the real tier, each labeled with its
             model name (alternating above/below so neighbors never overlap) */}
          {anchors.map((a, i) => {
            const x = xAt(i)
            const y = TIER_Y[a.tier] ?? TIER_Y.L1
            const above = i % 2 === 0
            const ly = above ? y - 13 : y + 18
            return (
              <g key={a.id}>
                <circle cx={x} cy={y} r={6} fill={tierColor(a.tier)} stroke="var(--panel)" strokeWidth={2} />
                <text x={x} y={ly} textAnchor="middle"
                      style={{ fill: 'var(--text)', fontSize: 10, fontWeight: 600 }}>
                  {modelLabel(a.id)}
                </text>
              </g>
            )
          })}
        </svg>

        <div className="fd-rsi-anchorlist">
          {byTier.map((g) => (
            <span className="fd-rsi-anchorgroup" key={g.tier}>
              <b style={{ color: tierColor(g.tier) }}>{g.tier}</b> {g.names.join(', ')}
            </span>
          ))}
        </div>

        <p className="fd-rsi-note">
          <span className="fd-real">Real anchors:</span> all {anchors.length} dots are{' '}
          <strong>measured</strong> runs{top ? <> — {modelLabel(top.id)} reaches {top.tier}; open models start lower</> : null}.
          {' '}<span className="fd-proj">Projection:</span> the dashed pass-by-pass climb illustrates the
          RSI loop a fine-tune on the failure rows would follow — labeled a projection, not a trained run.
          A policy can never buy a tier by being unsafe.
          {pending.length > 0 && (
            <> Awaiting access (not plotted): {pending.map((m) => modelLabel(m.id)).join(', ')}.</>
          )}
        </p>
      </div>
    </section>
  )
}
