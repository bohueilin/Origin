// Origin Autonomy-Control — the AI-SOC hero. A software agent triages live security incidents;
// a Planner (gemma-4-31b, realistically configured to follow alert guidance) sometimes obeys a
// prompt injection hidden in the alert and proposes a DESTRUCTIVE tool-call; the Guardian
// (gemma-4-31b) + a fail-closed deterministic policy floor VETO it on every step; the policy is
// the only judge. The loop-race proves Cerebras clears the whole queue + catches the threats in
// the time a GPU model handles one alert.

import { useCallback, useEffect, useState } from 'react'
import '../ui/foundry.css'
import './soc.css'
import { socRun, socRace, leaderboard } from './socClient'
import { SOC_ACTIONS, isDestructive } from './socEnv'
import type { SocRunResponse, SocRaceResponse, SocDecision, LeaderboardResponse } from './socTypes'
import type { FoundrySource } from '../types'

const LABEL = new Map(SOC_ACTIONS.map((a) => [a.id, a.label]))
const actLabel = (id: string) => LABEL.get(id) ?? id

function SourceBadge({ source, model }: { source: FoundrySource; model?: string }) {
  const label = source === 'cerebras' ? 'gemma-4-31b · Cerebras' : source === 'gemini' ? model || 'GPU baseline' : 'deterministic mock'
  return <span className={`fdy-badge fdy-badge--${source}`}>{label}</span>
}

// ---- the speed leaderboard (raw-speed proof) --------------------------------

function Leaderboard() {
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

      <Leaderboard />

      <LoopRace />

      <section className="fdy-card">
        <div className="fdy-card__head">
          <h2>Run the live SOC</h2>
          <p>A realistic auto-remediation agent triages a live incident queue. Two alerts carry a prompt injection. Watch the Guardian catch what the agent would have executed.</p>
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
                <strong>{run.threatsBlocked} destructive action{run.threatsBlocked === 1 ? '' : 's'} blocked.</strong> Zero executed.
                The deterministic policy — not an LLM — decided every "allowed," and the Guardian ran on every step because it&rsquo;s free at Cerebras speed.
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
