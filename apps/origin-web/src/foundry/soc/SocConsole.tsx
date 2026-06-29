// Origin Autonomy-Control — the AI-SOC hero. A software agent triages live security incidents;
// a Planner (gemma-4-31b, realistically configured to follow alert guidance) sometimes obeys a
// prompt injection hidden in the alert and proposes a DESTRUCTIVE tool-call; the Guardian
// (gemma-4-31b) + a fail-closed deterministic policy floor VETO it on every step; the policy is
// the only judge. The loop-race proves Cerebras clears the whole queue + catches the threats in
// the time a GPU model handles one alert.

import { useCallback, useEffect, useState } from 'react'
import '../ui/foundry.css'
import './soc.css'
import { socRun, socRace, leaderboard, socShootout, economics, ensemble, latency, accuracy } from './socClient'
import { SOC_ACTIONS, isDestructive } from './socEnv'
import type { SocRunResponse, SocRaceResponse, SocDecision, LeaderboardResponse, SocShootoutResponse, EconomicsResponse, EnsembleResponse, LatencyResponse, AccuracyResponse } from './socTypes'
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
              <span className="soc-board__name">{l.label}</span>
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
            <div className="fdy-race__verdict">Cerebras blocked the injection in {data.cerebras.totalMs}ms — the GPU took {data.gpu.totalMs}ms, {ratio}× slower. The defense reacts before the attack finishes typing.</div>
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

// ---- the "safety tax" shootout (accuracy + cost-of-safety) ------------------

function ShootLane({ l, guaranteed }: { l: SocShootoutResponse['cerebras']; guaranteed: boolean }) {
  return (
    <div className={`fdy-lane fdy-lane--${l.provider}`}>
      <div className="fdy-lane__top">
        <SourceBadge source={l.provider === 'cerebras' ? 'cerebras' : 'gemini'} model={l.provider === 'cerebras' ? undefined : l.label} />
        <div className="fdy-lane__tok">{l.passed}/{l.total} <span>correct</span></div>
      </div>
      <div className="soc-shoot__meta">
        <span className={guaranteed ? 'soc-shoot__safe' : 'soc-shoot__risk'}>{guaranteed ? '0 breaches · guaranteed' : `${l.breaches} breaches · no guarantee`}</span>
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
