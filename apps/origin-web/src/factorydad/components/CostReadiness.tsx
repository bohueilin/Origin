import { useState } from 'react'
import type { Bundle } from '../types'
import { modelLabel, modelSubLabel, pct, tierColor } from '../labels'
import { RslLadder } from './RslLadder'
import {
  costPer1kDecisions,
  costPerTest,
  IN_TOKENS_PER_CASE,
  OUT_TOKENS_PER_CASE,
  priceFor,
  usd,
} from '../pricing'

// Tier rank for the "site-ready" read (higher = more autonomous).
const TIER_RANK: Record<string, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 }
type TierFilter = 'all' | 'L3' | 'L2' | 'L1'

interface CostRow {
  id: string
  tier: string
  evidence: 'measured' | 'pending'
  success: number | null
  far: number | null
  price: { inPerM: number; outPerM: number }
  perTest: number
  per1k: number
}

export function CostReadiness({ bundle }: { bundle: Bundle }) {
  const measured: CostRow[] = Object.entries(bundle.scorecards)
    .map(([id, card]) => {
      const price = priceFor(id)
      return price
        ? {
            id,
            tier: card.rsl_tier,
            evidence: 'measured' as const,
            success: card.metrics.success_rate,
            far: card.metrics.false_accept_rate,
            price,
            perTest: costPerTest(price),
            per1k: costPer1kDecisions(price),
          }
        : null
    })
    .filter((r) => r !== null) as CostRow[]

  const pending: CostRow[] = (bundle.pending_models ?? [])
    .map((m) => {
      const price = priceFor(m.id)
      return price
        ? {
            id: m.id,
            tier: '',
            evidence: 'pending' as const,
            success: null,
            far: null,
            price,
            perTest: costPerTest(price),
            per1k: costPer1kDecisions(price),
          }
        : null
    })
    .filter((r) => r !== null) as CostRow[]

  const [filter, setFilter] = useState<TierFilter>('all')

  // Measured first (top-down most expensive → bargain), then pending.
  const allRows = [
    ...measured.sort((a, b) => b.per1k - a.per1k),
    ...pending.sort((a, b) => b.per1k - a.per1k),
  ]
  // Filter to a tier when requested. Pending rows (no tier) only show under "all".
  const rows = filter === 'all' ? allRows : allRows.filter((r) => r.tier === filter)

  const FILTERS: { id: TierFilter; label: string }[] = [
    { id: 'all', label: 'All models' },
    { id: 'L3', label: 'L3 · site-ready' },
    { id: 'L2', label: 'L2 · limited' },
    { id: 'L1', label: 'L1 · supervised' },
  ]
  const tierCount = (t: TierFilter) =>
    t === 'all' ? allRows.length : measured.filter((r) => r.tier === t).length

  // Takeaways only crown MEASURED models — never a projection.
  const siteReady = measured.filter((r) => (TIER_RANK[r.tier] ?? 0) >= 3)
  const cheapestSiteReady = [...siteReady].sort((a, b) => a.per1k - b.per1k)[0]
  const cheapest = [...measured].sort((a, b) => a.per1k - b.per1k)[0]

  return (
    <section className="fd-section fd-shell" id="cost">
      <div className="fd-kicker">Cost vs readiness</div>
      <h2>Price is easy to compare. Readiness is the part that bites.</h2>
      <p className="fd-section-sub">
        The cheapest model is rarely the cheapest <em>outcome</em>. Origin puts list price next to
        the earned RSL tier so you can choose with eyes open — a model that looks 15× cheaper but
        caps at <span className="neg">L1</span> still needs a human on every hard case.
      </p>

      <RslLadder compact />

      <div className="fd-cost-filter" role="group" aria-label="Filter by readiness tier">
        <span className="fd-cost-filter-lbl">Show readiness:</span>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`fd-cost-chip ${filter === f.id ? 'on' : ''}`}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label} <span className="fd-cost-chip-n">{tierCount(f.id)}</span>
          </button>
        ))}
      </div>

      <div className="fd-cost-table" role="table" aria-label="Cost versus readiness by model">
        <div className="fd-cost-head" role="row">
          <span role="columnheader">Model</span>
          <span role="columnheader">RSL tier</span>
          <span role="columnheader">List price (in / out)</span>
          <span role="columnheader">Per 1k decisions</span>
          <span role="columnheader">Full 32-case test</span>
        </div>
        {rows.map((r) => (
          <div className={`fd-cost-row ${r.evidence === 'pending' ? 'fd-cost-proj' : ''}`} role="row" key={r.id}>
            <span role="cell" className="fd-cost-model">
              {modelLabel(r.id)}
              <small className="fd-cost-sub">{modelSubLabel(r.id)}</small>
            </span>
            <span role="cell">
              {r.evidence === 'measured' ? (
                <>
                  <b className="fd-cost-tier" style={{ color: tierColor(r.tier) }}>{r.tier}</b>
                  <small> · {pct(r.success ?? 0)} · FAR {(r.far ?? 0).toFixed(2)}</small>
                </>
              ) : (
                <small className="fd-badge-proj">not yet tested</small>
              )}
            </span>
            <span role="cell" className="fd-cost-num">
              ${r.price.inPerM.toFixed(2)} / ${r.price.outPerM.toFixed(2)}
              <small> per 1M tok</small>
            </span>
            <span role="cell" className="fd-cost-num"><b>{usd(r.per1k)}</b></span>
            <span role="cell" className="fd-cost-num">{usd(r.perTest)}</span>
          </div>
        ))}
      </div>

      <div className="fd-cost-takeaways">
        {cheapestSiteReady && (
          <div className="fd-cost-take">
            <span className="fd-kicker">Best value that's site-ready</span>
            <b>{modelLabel(cheapestSiteReady.id)} — {cheapestSiteReady.tier}</b>
            <span>
              {usd(cheapestSiteReady.per1k)} / 1k decisions. The cheapest model that earns autonomy
              with escalation on this floor.
            </span>
          </div>
        )}
        {cheapest && cheapestSiteReady && cheapest.id !== cheapestSiteReady.id && (
          <div className="fd-cost-take">
            <span className="fd-kicker">Most economical</span>
            <b>{modelLabel(cheapest.id)} — {cheapest.tier}</b>
            <span>
              {usd(cheapest.per1k)} / 1k decisions, but caps at {cheapest.tier} here — supervised use
              only. The gate makes that trade-off explicit instead of hidden.
            </span>
          </div>
        )}
      </div>

      <p className="fd-cost-note">
        Prices are the <strong>providers' published list prices</strong> (USD / 1M tokens, reviewed
        2026-06) — not Origin pricing; Origin is model-agnostic. Cost uses a measured ~
        {IN_TOKENS_PER_CASE} input tokens/case and an assumed ~{OUT_TOKENS_PER_CASE} output
        tokens/case. Rows marked <span className="fd-badge-proj">not yet tested</span> show the real
        list price but <strong>no readiness tier</strong> — we don’t publish a tier for a model we
        haven’t actually run. Illustrative, not a quote.
      </p>
    </section>
  )
}
