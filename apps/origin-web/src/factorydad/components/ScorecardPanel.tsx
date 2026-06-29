import { useState } from 'react'
import type { Bundle, Scorecard, SubsetMetrics } from '../types'
import { modelLabel, modelSubLabel, pct, tierColor, TERMINAL_COLOR } from '../labels'

export function ScorecardPanel({ bundle }: { bundle: Bundle }) {
  const ids = Object.keys(bundle.scorecards)
  const [active, setActive] = useState(ids[0])
  const card = bundle.scorecards[active]
  const pending = bundle.pending_models ?? []

  return (
    <section className="fd-section fd-shell" id="models">
      <div className="fd-kicker">Per-model license</div>
      <h2>Scorecards</h2>
      <p className="fd-section-sub">
        Same bar, every model. The tier is computed from FAR/FRR by the deterministic oracle —
        a model maxes at L3; L4 is the oracle ceiling. All <strong>{ids.length} models below are
        measured</strong> — real runs of the full 48-case benchmark, not projections.
      </p>

      <div className="fd-model-tabs" role="tablist">
        {ids.map((id) => (
          <button key={id} role="tab" aria-selected={id === active}
                  className={`fd-tab ${id === active ? 'on' : ''}`} onClick={() => setActive(id)}>
            {modelLabel(id)}
          </button>
        ))}
      </div>

      <div className="fd-card fd-scorecard">
        <div className="fd-sc-head">
          <div>
            <h3>{modelLabel(active)} <span className="fd-sc-sub">{modelSubLabel(active)}</span></h3>
            <span className="fd-sc-note">
              {card.rsl_note}
              {card.evaluated_date && <> · <span className="fd-sc-date">last tested {fmtDate(card.evaluated_date)}</span></>}
            </span>
          </div>
          <div className="fd-tier-badge" style={{ borderColor: tierColor(card.rsl_tier), color: tierColor(card.rsl_tier) }}>
            <b>{card.rsl_tier}</b>
            <span>{bundle.tiers[card.rsl_tier]}</span>
          </div>
        </div>

        <div className="fd-metrics">
          <Metric label="success" value={pct(card.metrics.success_rate)} />
          <Metric label="false-accept" value={card.metrics.false_accept_rate.toFixed(2)} tone={card.metrics.false_accept_rate > 0 ? 'neg' : 'pos'} />
          <Metric label="false-reject" value={card.metrics.false_reject_rate.toFixed(2)} />
          <Metric label="missed scan" value={card.metrics.missed_scan_rate.toFixed(2)} />
          <Metric label="reward mean" value={card.metrics.reward_mean.toFixed(2)} />
        </div>

        <div className="fd-breakdowns">
          <Breakdown title="By difficulty" rows={[
            ['core', card.breakdown.by_difficulty.core],
            ['hard', card.breakdown.by_difficulty.hard],
          ]} />
          <Breakdown title="By decision" rows={[
            ['finish', card.breakdown.by_terminal.finish],
            ['escalate', card.breakdown.by_terminal.escalate],
            ['refuse', card.breakdown.by_terminal.refuse],
          ]} terminalColors />
        </div>

        <FailedList card={card} />
      </div>

      {pending.length > 0 && (
        <div className="fd-projected">
          <div className="fd-kicker">Requested — awaiting API access</div>
          <p className="fd-section-sub">
            Also requested; we run these the moment access is available. We show <strong>no numbers
            for a model we haven’t actually run</strong> — no projections, no estimates.
          </p>
          <div className="fd-proj-grid">
            {pending.map((m) => (
              <div className="fd-proj-card fd-pending-card" key={m.id}>
                <div className="fd-proj-head">
                  <h3>{modelLabel(m.id)} <span className="fd-sc-sub">{modelSubLabel(m.id)}</span></h3>
                  <span className="fd-badge-proj">pending</span>
                </div>
                <p className="fd-proj-rationale">Not yet run — needs {m.needs}.</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  if (!y || !m || !d) return iso
  return `${months[m - 1]} ${d}, ${y}`
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="fd-metric">
      <b style={tone ? { color: tone === 'neg' ? 'var(--neg)' : 'var(--pos)' } : undefined}>{value}</b>
      <span>{label}</span>
    </div>
  )
}

function Breakdown({ title, rows, terminalColors }: {
  title: string
  rows: [string, SubsetMetrics | null][]
  terminalColors?: boolean
}) {
  return (
    <div className="fd-breakdown">
      <div className="fd-kicker">{title}</div>
      {rows.map(([name, sub]) => {
        if (!sub) return null
        const color = terminalColors ? TERMINAL_COLOR[name] : tierColor(sub.rsl_tier)
        return (
          <div className="fd-bd-row" key={name}>
            <span className="fd-bd-name">{name}</span>
            <span className="fd-bd-track">
              <span className="fd-bd-fill" style={{ width: `${Math.round(sub.metrics.success_rate * 100)}%`, background: color }} />
            </span>
            <span className="fd-bd-val">{pct(sub.metrics.success_rate)} · {sub.rsl_tier}</span>
          </div>
        )
      })}
    </div>
  )
}

function FailedList({ card }: { card: Scorecard }) {
  const failed = card.per_case.filter((p) => p.reward < 1)
  if (failed.length === 0) {
    return <p className="fd-allpass">Cleared every case — no failures.</p>
  }
  return (
    <div className="fd-failed">
      <div className="fd-kicker">Where it slipped ({failed.length})</div>
      <div className="fd-failed-chips">
        {failed.map((p) => (
          <a key={p.case_id} className="fd-failed-chip" href="#cases" title={`oracle ${p.oracle_terminal}, model ${p.model_terminal ?? 'invalid'}`}>
            <span style={{ color: TERMINAL_COLOR[p.oracle_terminal] }}>{p.oracle_terminal}</span>
            <code>{p.case_id}</code>
          </a>
        ))}
      </div>
    </div>
  )
}
