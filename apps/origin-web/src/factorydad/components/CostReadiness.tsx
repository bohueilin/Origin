import { useState } from 'react'
import type { Bundle } from '../types'
import { modelLabel, modelSubLabel, pct, tierColor } from '../labels'
import { RslLadder } from './RslLadder'
import {
  costPer1kDecisions,
  IN_TOKENS_PER_CASE,
  OUT_TOKENS_PER_CASE,
  priceFor,
  usd,
} from '../pricing'

// Tier rank for the "site-ready" read (higher = more autonomous).
const TIER_RANK: Record<string, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 }
type TierFilter = 'all' | 'L3' | 'L2' | 'L1'
type SortKey = 'model' | 'tier' | 'speed' | 'per1k' | 'price'

// Typical throughput of a GPU/3rd-party endpoint (tok/s). Cerebras-served rows carry a real
// MEASURED number; the rest we did not benchmark for speed, so we show the published class
// baseline (50–100 tok/s) — the point is the order-of-magnitude gap, made sortable.
const GPU_CLASS_TOKS = 70

interface CostRow {
  id: string
  tier: string
  evidence: 'measured' | 'pending'
  success: number | null
  far: number | null
  price: { inPerM: number; outPerM: number }
  per1k: number
  speed: number
  speedMeasured: boolean
}

export function CostReadiness({ bundle }: { bundle: Bundle }) {
  const measured: CostRow[] = Object.entries(bundle.scorecards)
    .map(([id, card]): CostRow | null => {
      const price = priceFor(id)
      if (!price) return null
      const sc = card as typeof card & { serving?: string; speed_tok_s?: number | null }
      const realSpeed = sc.serving === 'cerebras' && sc.speed_tok_s ? sc.speed_tok_s : null
      return {
        id,
        tier: card.rsl_tier,
        evidence: 'measured' as const,
        success: card.metrics.success_rate,
        far: card.metrics.false_accept_rate,
        price,
        per1k: costPer1kDecisions(price),
        speed: realSpeed ?? GPU_CLASS_TOKS,
        speedMeasured: realSpeed != null,
      }
    })
    .filter((r): r is CostRow => r !== null)

  const pending: CostRow[] = (bundle.pending_models ?? [])
    .map((m): CostRow | null => {
      const price = priceFor(m.id)
      if (!price) return null
      return {
        id: m.id,
        tier: '',
        evidence: 'pending' as const,
        success: null,
        far: null,
        price,
        per1k: costPer1kDecisions(price),
        speed: GPU_CLASS_TOKS,
        speedMeasured: false,
      }
    })
    .filter((r): r is CostRow => r !== null)

  const [filter, setFilter] = useState<TierFilter>('all')
  // Default sort = the intuitive "which should I pick" order: best readiness first, then cheapest.
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'tier', dir: 'desc' })

  function rank(r: CostRow, key: SortKey): number | string {
    switch (key) {
      case 'model': return modelLabel(r.id).toLowerCase()
      case 'tier': return (TIER_RANK[r.tier] ?? -1) + (r.success ?? 0) / 100 // tier, then success
      case 'speed': return r.speed
      case 'per1k': return r.per1k
      case 'price': return r.price.inPerM
    }
  }
  const sortedMeasured = [...measured].sort((a, b) => {
    const ra = rank(a, sort.key), rb = rank(b, sort.key)
    let v = typeof ra === 'string' ? ra.localeCompare(rb as string) : (ra as number) - (rb as number)
    v = sort.dir === 'asc' ? v : -v
    // Cheapest-first tiebreak applies AFTER direction, so ties always favor lower cost — never
    // surface a pricier model above an equally-rated cheaper one.
    if (v === 0) v = a.per1k - b.per1k
    return v
  })
  // Pending (untested) rows always sit at the bottom.
  const allRows = [...sortedMeasured, ...pending.sort((a, b) => a.per1k - b.per1k)]
  const rows = filter === 'all' ? allRows : allRows.filter((r) => r.tier === filter)

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'tier' || key === 'speed' ? 'desc' : 'asc' },
    )
  }

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
  const fastestSiteReady = [...siteReady].sort((a, b) => b.speed - a.speed)[0]

  // The Cerebras-served lineup carries a measured throughput (tok/s) — the speed wedge.
  const cerebras = measured
    .filter((r) => r.speedMeasured)
    .sort((a, b) => b.speed - a.speed)

  // Render helper (NOT a component defined-in-render) for a sortable column header.
  const head = (k: SortKey, label: string, hint?: string) => (
    <button
      type="button"
      role="columnheader"
      key={k}
      className={`fd-cost-th ${sort.key === k ? 'on' : ''}`}
      aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => toggleSort(k)}
      title={hint ? `${hint} — click to sort` : 'Click to sort'}
    >
      {label}
      <span className="fd-cost-arrow" aria-hidden="true">{sort.key === k ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  )

  return (
    <section className="fd-section fd-shell" id="cost">
      <div className="fd-kicker">Cost vs readiness vs speed</div>
      <h2>The cheapest model is rarely the cheapest outcome.</h2>
      <p className="fd-section-sub">
        Three things decide the real bill: the <strong>readiness</strong> a model earns (how much a
        human still has to babysit), the <strong>price</strong> per decision, and the{' '}
        <strong>speed</strong> it runs at. Sort by any column to rank them the way you’d buy.
      </p>

      {cerebras.length > 0 && (
        <div className="fd-cere">
          <div className="fd-cere-banner">
            <span className="fd-cere-kick">⚡ Measured live on Cerebras</span>
            <p>
              All three open models <strong>earn the same site-ready L3</strong>, each run through every{' '}
              {bundle.cases.length} FactoryDad-1 case on Cerebras — at <strong>~370–1,600 tokens/sec,
              roughly 5–22× a typical GPU endpoint</strong>. So the per-decision safety check adds
              milliseconds, not cost: verifying <em>every</em> action becomes effectively free.{' '}
              <strong>Gemma 4 31B</strong> earns L3 at a third the size of the others and the lowest cost —
              the best value on the board. (Throughput reflects how Cerebras tunes each model’s serving,
              not model quality — readiness is what the oracle scores, and all three pass.)
            </p>
          </div>
          <div className="fd-cere-grid">
            {cerebras.map((r) => (
              <div className="fd-cere-card" key={r.id}>
                <div className="fd-cere-top">
                  <span className="fd-cere-model">{modelLabel(r.id)}</span>
                  <b className="fd-cere-tier" style={{ color: tierColor(r.tier) }}>{r.tier}</b>
                </div>
                <span className="fd-cere-sub">{modelSubLabel(r.id)}</span>
                <div className="fd-cere-stats">
                  <span><b>{pct(r.success ?? 0)}</b><small>success</small></span>
                  <span><b>{r.speed.toLocaleString()}</b><small>tok/s</small></span>
                  <span><b>{usd(r.per1k)}</b><small>/ 1k</small></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
        <span className="fd-cost-sorthint">Click any column to sort ↕</span>
      </div>

      <div className="fd-cost-table" role="table" aria-label="Cost versus readiness versus speed by model">
        <div className="fd-cost-head" role="row">
          {head('model', 'Model')}
          {head('tier', 'RSL tier', 'Autonomy earned (success · FAR)')}
          {head('speed', 'Speed', 'Inference throughput')}
          {head('per1k', '$ / 1k decisions', 'Cost to run 1,000 decisions')}
          {head('price', 'List price (in / out)', 'Provider price per 1M tokens')}
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
              {r.speedMeasured ? (
                <><b className="fd-cost-fast">{r.speed.toLocaleString()}</b><small> tok/s ⚡</small></>
              ) : (
                <span className="fd-cost-gpu">~{r.speed}<small> tok/s · GPU class</small></span>
              )}
            </span>
            <span role="cell" className="fd-cost-num"><b>{usd(r.per1k)}</b></span>
            <span role="cell" className="fd-cost-num">
              ${r.price.inPerM.toFixed(2)} / ${r.price.outPerM.toFixed(2)}
              <small> /1M tok</small>
            </span>
          </div>
        ))}
      </div>

      <div className="fd-cost-takeaways">
        {cheapestSiteReady && (
          <div className="fd-cost-take">
            <span className="fd-kicker">Best value that’s site-ready</span>
            <b>{modelLabel(cheapestSiteReady.id)} {modelSubLabel(cheapestSiteReady.id)} — {cheapestSiteReady.tier}</b>
            <span>
              {usd(cheapestSiteReady.per1k)} / 1k decisions{cheapestSiteReady.speedMeasured ? ` at ${cheapestSiteReady.speed.toLocaleString()} tok/s` : ''}. The cheapest
              model that earns autonomy with escalation on this floor.
            </span>
          </div>
        )}
        {fastestSiteReady && (
          <div className="fd-cost-take">
            <span className="fd-kicker">Fastest site-ready</span>
            <b>{modelLabel(fastestSiteReady.id)} {modelSubLabel(fastestSiteReady.id)} — {fastestSiteReady.tier}</b>
            <span>
              {fastestSiteReady.speedMeasured ? `${fastestSiteReady.speed.toLocaleString()} tok/s` : 'GPU class'} ·{' '}
              {usd(fastestSiteReady.per1k)} / 1k. When the gate runs on every action, throughput is the
              budget — and Cerebras buys the most of it.
            </span>
          </div>
        )}
      </div>

      <div className="fd-cost-bottomline">
        <span className="fd-kicker">What the price actually means for you</span>
        <p>
          You pay <strong>two</strong> bills, not one. The <strong>$ / 1k decisions</strong> column is the
          inference bill — and a robot on a busy shift makes roughly a thousand calls, so it’s about{' '}
          <strong>pennies per robot per shift</strong>. The bill you don’t see is{' '}
          <strong>human oversight</strong>: a model stuck at <b style={{ color: 'var(--neg)' }}>L1</b> needs a
          person to check <em>every</em> decision; an <b style={{ color: 'var(--pos)' }}>L3</b> model runs the
          floor on its own and only escalates the genuinely hard calls.
        </p>
        <p>
          So the cheapest row is almost never the cheapest <em>month</em>. <strong>Gemma 4 31B on Cerebras</strong>{' '}
          costs a little more per call than the rock-bottom options — but it earns{' '}
          <b style={{ color: 'var(--pos)' }}>L3</b> and runs fast, which is exactly what takes a human out of
          the loop. That’s the trade you’re buying: <strong>a few cents more per 1k decisions to stop paying
          someone to babysit each one</strong> — and at Cerebras speed, the safety check on every action is
          effectively free.
        </p>
      </div>

      <p className="fd-cost-note">
        Prices are the <strong>providers’ published list prices</strong> (USD / 1M tokens, reviewed
        2026-06) — not Origin pricing; Origin is model-agnostic. Cost assumes a measured ~
        {IN_TOKENS_PER_CASE} input and ~{OUT_TOKENS_PER_CASE} output tokens/decision. <strong>Speed</strong> is
        a real measured throughput for the <span className="fd-cost-fast">⚡ Cerebras</span> lineup; the
        rest show the published <strong>GPU-endpoint class (~50–100 tok/s)</strong> — we didn’t
        benchmark their throughput, only their readiness. Illustrative, not a quote.
      </p>
    </section>
  )
}
