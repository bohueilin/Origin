// The over-grant analyzer, at full size. /security carries the same two panels as one
// stop on a tour; this page exists so the analyzer is FINDABLE — it is the most
// investor-legible thing the repo produces, and it was buried one panel deep.
//
// Everything computed here is computed in the visitor's browser over the seeded
// SYNTHETIC corpus, by the same functions the published bench artifact re-derives from.
import { useMemo } from 'react'
import '../shared/product-workspace.css'
import { DelegationPanel, OverGrantPanel } from '../security/SecurityPage'
import { generateCorpus, grantUtilization, blastRadius } from '@origin/verifier-core/overGrant'

const SEED = 20260818

// Small on purpose: the page must render instantly. The published bench runs 2,000
// roots; the browser table samples the same generator at 300 so first paint stays
// under a frame budget. The seed is printed so the numbers are re-derivable.
const ROOTS = 300

export function OverGrantPage() {
  const rows = useMemo(() => {
    const corpus = generateCorpus({ seed: SEED, roots: ROOTS, depth: 4 })
    const gur = grantUtilization(corpus)
    const bri = blastRadius(corpus)
    const briById = new Map(bri.perIdentity.map((p) => [p.id, p]))
    return gur.perIdentity
      .map((p) => ({ ...p, dormant: p.granted - p.used, bri: briById.get(p.id)?.bri ?? 0 }))
      .sort((a, b) => b.dormant - a.dormant || b.bri - a.bri)
      .slice(0, 8)
  }, [])
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`

  return (
    <div className="product-workspace og-workspace">
      <section className="section" aria-labelledby="og-table-title">
        <div className="shell">
          <div className="workspace-heading">
          <p className="workspace-eyebrow">01 · The authority inventory</p>
          <h2 id="og-table-title">What is held. What is used. What remains.</h2>
          <p className="section__lede">
            These eight synthetic identities have the most unused granted scopes in this sample.
            Dormant means a granted scope had zero allowed calls in the observation window; it does not by itself prove that permission should be removed.
          </p>
          <p className="og-table-scope"><span><b>Input</b> Synthetic fleet</span><span><b>Sample</b> {ROOTS} roots</span><span><b>Seed</b> {SEED}</span></p>
          </div>
          <div className="scorecard-wrap" style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label="Most over-granted identities (scrollable)">
            <table className="scorecard" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left' }}>Identity</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Granted</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Exercised</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Dormant</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Utilization</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Blast radius</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row" style={{ textAlign: 'left', fontFamily: 'var(--font-sans)' }}><code>{r.id}</code></th>
                    <td data-label="Granted" style={{ textAlign: 'right' }}>{r.granted}</td>
                    <td data-label="Exercised" style={{ textAlign: 'right' }}>{r.used}</td>
                    <td data-label="Dormant" style={{ textAlign: 'right', fontWeight: 600 }}>{r.dormant}</td>
                    <td data-label="Utilization" style={{ textAlign: 'right' }}>{pct(r.gur)}</td>
                    <td data-label="Blast radius" style={{ textAlign: 'right' }}>{pct(r.bri)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sec-note">The analyzer below uses 400 roots; the published benchmark uses 2,000. All use the same seeded generator. Sample sizes differ, so their totals are not directly interchangeable.</p>
        </div>
      </section>

      <section className="section section--tint" aria-label="Attenuation, interactive">
        <div className="shell">
          <DelegationPanel />
        </div>
      </section>

      <section className="section" aria-label="The full analyzer">
        <div className="shell">
          <OverGrantPanel />
        </div>
      </section>
    </div>
  )
}
