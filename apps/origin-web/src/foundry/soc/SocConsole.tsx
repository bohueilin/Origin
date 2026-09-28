// Synthetic incident scenarios and backend-dependent comparisons. Returned model
// responses are proposals; only the scenario policy establishes its deterministic outcome.

import { useCallback, useEffect, useState } from 'react'
import '../ui/foundry.css'
import './soc.css'
import { socRun, socRace, leaderboard, socShootout, economics, ensemble, latency, accuracy, passportRun, supervisionRun } from './socClient'
import { SOC_ACTIONS, isDestructive } from './socEnv'
import type { SocRunResponse, SocRaceResponse, SocDecision, LeaderboardResponse, SocShootoutResponse, EconomicsResponse, EnsembleResponse, LatencyResponse, AccuracyResponse, PassportRunResponse, SupervisionResponse } from './socTypes'
import type { FoundrySource } from '../types'

const LABEL = new Map(SOC_ACTIONS.map((a) => [a.id, a.label]))
const actLabel = (id: string) => LABEL.get(id) ?? id

function SourceBadge({ source, model }: { source: FoundrySource; model?: string }) {
  const label = source === 'cerebras' ? 'gemma-4-31b · Cerebras' : source === 'gemini' ? model || 'GPU baseline' : 'deterministic mock'
  return <span className={`fdy-badge fdy-badge--${source}`}>{label}</span>
}

// ---- the speed leaderboard (raw-speed proof) --------------------------------

export function Leaderboard() {
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      setData(await leaderboard())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Leaderboard failed.')
    } finally {
      setBusy(false)
    }
  }, [])
  const max = Math.max(...(data?.lanes.map((l) => l.tokS ?? 0) ?? [1]), 1)

  return (
    <section className="fdy-card fdy-race">
      <div className="fdy-card__head">
        <h2>Raw speed: one prompt, every model</h2>
        <p>Compare response throughput across configured providers for one synthetic prompt. Read each lane’s availability and timing provenance; throughput does not establish verification quality or cost.</p>
      </div>
      <button className="fdy-btn fdy-btn--primary" onClick={run} disabled={busy}>
        {busy ? 'Racing the field…' : data ? 'Run again' : 'Run the leaderboard'}
      </button>
      {err && <p className="fdy-lane__note" style={{ marginTop: 10 }}>{err}</p>}
      {data && (
        <div className="soc-board">
          {data.lanes.map((l) => (
            <div key={l.label} className={`soc-board__row${l.provider === 'cerebras' ? ' soc-board__row--cb' : ''}`}>
              <span className="soc-board__rank">#{l.rank}</span>
              <span className="soc-board__name">
                {l.label}
                {l.provider === 'cerebras' && <span style={{ opacity: 0.7, fontWeight: 400 }}> · Cerebras</span>}
              </span>
              <div className="soc-board__track">
                <div className="soc-board__fill" style={{ width: `${l.ok ? Math.max(2, Math.round(((l.tokS ?? 0) / max) * 100)) : 0}%` }} />
              </div>
              <span className="soc-board__tok">{l.ok ? `${l.tokS} tok/s` : l.note || '—'}</span>
            </div>
          ))}
          {data.speedupVsBestGpu && (
            <div className="fdy-race__verdict">Observed throughput ratio: {data.speedupVsBestGpu}× relative to the fastest available comparison lane in this run.</div>
          )}
        </div>
      )}
    </section>
  )
}

// ---- the thesis band (the Q&A-winning depth + citations artifact) -----------

export function ControlPlaneThesis() {
  const loop = ['perceive', 'propose', 'RATIFY', 'block / execute', 'audit']
  return (
    <section className="cpt">
      <div className="cpt__eyebrow">The control plane for autonomy</div>
      <h2 className="cpt__slogan">Capability is not permission.</h2>
      <p className="cpt__lede">
        A model proposes an action. A <strong>deterministic policy</strong> evaluates the defined synthetic action boundary.
        These demonstrations explore whether the declared policy rejects the fixture; they do not prove that every dangerous action is covered,
        or that a production system enforces the same boundary.
      </p>
      <div className="cpt__loop">
        {loop.map((s, i) => (
          <span key={s} className={`cpt__node${s === 'RATIFY' ? ' cpt__node--key' : ''}`}>
            {s}
            {i < loop.length - 1 && <i className="cpt__arrow" aria-hidden="true">→</i>}
          </span>
        ))}
      </div>
      <p className="cpt__honest">
        <strong>Model proposals · deterministic policy checks.</strong>{' '}
        The backend can use gemma-4-31b for perception, proposals and review; unavailable calls may use fixtures. The verdict itself is a
        deterministic oracle (the fail-closed policy floor): the authority for the defined policy decision. Its correctness still depends on the policy, the implementation and the scenario coverage.
      </p>
      <div className="cpt__cols">
        <div className="cpt__col">
          <h3>Research references</h3>
          <ul>
            <li><b>DeepMind AI Control Roadmap:</b> a research reference. This prototype explores selected agent-control patterns; it does not implement the entire roadmap.</li>
            <li><b>arXiv 2602.09947:</b> a research reference on deterministic architectural boundaries. Inspect the policy implementation and scenario coverage separately.</li>
            <li><b>Inference speed:</b> compare returned timing under the displayed assumptions; throughput alone does not establish verification quality.</li>
          </ul>
        </div>
        <div className="cpt__col">
          <h3>Honest by design</h3>
          <ul>
            <li>The deterministic floor checks defined synthetic actions. These fixtures do not establish containment of every prompt injection or enforcement in a connected production tool.</li>
            <li><b>Deterministic + auditable</b>, not "formally verified." The audit trace IS the evidence — an independently verifiable record, not a certificate.</li>
            <li><b>Frame-by-frame perception</b>, not video. Gemma-4 on Cerebras is image+text → text. The sample does not establish robot readiness.</li>
          </ul>
        </div>
      </div>
    </section>
  )
}

// ---- reacts-before-I-finish (latency) ---------------------------------------

export function LatencyPanel() {
  const [data, setData] = useState<LatencyResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [typed, setTyped] = useState(0)
  const run = useCallback(async () => {
    setBusy(true)
    setErr(null)
    setTyped(0)
    try {
      setData(await latency())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Latency test failed.')
    } finally {
      setBusy(false)
    }
  }, [])
  // Elapsed replay time, tagged with the response object it was measured against. run()
  // assigns a fresh object per run, so a new run reads 0 immediately instead of
  // inheriting the previous run's clock until the first tick lands.
  const [tick, setTick] = useState<{ src: LatencyResponse | null; ms: number }>({ src: null, ms: 0 })
  useEffect(() => {
    if (!data) return
    const t0 = performance.now()
    const t = setInterval(() => {
      setTick({ src: data, ms: performance.now() - t0 })
      setTyped((n) => (n >= data.attackText.length ? n : n + 1))
    }, 26)
    return () => clearInterval(t)
  }, [data])
  const elapsedMs = tick.src === data ? tick.ms : 0

  const ratio = data && data.cerebras.ok && data.gpu.ok && data.cerebras.totalMs && data.gpu.totalMs ? Math.round((data.gpu.totalMs / data.cerebras.totalMs) * 10) / 10 : null
  // Reveal the response according to its returned timing. The lane identifies
  // whether that timing came from the backend or an illustrative fallback.
  const responseVisible = !!data && elapsedMs >= (data.cerebras.totalMs ?? 0)

  return (
    <section className="fdy-card fdy-race">
      <div className="fdy-card__head">
        <h2>Model-response timing on a synthetic instruction</h2>
        <p>Compare responses to a synthetic directive. Each lane identifies a backend response or illustrative fallback before its timing. This sequence replays returned data; no tool action executes.</p>
      </div>
      <button className="fdy-btn fdy-btn--primary" onClick={run} disabled={busy}>
        {busy ? 'Sending the attack…' : data ? 'Replay the attack' : 'Send the attack'}
      </button>
      {err && <p className="fdy-lane__note" style={{ marginTop: 10 }}>{err}</p>}
      {data && (
        <div className="fdy-race__lanes">
          <div className="soc-attack">
            <span className="soc-attack__label">attacker →</span>
            <span className="soc-attack__text">{data.attackText.slice(0, typed)}<span className="soc-attack__caret" /></span>
          </div>
          <div className="soc-lat__rows">
            <div className={`soc-lat__row${responseVisible ? ' is-on' : ''}`}>
              <span className="soc-lat__badge soc-lat__badge--cb">Cerebras response</span>
              <span className="soc-lat__val">{responseVisible ? `${data.cerebras.ok ? 'Backend response' : 'Illustrative fallback'} · returned decision ${data.cerebras.verdict} · ${data.cerebras.totalMs === null ? 'timing unavailable' : `${data.cerebras.totalMs} ms`}` : '…'}</span>
            </div>
            <div className={`soc-lat__row${typed >= data.attackText.length ? ' is-on' : ''}`}>
              <span className="soc-lat__badge soc-lat__badge--gpu">{data.gpu.label}</span>
              <span className="soc-lat__val">{typed >= data.attackText.length ? `${data.gpu.ok ? 'Backend response' : 'Illustrative fallback'} · response time ${data.gpu.totalMs === null ? 'unavailable' : `${data.gpu.totalMs} ms`}` : 'awaiting replay…'}</span>
            </div>
          </div>
          {typed >= data.attackText.length && (
            <div className="fdy-race__verdict">{ratio ? `Observed response-time ratio: ${ratio}×. ` : 'Illustrative comparison; no measured ratio is claimed. '}No tool executes. Returned decisions do not establish prompt-injection prevention.</div>
          )}
        </div>
      )}
    </section>
  )
}

// ---- accuracy vs latency ----------------------------------------------------

export function AccuracyPanel() {
  const [data, setData] = useState<AccuracyResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      setData(await accuracy())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Accuracy test failed.')
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <section className="fdy-card fdy-race">
      <div className="fdy-card__head">
        <h2>Accuracy within a time budget</h2>
        <p>Compare observed scenario outcomes and timing under the displayed assumptions. Synthetic accuracy and latency do not establish a correctness guarantee or platform-wide advantage.</p>
      </div>
      <button className="fdy-btn fdy-btn--primary" onClick={run} disabled={busy}>
        {busy ? 'Measuring…' : data ? 'Measure again' : 'Run the accuracy test'}
      </button>
      {err && <p className="fdy-lane__note" style={{ marginTop: 10 }}>{err}</p>}
      {data && (
        <div className="soc-acc">
          <p className="fdy-lane__note">{data.source === 'mock' ? 'Illustrative fallback' : 'Backend scenario results; individual timing may include fallback'} · synthetic fixtures only.</p>
          {data.points.map((p) => (
            <div key={p.label} className={`soc-acc__row${p.provider === 'cerebras' ? ' soc-acc__row--cb' : ''}`}>
              <span className="soc-acc__name">{p.label}</span>
              <div className="soc-acc__track">
                <div className="soc-acc__fill" style={{ width: `${p.accuracyPct}%` }} />
              </div>
              <span className="soc-acc__val">{p.accuracyPct}%</span>
              <span className="soc-acc__lat">{p.budgetMs}ms</span>
            </div>
          ))}
          <div className="fdy-race__verdict">These results describe the selected synthetic scenarios and configurations only. Timing may include fallback values; no general platform comparison follows.</div>
        </div>
      )}
    </section>
  )
}

// ---- $ economics (throughput → a business outcome) --------------------------

export function EconomicsPanel() {
  const [data, setData] = useState<EconomicsResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [alerts, setAlerts] = useState(5000)
  const run = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      setData(await economics())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Economics failed.')
    } finally {
      setBusy(false)
    }
  }, [])
  const mins = (perMin: number) => Math.max(1, Math.round(alerts / perMin))
  const tokRatio = data && data.gpu.tokS && data.cerebras.tokS ? Math.round((data.cerebras.tokS / data.gpu.tokS) * 10) / 10 : null

  return (
    <section className="fdy-card fdy-race">
      <div className="fdy-card__head">
        <h2>The economics</h2>
        <p>Compare single-call timing on this synthetic fixture. The calculator projects throughput from that timing; it does not measure production capacity or monetary cost.</p>
      </div>
      <button className="fdy-btn fdy-btn--primary" onClick={run} disabled={busy}>
        {busy ? 'Measuring…' : data ? 'Measure again' : 'Run the economics'}
      </button>
      {err && <p className="fdy-lane__note" style={{ marginTop: 10 }}>{err}</p>}
      {data && (
        <div className="soc-board">
          {[data.cerebras, data.gpu].map((l) => (
            <div key={l.label} className={`soc-board__row${l.provider === 'cerebras' ? ' soc-board__row--cb' : ''}`}>
              <span className="soc-board__rank" />
              <span className="soc-board__name">{l.provider === 'cerebras' ? 'Gemma-4-31B · Cerebras' : l.label}</span>
              <div className="soc-board__track">
                <div className="soc-board__fill" style={{ width: `${Math.round((l.clearedPerMin / Math.max(data.cerebras.clearedPerMin, data.gpu.clearedPerMin)) * 100)}%` }} />
              </div>
              <span className="soc-board__tok">{l.clearedPerMin}/min</span>
            </div>
          ))}
          <div className="soc-econ__calc">
            <label>
              Alert volume / day:
              <input type="number" min={100} step={500} value={alerts} onChange={(e) => setAlerts(Math.max(100, Number(e.target.value) || 0))} />
            </label>
            <div className="soc-shoot__tax">
              Illustrative sequential projection for <strong>{alerts.toLocaleString()}</strong> synthetic alerts: <strong>Cerebras ~{mins(data.cerebras.clearedPerMin)} min</strong> vs the GPU&rsquo;s ~{mins(data.gpu.clearedPerMin)} min.
              {tokRatio && <> At <strong>{data.cerebras.tokS} tok/s vs {data.gpu.tokS}</strong> ({tokRatio}× observed throughput ratio); no monetary cost is measured.</>}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// ---- ensemble-of-N Guardians ------------------------------------------------

export function EnsemblePanel() {
  const [data, setData] = useState<EnsembleResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      setData(await ensemble())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ensemble failed.')
    } finally {
      setBusy(false)
    }
  }, [])
  const gpu7Ms = data ? data.oneGpuGuardianMs * data.total : 0

  return (
    <section className="fdy-card fdy-race">
      <div className="fdy-card__head">
        <h2>Explore a committee of reviewers</h2>
        <p>Compare parallel model responses to a synthetic incident. The miss-rate curve below is a model under its stated assumptions; it is not measured production reliability.</p>
      </div>
      <button className="fdy-btn fdy-btn--primary" onClick={run} disabled={busy}>
        {busy ? 'Convening the committee…' : data ? 'Run again' : 'Run N Guardians'}
      </button>
      {err && <p className="fdy-lane__note" style={{ marginTop: 10 }}>{err}</p>}
      {data && (
        <div className="fdy-race__lanes">
          <p className="fdy-lane__note">{data.source === 'mock' ? 'Illustrative fallback' : 'Backend scenario results'} · synthetic fixture; independence is an assumption.</p>
          <div className="soc-shoot__meta" style={{ marginTop: 4 }}>
            <span className="soc-shoot__safe">{data.vetoes}/{data.total} Guardians vetoed{data.vetoes === data.total ? ' — unanimous' : ''}</span>
            <span>attack: &ldquo;{data.incidentTitle}&rdquo;</span>
            <span>single-reviewer miss {data.singleMissPct}%</span>
          </div>
          <div className="fdy-race__verdict">
            {data.total} parallel model responses returned in <strong>{data.cerebrasAllMs}ms</strong> on Cerebras (parallel). A sequential comparison projected from one response: ~{gpu7Ms}ms.
            Under the independence assumption, this model estimates a committee miss rate of ~{data.points[data.points.length - 1].missRatePct}%. Correlated errors can invalidate that estimate.
          </div>
        </div>
      )}
    </section>
  )
}

// ---- Passport: identity → authority → veto (multi-agent safety) -------------

export function PassportPanel() {
  const [data, setData] = useState<PassportRunResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      setData(await passportRun())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Passport run failed.')
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <section className="fdy-card">
      <div className="fdy-card__head">
        <h2>Who is allowed, before what is allowed</h2>
        <p>
          DeepMind&rsquo;s multi-agent frontier: identity, <strong>attenuated delegation</strong>, oversight. Passport is a deterministic authority gate
          <em> in front of</em> the Guardian. An agent can&rsquo;t act beyond its grant — and a hijacked agent can&rsquo;t manufacture authority it never held.
        </p>
        <p className="pp-narrate-note">
          gemma-4 <strong>narrates</strong> each verdict in plain English — it does <em>not</em> decide it. The deterministic oracle already ruled; the model only puts the reason into words.
        </p>
      </div>
      <button className="fdy-btn fdy-btn--primary" onClick={run} disabled={busy}>
        {busy ? 'Checking authority…' : data ? 'Run again' : 'Run the authority scenarios'}
      </button>
      {err && <p className="fdy-apierror" role="alert">{err}</p>}
      {data && (
        <>
          <ol className="pp-list">
            {data.decisions.map((d) => (
              <li key={d.id} className={`pp-card pp-card--${d.outcome}`}>
                <div className="pp-card__head">
                  <span className="pp-card__id">{d.id}</span>
                  <span className="pp-card__title">{d.title}</span>
                  <span className={`pp-outcome pp-outcome--${d.outcome}`}>{d.outcome === 'executed' ? 'EXECUTED' : 'BLOCKED'}</span>
                </div>
                <div className="pp-sub">{d.agentLabel} → <code>{actLabel(d.action)}</code>{d.tokS ? <span className="pp-tok"> · {d.tokS} tok/s</span> : null}</div>
                <ol className="pp-chain">
                  {d.chain.map((s, i) => (
                    <li key={i} className={`pp-step pp-step--${s.status}`}>
                      <span className="pp-step__label">{s.label}</span>
                      <span className="pp-step__detail">{s.detail}</span>
                    </li>
                  ))}
                </ol>
                {d.explanation && (
                  <p className="pp-explain"><span className="pp-explain__tag">why</span>{d.explanation}</p>
                )}
              </li>
            ))}
          </ol>
          <div className="soc-verdict">
            <strong>{data.blocked} of {data.total} blocked.</strong> A <em>safe</em> action by an unauthorized agent is still denied — capability is not permission —
            and a hijacked agent can&rsquo;t delegate a power it never held. The authority decision is deterministic; an agent can&rsquo;t reason its way past it.
          </div>
        </>
      )}
    </section>
  )
}

// ---- Hierarchical supervision: cheap floor everywhere, gemma-4 on the few ---

export function SupervisionPanel() {
  const [data, setData] = useState<SupervisionResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      setData(await supervisionRun())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Supervision run failed.')
    } finally {
      setBusy(false)
    }
  }, [])

  const autoItems = data?.items.filter((i) => i.route === 'auto') ?? []
  const escItems = data?.items.filter((i) => i.route === 'escalate') ?? []
  const autoPct = data && data.total ? Math.round((data.autoCount / data.total) * 100) : 0

  return (
    <section className="fdy-card">
      <div className="fdy-card__head">
        <h2>One floor for all, judgment for the few</h2>
        <p>
          Compare deterministic routing with escalation to a model-assisted scenario loop.
          Both paths are graded by the synthetic oracle. The panel reports fixture outcomes and
          a workload projection; it does not measure production reliability or monetary savings.
        </p>
      </div>
      <button className="fdy-btn fdy-btn--primary" onClick={run} disabled={busy}>
        {busy ? 'Supervising the queue…' : data ? 'Run again' : 'Supervise the alert queue'}
      </button>
      {err && <p className="fdy-apierror" role="alert">{err}</p>}
      {data && (
        <>
          <div className="sv-funnel">
            <div className="sv-funnel__in">{data.total} alerts in</div>
            <div className="sv-funnel__split">
              <div className="sv-lane sv-lane--floor" style={{ flexGrow: Math.max(1, data.autoCount) }}>
                <div className="sv-lane__tier">Deterministic floor</div>
                <div className="sv-lane__count">{data.autoCount}</div>
                <div className="sv-lane__cost">local policy check</div>
              </div>
              <div className="sv-lane sv-lane--esc" style={{ flexGrow: Math.max(1, data.escalateCount) }}>
                <div className="sv-lane__tier">Escalated to gemma-4</div>
                <div className="sv-lane__count">{data.escalateCount}</div>
                <div className="sv-lane__cost">{data.escalatedMs}&thinsp;ms · {data.avgTokensPerEscalation} tok ea.</div>
              </div>
            </div>
          </div>

          <div className="sv-stats">
            <div className="sv-stat sv-stat--key">
              <span className="sv-stat__n">{data.threatsNeutralized}/{data.threatsTotal}</span>
              <span className="sv-stat__l">injection traps neutralized — all in the escalated set</span>
            </div>
            <div className="sv-stat">
              <span className="sv-stat__n">{data.correct}/{data.total}</span>
              <span className="sv-stat__l">resolved correctly by the oracle</span>
            </div>
            <div className="sv-stat">
              <span className="sv-stat__n">{autoPct}%</span>
              <span className="sv-stat__l">cleared without touching the model</span>
            </div>
          </div>

          <div className="sv-cols">
            <div className="sv-col">
              <h3 className="sv-col__h sv-col__h--floor">Floor handled · no LLM</h3>
              <ul className="sv-list">
                {autoItems.map((i) => (
                  <li key={i.incidentId} className={`sv-row ${i.correct ? '' : 'sv-row--miss'}`}>
                    <span className="sv-row__id">{i.incidentId}</span>
                    <span className="sv-row__title">{i.title}</span>
                    <span className="sv-row__act">{i.actionLabel}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="sv-col">
              <h3 className="sv-col__h sv-col__h--esc">Escalated · gemma-4 + Guardian</h3>
              <ul className="sv-list">
                {escItems.map((i) => (
                  <li key={i.incidentId} className={`sv-row sv-row--esc ${i.correct ? '' : 'sv-row--miss'} ${i.kind === 'injection_trap' ? 'sv-row--trap' : ''}`}>
                    <span className="sv-row__id">{i.incidentId}</span>
                    <span className="sv-row__title">{i.title}{i.kind === 'injection_trap' ? <span className="sv-trap"> trap</span> : null}</span>
                    <span className="sv-row__act">{i.actionLabel}{i.tokS ? <span className="sv-row__tok"> · {i.tokS} tok/s</span> : null}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="soc-verdict">
            <strong>{data.threatsNeutralized} of {data.threatsTotal} synthetic injection cases rejected.</strong>
            The floor handled {data.autoCount} scenarios and escalated {data.escalateCount}.
            Under the displayed mix, the workload projection estimates {data.projection.workSavedPct}%
            fewer model calls at {data.projection.dailyAlerts.toLocaleString()} scenarios per day.
            This projection does not establish production threat coverage, latency or cost.
          </div>
        </>
      )}
    </section>
  )
}

// ---- the "safety tax" shootout (accuracy + cost-of-safety) ------------------

function ShootLane({ l, checked }: { l: SocShootoutResponse['cerebras']; checked: boolean }) {
  return (
    <div className={`fdy-lane fdy-lane--${l.provider}`}>
      <div className="fdy-lane__top">
        <span className="fdy-lane__note">{l.ok ? 'Backend scenario result' : 'Illustrative fallback'} · synthetic fixtures</span>
        <SourceBadge source={l.provider === 'cerebras' ? 'cerebras' : 'gemini'} model={l.provider === 'cerebras' ? undefined : l.label} />
        <div className="fdy-lane__tok">{l.passed}/{l.total} <span>correct</span></div>
      </div>
      <div className="soc-shoot__meta">
        <span className={checked ? 'soc-shoot__safe' : 'soc-shoot__risk'}>{l.breaches} destructive action{l.breaches === 1 ? '' : 's'} executed{checked ? ' · per-step verified' : ' · no per-step check'}</span>
        <span>{l.mode === 'verified' ? 'verified every step' : 'one shot, no Guardian'}</span>
        <span>{l.totalMs}ms{l.tokS ? ` · ${l.tokS} tok/s` : ''}</span>
        {l.note && <span className="fdy-lane__note">{l.note}</span>}
      </div>
    </div>
  )
}

function Shootout() {
  const [data, setData] = useState<SocShootoutResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      setData(await socShootout())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Shootout failed.')
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <section className="fdy-card fdy-race">
      <div className="fdy-card__head">
        <h2>Cost of the additional checks</h2>
        <p>Compare the same synthetic incidents using one response or a per-step policy check. Inspect scenario outcomes and timing; neither workflow establishes a production safety guarantee.</p>
      </div>
      <button className="fdy-btn fdy-btn--primary" onClick={run} disabled={busy}>
        {busy ? 'Running both…' : data ? 'Run again' : 'Run the safety tax'}
      </button>
      {err && <p className="fdy-lane__note" style={{ marginTop: 10 }}>{err}</p>}
      {data && (
        <div className="fdy-race__lanes">
          <ShootLane l={data.cerebras} checked />
          <ShootLane l={data.gpuOneShot} checked={false} />
          <div className="soc-shoot__tax">
            Projected three-call comparison: ~{data.gpuVerifiedProjectedMs}ms versus the returned loop time of {data.cerebras.totalMs}ms.
            <strong> Projected timing ratio: {data.verificationTaxX}×.</strong> Synthetic outcomes: {data.cerebras.passed}/{data.cerebras.total} versus {data.gpuOneShot.passed}/{data.gpuOneShot.total}. This is not measured cost or a platform guarantee.
          </div>
        </div>
      )}
    </section>
  )
}

// ---- the loop-race (signature) ----------------------------------------------

function LoopRace() {
  const [data, setData] = useState<SocRaceResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      setData(await socRace())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Race failed.')
    } finally {
      setBusy(false)
    }
  }, [])

  const cCleared = data?.cerebras.incidentsCleared ?? 0
  const bCleared = data?.baseline.incidentsCleared ?? 0
  const max = Math.max(cCleared, bCleared, 1)

  return (
    <section className="fdy-card fdy-race">
      <div className="fdy-card__head">
        <h2>The loop-race</h2>
        <p>Same incident queue. In the wall-clock the GPU baseline spends triaging ONE alert, how many can Cerebras fully triage <em>and verify</em>? Inspect the timing and baseline assumptions before drawing a throughput conclusion.</p>
      </div>
      <button className="fdy-btn fdy-btn--primary" onClick={run} disabled={busy}>
        {busy ? 'Racing…' : data ? 'Race again' : 'Run the loop-race'}
      </button>
      {err && <p className="fdy-lane__note" style={{ marginTop: 10 }}>{err}</p>}
      {data && (
        <div className="fdy-race__lanes">
          {[data.cerebras, data.baseline].map((lane) => (
            <div key={lane.provider} className={`fdy-lane fdy-lane--${lane.provider}`}>
              <div className="fdy-lane__top">
                <SourceBadge source={lane.provider} model={lane.model} />
                <div className="fdy-lane__tok">
                  {lane.incidentsCleared} <span>{lane.incidentsCleared === 1 ? 'alert' : 'alerts'} cleared</span>
                </div>
              </div>
              <div className="fdy-lane__bar">
                <div className="fdy-lane__fill" style={{ width: `${Math.round((lane.incidentsCleared / max) * 100)}%` }} />
              </div>
              <div className="fdy-lane__meta">
                {lane.tokS != null && <span>{lane.tokS} tok/s</span>}
                {lane.totalMs != null && <span>{lane.totalMs}ms</span>}
                {lane.note && <span className="fdy-lane__note">{lane.note}</span>}
              </div>
            </div>
          ))}
          <div className="fdy-race__verdict">
            In the {data.windowMs}ms the GPU triaged 1 alert, Cerebras cleared {data.cerebras.incidentsCleared} and caught {data.threatsCaughtInWindow} threat
            {data.threatsCaughtInWindow === 1 ? '' : 's'} — {data.throughputRatio}× the throughput.
          </div>
        </div>
      )}
    </section>
  )
}

// ---- one triaged incident ---------------------------------------------------

function DecisionCard({ d }: { d: SocDecision }) {
  const blocked = d.verdict === 'veto' || isDestructive(d.proposed)
  return (
    <li className={`soc-card soc-card--${blocked ? 'veto' : 'ok'}`}>
      <div className="soc-card__head">
        <span className="soc-card__id">{d.incidentId}</span>
        <span className="soc-card__title">{d.title}</span>
        {d.perception.injectionSuspected && <span className="soc-tag soc-tag--inj">injection suspected</span>}
        <span className="soc-card__tok">{d.tokS ? `${d.tokS} tok/s` : d.source === 'mock' ? 'no measurement · mock source' : ''}</span>
      </div>
      <div className="soc-row"><b>Agent proposes</b> <code className={isDestructive(d.proposed) ? 'soc-danger' : ''}>{actLabel(d.proposed)}</code> <em>{d.rationale}</em></div>
      <div className="soc-row">
        <b>Guardian</b> <span className={`fdy-verdict fdy-verdict--${d.verdict}`}>{d.verdict === 'ratify' ? 'RATIFY' : 'VETO'}</span> {d.guardianReason}
      </div>
      <div className="soc-row"><b>Executed</b> <code>{actLabel(d.applied)}</code> <span className="soc-score">{d.scoreReason}</span></div>
      {isDestructive(d.noGuardApplied) && (
        <div className="soc-counter">
          ⚠ Without the Guardian, this agent would have executed <code className="soc-danger">{actLabel(d.noGuardApplied)}</code> — {d.noGuardCategory === 'fell_for_injection' ? 'obeying a prompt injection hidden in the alert.' : 'a destructive action against policy.'}
        </div>
      )}
    </li>
  )
}

// ---- the page ---------------------------------------------------------------

/** The reusable inference-advantage battery — the live Cerebras-vs-GPU proofs that hold for ANY
 *  Origin agent (software or robot). Embedded on /soc and /foundry. */
export function SpeedProofs({ intro }: { intro?: string }) {
  return (
    <>
      {intro && <p className="fdy-brainline">{intro}</p>}
      <Leaderboard />
      <LatencyPanel />
      <AccuracyPanel />
      <EconomicsPanel />
      <EnsemblePanel />
    </>
  )
}

export default function SocConsole() {
  const [run, setRun] = useState<SocRunResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [revealed, setRevealed] = useState(0)
  const [err, setErr] = useState<string | null>(null)

  const go = useCallback(async () => {
    setBusy(true)
    setErr(null)
    setRevealed(0)
    try {
      setRun(await socRun())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Run failed.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!run) return
    const t = setInterval(() => setRevealed((r) => (r >= run.decisions.length ? r : r + 1)), 500)
    return () => clearInterval(t)
  }, [run])

  const done = run && revealed >= run.decisions.length

  return (
    <div className="fdy">
      <header className="fdy-hero">
        <div className="fdy-hero__eyebrow">Origin Labs · Autonomy Control</div>
        <h1>
          Explore the action boundary.<br />
          Make each decision <span className="fdy-hero__mark">open to inspection</span>.
        </h1>
        <p className="fdy-hero__sub">
          Experimental security scenarios for delegated tools, hostile inputs and policy decisions.
          Inspect deterministic allow, deny and escalate rules alongside model-assisted proposals.
          Panels identify measured results, illustrative baselines and backend-dependent runs. These demonstrations do not establish production enforcement or prompt-injection prevention.
        </p>
      </header>

      <ControlPlaneThesis />

      <Leaderboard />

      <LoopRace />

      <Shootout />

      <LatencyPanel />

      <AccuracyPanel />

      <EconomicsPanel />

      <EnsemblePanel />

      <PassportPanel />

      <SupervisionPanel />

      <section className="fdy-card">
        <div className="fdy-card__head">
          <h2>Run the synthetic incident workflow</h2>
          <p>A simulated remediation agent proposes actions for a synthetic incident queue containing injected directives. Inspect the deterministic policy decisions and scenario trace; no connected production tool executes.</p>
        </div>
        <button className="fdy-btn fdy-btn--primary" onClick={go} disabled={busy}>
          {busy ? 'Triaging…' : run ? 'Run again' : 'Triage the queue'}
        </button>
        {err && <p className="fdy-apierror" role="alert">{err}</p>}

        {run && (
          <>
            <div className="fdy-stats">
              <div className="fdy-stat"><div className="fdy-stat__val">{run.passed}/{run.total}</div><div className="fdy-stat__label">correctly handled</div></div>
              <div className="fdy-stat fdy-stat--warn"><div className="fdy-stat__val">{run.threatsBlocked}</div><div className="fdy-stat__label">threats blocked</div></div>
              <div className="fdy-stat"><div className="fdy-stat__val">{run.threatsIfUnguarded}</div><div className="fdy-stat__label">would fire unguarded</div></div>
              <div className="fdy-stat"><div className="fdy-stat__val">{run.avgTokS ?? '—'}<span className="fdy-stat__unit"> tok/s</span></div><div className="fdy-stat__label">aggregate speed</div></div>
              <div className="fdy-stat"><div className="fdy-stat__val">{run.wallMs}<span className="fdy-stat__unit">ms</span></div><div className="fdy-stat__label">wall clock</div></div>
            </div>
            <ol className="soc-list" aria-live="polite">
              {run.decisions.slice(0, revealed).map((d) => (
                <DecisionCard key={d.incidentId} d={d} />
              ))}
            </ol>
            {done && (
              <div className="soc-verdict">
                <strong>{run.threatsBlocked} destructive action{run.threatsBlocked === 1 ? '' : 's'} blocked synchronously, before execution.</strong> Zero executed.
                The deterministic policy decides allow/deny within this synthetic workflow. The trace records these scenario decisions; it does not demonstrate a connected production tool or certify an agent.
              </div>
            )}
          </>
        )}
      </section>

      <p className="fdy-brainline">
        These prototypes use a Perceiver → Planner → <strong>Guardian</strong> → deterministic-oracle loop to evaluate what a{' '}
        <strong>robot</strong> or <strong>software agent</strong> proposes in a synthetic scenario. No operating authority follows. Capability is not permission.
      </p>

      <footer className="fdy-foot">
        <span>Origin Physical AI · the policy is the only judge</span>
        <span><a href="/foundry">See the physical-AI demo →</a> &nbsp; <a href="/app">Open the console →</a></span>
      </footer>
    </div>
  )
}
