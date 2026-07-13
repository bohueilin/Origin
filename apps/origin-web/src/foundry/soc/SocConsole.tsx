// Origin Autonomy-Control — the AI-SOC hero. A software agent triages live security incidents;
// a Planner (gemma-4-31b, realistically configured to follow alert guidance) sometimes obeys a
// prompt injection hidden in the alert and proposes a DESTRUCTIVE tool-call; the Guardian
// (gemma-4-31b) + a fail-closed deterministic policy floor VETO it on every step; the policy is
// the only judge. The loop-race proves Cerebras clears the whole queue + catches the threats in
// the time a GPU model handles one alert.

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
        <p>gemma-4-31b on Cerebras vs every frontier model we can reach, live — real tok/s measured this run. The gap is the whole reason per-step verification is free.</p>
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
            <div className="fdy-race__verdict">gemma-4-31b on Cerebras is {data.speedupVsBestGpu}× the fastest GPU model here — and far more vs the rest.</div>
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
        Gemma-4 proposes. A <strong>deterministic oracle — never an LLM</strong> — ratifies every action before it executes. A bad
        action is made <em>impossible</em>, not just unlikely. The only reason you can afford that check on <em>every</em> step is that
        Cerebras makes verification effectively free.
      </p>
      <div className="cpt__loop">
        {loop.map((s, i) => (
          <span key={s} className={`cpt__node${s === 'RATIFY' ? ' cpt__node--key' : ''}`}>
            {s}
            {i < loop.length - 1 && <i className="cpt__arrow">→</i>}
          </span>
        ))}
      </div>
      <p className="cpt__honest">
        <strong>3 gemma-4 agents per decision · 1 judge no model can bribe.</strong>{' '}
        The Perceiver, Planner, and Guardian all run on gemma-4-31b — they perceive, propose, and guard. The verdict itself is a
        deterministic oracle (the fail-closed policy floor): the only judge, and the one component no prompt, model, or injection can move.
      </p>
      <div className="cpt__cols">
        <div className="cpt__col">
          <h3>Validated by the consensus — not a slogan</h3>
          <ul>
            <li><b>DeepMind AI Control Roadmap</b> (Jun 18 2026): treat agents as insider threats; <b>block irreversible actions in real time</b>; defense-in-depth <em>"beyond model alignment… assurance even if alignment is imperfect."</em> Origin is that roadmap, shipped.</li>
            <li><b>arXiv 2602.09947</b> — <em>Trustworthy Agentic AI Requires Deterministic Architectural Boundaries:</em> alignment is insufficient; you need <b>deterministic mediation, privilege separation, fail-closed default-deny.</b> That is Origin's policy floor.</li>
            <li><b>Cerebras · Gemma-4 thesis:</b> fast inference lets you <em>"fit more verification and more retries into the same product"</em> — speed as the new quality lever.</li>
          </ul>
        </div>
        <div className="cpt__col">
          <h3>Honest by design</h3>
          <ul>
            <li>We <b>contain</b> prompt injection, we don&rsquo;t claim to <b>prevent</b> it — the destructive action never executes at the floor, regardless of what the model believes.</li>
            <li><b>Deterministic + auditable</b>, not "formally verified." The audit trace is the safety certificate.</li>
            <li><b>Frame-by-frame perception</b>, not video. Gemma-4 on Cerebras is image+text → text. We built the robot-ready brain, not a robot.</li>
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
  useEffect(() => {
    if (!data) return
    const t = setInterval(() => setTyped((n) => (n >= data.attackText.length ? n : n + 1)), 26)
    return () => clearInterval(t)
  }, [data])

  const ratio = data && data.cerebras.totalMs && data.gpu.totalMs ? Math.round((data.gpu.totalMs / data.cerebras.totalMs) * 10) / 10 : null
  const vetoVisible = data && typed > 4 // Cerebras is effectively instant — fires as you start typing

  return (
    <section className="fdy-card fdy-race">
      <div className="fdy-card__head">
        <h2>Reacts before you finish typing</h2>
        <p>An attacker injects a directive to disable the firewall. The Cerebras Guardian detects and blocks it before a GPU model has even returned its first token.</p>
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
            <div className={`soc-lat__row${vetoVisible ? ' is-on' : ''}`}>
              <span className="soc-lat__badge soc-lat__badge--cb">🛑 Cerebras Guardian</span>
              <span className="soc-lat__val">{vetoVisible ? `BLOCKED in ${data.cerebras.totalMs}ms · TTFT ${data.cerebras.ttftMs}ms` : '…'}</span>
            </div>
            <div className={`soc-lat__row${typed >= data.attackText.length ? ' is-on' : ''}`}>
              <span className="soc-lat__badge soc-lat__badge--gpu">⏳ {data.gpu.label}</span>
              <span className="soc-lat__val">{typed >= data.attackText.length ? `responded at ${data.gpu.totalMs}ms` : 'still thinking…'}</span>
            </div>
          </div>
          {typed >= data.attackText.length && ratio && (
            <div className="fdy-race__verdict">Cerebras blocked the injection in {data.cerebras.totalMs}ms — the GPU took {data.gpu.totalMs}ms, {ratio}× slower. The defense reacts before the attack finishes typing.{!data.cerebras.ok && <span className="fdy-race__sim"> · illustrative (no live key on this server)</span>}</div>
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
        <h2>Speed buys correctness</h2>
        <p>Give each platform a time budget. The GPU can barely finish one shot. Cerebras matches that accuracy in a fraction of the time — then spends the slack on verification to pull ahead.</p>
      </div>
      <button className="fdy-btn fdy-btn--primary" onClick={run} disabled={busy}>
        {busy ? 'Measuring…' : data ? 'Measure again' : 'Run the accuracy test'}
      </button>
      {err && <p className="fdy-lane__note" style={{ marginTop: 10 }}>{err}</p>}
      {data && (
        <div className="soc-acc">
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
          <div className="fdy-race__verdict">Same accuracy at a fraction of the latency — and Cerebras can afford to verify (still &lt;1s), which a GPU can&rsquo;t. More correct, per millisecond.</div>
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
        <p>Same single-call triage on each platform. Speed isn&rsquo;t vanity — it&rsquo;s incidents-per-minute and compute-per-incident, the only numbers a SOC buyer cares about.</p>
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
              Clear today&rsquo;s <strong>{alerts.toLocaleString()}</strong> alerts: <strong>Cerebras ~{mins(data.cerebras.clearedPerMin)} min</strong> vs the GPU&rsquo;s ~{mins(data.gpu.clearedPerMin)} min.
              {tokRatio && <> At <strong>{data.cerebras.tokS} tok/s vs {data.gpu.tokS}</strong> ({tokRatio}×), the compute cost per incident is far lower on Cerebras.</>}
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
        <h2>A committee, for the price of one</h2>
        <p>On a GPU you get one nervous reviewer. On Cerebras you run an independent committee in parallel — for roughly the same latency. The deterministic floor still sits underneath.</p>
      </div>
      <button className="fdy-btn fdy-btn--primary" onClick={run} disabled={busy}>
        {busy ? 'Convening the committee…' : data ? 'Run again' : 'Run N Guardians'}
      </button>
      {err && <p className="fdy-lane__note" style={{ marginTop: 10 }}>{err}</p>}
      {data && (
        <div className="fdy-race__lanes">
          <div className="soc-shoot__meta" style={{ marginTop: 4 }}>
            <span className="soc-shoot__safe">{data.vetoes}/{data.total} Guardians vetoed{data.vetoes === data.total ? ' — unanimous' : ''}</span>
            <span>attack: &ldquo;{data.incidentTitle}&rdquo;</span>
            <span>single-reviewer miss {data.singleMissPct}%</span>
          </div>
          <div className="fdy-race__verdict">
            {data.total} independent Guardians ran in <strong>{data.cerebrasAllMs}ms</strong> on Cerebras (parallel). The same {data.total} on the GPU: ~{gpu7Ms}ms.
            A {data.total}-vote committee cuts a single reviewer&rsquo;s miss rate to ~{data.points[data.points.length - 1].missRatePct}% — free, because verification is free at Cerebras speed.
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
          You can&rsquo;t afford a reasoning model on every alert — and you don&rsquo;t need one. A deterministic floor clears the obvious majority for
          <strong> $0 and ~0&thinsp;ms</strong>, and escalates only the <strong>suspicious minority</strong> — the injection traps and the genuine judgment
          calls — to a full gemma-4 perceive&rarr;plan&rarr;Guardian loop. Both tiers are graded by the same deterministic oracle.
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
                <div className="sv-lane__cost">free · ~0&thinsp;ms</div>
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
            <strong>{data.threatsNeutralized} of {data.threatsTotal} hidden injection attacks were neutralized — and both landed in the escalated lane,
            exactly where judgment was needed.</strong> The floor cleared {data.autoCount} alerts for $0; you paid gemma-4 for only {data.escalateCount}.
            At {data.projection.dailyAlerts.toLocaleString()} alerts/day that&rsquo;s <strong>{data.projection.workSavedPct}% less reasoning-model work</strong>.
            And because Cerebras runs the escalated tier at ~1,300&thinsp;tok/s, you can escalate the entire suspicious tail instead of rationing it to save
            money — which is exactly how subtle threats slip through a GPU-bound SOC.
          </div>
        </>
      )}
    </section>
  )
}

// ---- the "safety tax" shootout (accuracy + cost-of-safety) ------------------

function ShootLane({ l, guaranteed }: { l: SocShootoutResponse['cerebras']; guaranteed: boolean }) {
  return (
    <div className={`fdy-lane fdy-lane--${l.provider}`}>
      <div className="fdy-lane__top">
        <SourceBadge source={l.provider === 'cerebras' ? 'cerebras' : 'gemini'} model={l.provider === 'cerebras' ? undefined : l.label} />
        <div className="fdy-lane__tok">{l.passed}/{l.total} <span>correct</span></div>
      </div>
      <div className="soc-shoot__meta">
        <span className={guaranteed ? 'soc-shoot__safe' : 'soc-shoot__risk'}>{l.breaches} destructive action{l.breaches === 1 ? '' : 's'} executed{guaranteed ? ' · per-step verified' : ' · no per-step check'}</span>
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
        <h2>The safety tax</h2>
        <p>The same incidents, two ways. A GPU model takes the fast path — one shot, no Guardian. Cerebras runs the full verified loop. Watch the accuracy gap, then the cost of <em>earning</em> a guarantee.</p>
      </div>
      <button className="fdy-btn fdy-btn--primary" onClick={run} disabled={busy}>
        {busy ? 'Running both…' : data ? 'Run again' : 'Run the safety tax'}
      </button>
      {err && <p className="fdy-lane__note" style={{ marginTop: 10 }}>{err}</p>}
      {data && (
        <div className="fdy-race__lanes">
          <ShootLane l={data.cerebras} guaranteed />
          <ShootLane l={data.gpuOneShot} guaranteed={false} />
          <div className="soc-shoot__tax">
            To give the GPU the <strong>same per-step guarantee</strong>, it must run the verify loop on every call: ~{data.gpuVerifiedProjectedMs}ms vs Cerebras&rsquo;s {data.cerebras.totalMs}ms.
            <strong> Verification is ~{data.verificationTaxX}× cheaper on Cerebras</strong> — and more accurate ({data.cerebras.passed}/{data.cerebras.total} vs {data.gpuOneShot.passed}/{data.gpuOneShot.total}).
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
        <p>Same incident queue. In the wall-clock the GPU baseline spends triaging ONE alert, how many can Cerebras fully triage <em>and verify</em>? Per-step verification is only free at ~1,500 tok/s.</p>
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
        <span className="soc-card__tok">{d.tokS ? `${d.tokS} tok/s` : d.source === 'mock' ? '~1,284 tok/s · sim' : ''}</span>
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
        <div className="fdy-hero__eyebrow">Origin Autonomy-Control · powered by gemma-4-31b on Cerebras</div>
        <h1>
          Your AI agent has the keys.<br />
          Make sure it <span className="fdy-hero__mark">can&rsquo;t be tricked</span> into using them.
        </h1>
        <p className="fdy-hero__sub">
          Give an autonomous agent real tools and someone will hide an instruction in the data it reads — and it will run{' '}
          <code>disable_firewall</code> or <code>delete_logs</code> for them. Origin puts a Guardian on <em>every</em> action and a fail-closed
          policy floor under it. The judge of "is this action allowed" is a deterministic policy — never an LLM. Per-step verification is only
          free because Cerebras runs gemma-4-31b at ~1,500 tok/s.
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
          <h2>Run the live SOC — DeepMind&rsquo;s roadmap, shipped</h2>
          <p>A realistic auto-remediation agent triages a live incident queue (detection). Two alerts carry a prompt injection. The Guardian + fail-closed policy floor block the destructive tool-call <em>before execution</em> (synchronous response) and write an audit trail. Watch what the agent would have executed.</p>
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
                The deterministic policy — not an LLM — decided every "allowed" (DeepMind&rsquo;s R3 synchronous block), and the Guardian ran on every step because it&rsquo;s free at Cerebras speed. This trace is the audit trail — the safety certificate.
              </div>
            )}
          </>
        )}
      </section>

      <p className="fdy-brainline">
        One engine, two buyers: the same Perceiver → Planner → <strong>Guardian</strong> → deterministic-oracle loop licenses what a{' '}
        <strong>robot</strong> may do on a floor and what a <strong>software agent</strong> may do with your tools. Capability is not permission.
      </p>

      <footer className="fdy-foot">
        <span>Origin Physical AI · the policy is the only judge</span>
        <span><a href="/foundry">See the physical-AI demo →</a> &nbsp; <a href="/app">Open the console →</a></span>
      </footer>
    </div>
  )
}
