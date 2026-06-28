import { useMemo, useState } from 'react'
import type { Bundle, Case, Terminal } from '../types'
import { SEVERITY_COLOR, TERMINAL_COLOR } from '../labels'
import { CaseBoard } from './CaseBoard'

type TFilter = Terminal | 'all'
type DFilter = 'core' | 'hard' | 'all'
type ThemeId = 'nav' | 'hazard' | 'defect' | 'budget'

// Each scenario probes one safety competency. Derived from the (descriptive)
// case id so the grouping stays in sync with the benchmark as it grows.
const THEMES: { id: ThemeId; name: string; blurb: string }[] = [
  { id: 'nav', name: 'Safe navigation', blurb: 'Find a route to the item and the drop — or prove none is safe.' },
  { id: 'hazard', name: 'Hazards & no-go zones', blurb: 'Never cross a hazard or an operator-only cell, whatever the goal.' },
  { id: 'defect', name: 'Defect & quality gate', blurb: 'Read the part scan, then handle, escalate, or refuse by severity.' },
  { id: 'budget', name: 'Energy & shift limits', blurb: 'Escalate when no safe route fits the battery or step budget.' },
]

function themeOf(c: Case): ThemeId {
  const k = c.case_id.toLowerCase()
  if (/battery|budget|shift|too-low|off-by-one|congest|tight|handoff/.test(k)) return 'budget'
  if (/anomaly|contamination|deformation|scan|missing|foreign|urgency|crack|biohazard|defect|occluded/.test(k)) return 'defect'
  if (/hazard|human-only|enclosed|wall|spill|barrier/.test(k)) return 'hazard'
  return 'nav'
}

const TERMS: Terminal[] = ['finish', 'escalate', 'refuse']

export function CasesSection({ bundle }: { bundle: Bundle }) {
  const [tf, setTf] = useState<TFilter>('all')
  const [df, setDf] = useState<DFilter>('all')
  const [theme, setTheme] = useState<ThemeId | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string>(bundle.cases[0].case_id)

  // Per-theme counts + finish/escalate/refuse mix for the overview cards.
  const themeStats = useMemo(() => {
    const m = new Map<ThemeId, { n: number; mix: Record<Terminal, number> }>()
    for (const t of THEMES) m.set(t.id, { n: 0, mix: { finish: 0, escalate: 0, refuse: 0 } })
    for (const c of bundle.cases) {
      const e = m.get(themeOf(c))!
      e.n += 1
      e.mix[c.oracle_terminal] += 1
    }
    return m
  }, [bundle.cases])

  const filtered = useMemo(
    () =>
      bundle.cases.filter(
        (c) =>
          (tf === 'all' || c.oracle_terminal === tf) &&
          (df === 'all' || c.difficulty === df) &&
          (theme === 'all' || themeOf(c) === theme),
      ),
    [bundle.cases, tf, df, theme],
  )
  const selected = bundle.cases.find((c) => c.case_id === selectedId) ?? bundle.cases[0]

  return (
    <section className="fd-section fd-shell" id="cases">
      <div className="fd-kicker">The test</div>
      <h2>What every robot is tested on</h2>
      <p className="fd-section-sub">
        A growing battery of real-world scenarios — warehouse, hospital, lab, and care-home floors —
        modeled on mobile-robot safety practice (human right-of-way, e-stop zones, spill &amp; biohazard
        handling, sensor occlusion, energy limits). Each one probes a safety competency; same questions
        for every model, every time — scan first, route around the hazards, then finish, escalate, or
        refuse. Pick a theme to explore, or open any scenario to watch the oracle's safe path play out.
      </p>

      <div className="fd-themes">
        <button className={`fd-theme ${theme === 'all' ? 'on' : ''}`} onClick={() => setTheme('all')}>
          <strong>All competencies</strong>
          <span className="fd-theme-blurb">Every scenario in the current benchmark.</span>
          <span className="fd-theme-n">{bundle.cases.length} scenarios</span>
        </button>
        {THEMES.map((t) => {
          const st = themeStats.get(t.id)!
          return (
            <button key={t.id} className={`fd-theme ${theme === t.id ? 'on' : ''}`} onClick={() => setTheme(t.id)}>
              <strong>{t.name}</strong>
              <span className="fd-theme-blurb">{t.blurb}</span>
              <span className="fd-theme-mix">
                {TERMS.map((term) => (
                  <span key={term} style={{ color: TERMINAL_COLOR[term] }}>{st.mix[term]} {term}</span>
                ))}
              </span>
              <span className="fd-theme-n">{st.n} scenarios</span>
            </button>
          )
        })}
      </div>

      <div className="fd-filters">
        <div className="fd-filter-grp" role="group" aria-label="Filter by decision">
          {(['all', 'finish', 'escalate', 'refuse'] as TFilter[]).map((t) => (
            <button key={t} className={`fd-chip ${tf === t ? 'on' : ''}`} onClick={() => setTf(t)}
                    style={tf === t && t !== 'all' ? { color: TERMINAL_COLOR[t], borderColor: TERMINAL_COLOR[t] } : undefined}>
              {t}{t !== 'all' ? ` (${bundle.terminal_counts[t]})` : ''}
            </button>
          ))}
        </div>
        <div className="fd-filter-grp" role="group" aria-label="Filter by difficulty">
          {(['all', 'core', 'hard'] as DFilter[]).map((d) => (
            <button key={d} className={`fd-chip ${df === d ? 'on' : ''}`} onClick={() => setDf(d)}>
              {d}{d !== 'all' ? ` (${bundle.difficulty_counts[d]})` : ''}
            </button>
          ))}
        </div>
        <span className="fd-filter-count">{filtered.length} shown</span>
      </div>

      <div className="fd-cases-layout">
        <div className="fd-gallery">
          {filtered.map((c) => (
            <button
              key={c.case_id}
              className={`fd-case-card ${c.case_id === selectedId ? 'sel' : ''}`}
              onClick={() => setSelectedId(c.case_id)}
            >
              <div className="fd-case-top">
                <span className="fd-term" style={{ color: TERMINAL_COLOR[c.oracle_terminal] }}>
                  {c.oracle_terminal}
                </span>
                <span className="fd-diff">{c.difficulty}</span>
              </div>
              <strong>{c.title}</strong>
              <span className="fd-case-intent">{c.droid_intent.skill} · {c.droid_intent.object}</span>
              <span className="fd-scan-badge" style={{ color: SEVERITY_COLOR[c.mvtec_scan.severity] }}>
                scan: {c.mvtec_scan.scan_status}
                {c.mvtec_scan.severity !== 'none' ? ` · ${c.mvtec_scan.severity}` : ''}
              </span>
            </button>
          ))}
          {filtered.length === 0 && <p className="fd-empty">No cases match that filter.</p>}
        </div>

        <CaseDetail caseData={selected} />
      </div>
    </section>
  )
}

function CaseDetail({ caseData }: { caseData: Case }) {
  const c = caseData
  const s = c.mvtec_scan
  return (
    <div className="fd-card fd-detail">
      <div className="fd-detail-head">
        <span className="fd-term-chip" style={{ background: TERMINAL_COLOR[c.oracle_terminal] }}>
          {c.oracle_terminal}
        </span>
        <span className="fd-diff">{c.difficulty}</span>
      </div>
      <h3>{c.title}</h3>
      <p className="fd-story">{c.factory_story}</p>

      <CaseBoard key={c.case_id} caseData={c} />

      <dl className="fd-meta">
        <div>
          <dt>DROID intent</dt>
          <dd>{c.droid_intent.skill} {c.droid_intent.object} — {c.droid_intent.goal}</dd>
        </div>
        <div>
          <dt>MVTec scan</dt>
          <dd>
            {s.object_category} · {s.scan_status}
            {s.anomaly_type !== 'none' ? ` · ${s.anomaly_type}` : ''}
            {' · '}
            <span style={{ color: SEVERITY_COLOR[s.severity], fontWeight: 500 }}>{s.severity} severity</span>
          </dd>
        </div>
        <div>
          <dt>Oracle</dt>
          <dd>
            <span style={{ color: TERMINAL_COLOR[c.oracle_terminal], fontWeight: 500 }}>{c.oracle_terminal}</span>
            {' — '}{c.oracle_rationale}
          </dd>
        </div>
        {c.urgency_note && (
          <div>
            <dt>Pressure</dt>
            <dd className="fd-urgency">{c.urgency_note} <em>Urgency never overrides safety.</em></dd>
          </div>
        )}
      </dl>
    </div>
  )
}
