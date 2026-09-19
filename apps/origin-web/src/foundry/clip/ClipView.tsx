// A recordable replay of a synthetic latency comparison. Only the explicit Run
// control requests the backend; replaying cached measurements makes no new calls.
import { useEffect, useState } from 'react'
import './clip.css'
import { latency } from '../soc/socClient'
import type { LatencyResponse } from '../soc/socTypes'

type Phase = 'idle' | 'typing' | 'response' | 'baseline' | 'verdict'
const milliseconds = (value: number | null | undefined) =>
  value != null && Number.isFinite(value) && value >= 0 ? `${Math.round(value)} ms` : 'unavailable'

export default function ClipView() {
  const [data, setData] = useState<LatencyResponse | null>(null)
  const [typed, setTyped] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [gpuFill, setGpuFill] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState(false)

  const runComparison = async () => {
    if (busy) return
    setBusy(true)
    setErr(null)
    setData(null)
    setPlaying(false)
    setPhase('idle')
    setTyped(0)
    setGpuFill(0)
    try {
      const result = await latency()
      setData(result)
      setPlaying(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The latency comparison could not be loaded.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!data || !playing) return
    let cancelled = false
    const timers = new Set<number>()
    const at = (ms: number, fn: () => void) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer)
        if (!cancelled) fn()
      }, ms)
      timers.add(timer)
    }
    const run = () => {
      if (cancelled) return
      setTyped(0)
      setGpuFill(0)
      setPhase('typing')
      const text = data.attackText
      const typeDone = text.length * 34
      for (let i = 1; i <= text.length; i += 1) at(i * 34, () => setTyped(i))
      // This is a re-timed replay. The displayed values preserve the response's
      // actual provenance; the animation is never itself a latency measurement.
      const responseAt = Math.max(1, Math.round(data.cerebras.totalMs ?? 200))
      at(responseAt, () => setPhase('response'))
      for (let step = 1; step <= 30; step += 1) at((typeDone * step) / 30, () => setGpuFill(Math.round((step / 30) * 100)))
      const finishAt = Math.max(typeDone + 250, responseAt + 250)
      at(finishAt, () => setPhase('baseline'))
      at(finishAt + 650, () => setPhase('verdict'))
      at(finishAt + 5000, run)
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      at(0, () => { setTyped(data.attackText.length); setGpuFill(100); setPhase('verdict') })
    } else at(0, run)
    return () => { cancelled = true; timers.forEach((timer) => clearTimeout(timer)) }
  }, [data, playing])

  const bothMeasured = !!data?.cerebras.ok && !!data?.gpu.ok
  const ratio = bothMeasured && data?.cerebras.totalMs && data.gpu.totalMs
    && data.cerebras.totalMs > 0 && data.gpu.totalMs > 0
    ? Math.round((data.gpu.totalMs / data.cerebras.totalMs) * 10) / 10 : null
  const responseShown = phase === 'response' || phase === 'baseline' || phase === 'verdict'
  const baselineShown = phase === 'baseline' || phase === 'verdict'

  return (
    <div className="clip">
      <nav className="clip__nav" aria-label="Clip navigation">
        <a className="clip__brand" href="/">Origin</a>
        <a className="clip__back" href="/labs">← Back to Labs</a>
      </nav>
      <header className="clip__intro">
        <p className="clip__eyebrow">The latency lab · synthetic attack fixture</p>
        <h1>A response, measured. A claim, bounded.</h1>
        <p className="clip__lede">Compare model response times on one fixed prompt-injection example. Inspect the numbers, then replay the sequence for a recording.</p>
      </header>
      <div className="clip__consent">
        <p id="clip-request-disclosure"><b>Before you run:</b> this sends the built-in synthetic fixture to the backend, which may contact configured external model providers. Provider usage may incur costs. No user files are submitted. Playback reuses the returned data.</p>
        <div className="clip__controls">
          <button className="clip__button" onClick={() => void runComparison()} disabled={busy} aria-busy={busy} aria-describedby="clip-request-disclosure">{busy ? 'Running comparison…' : 'Run latency comparison'}</button>
          {data && <button className="clip__button clip__button--secondary" onClick={() => setPlaying((value) => !value)}>{playing ? 'Pause playback' : 'Replay comparison'}</button>}
        </div>
      </div>
      <div className="clip__stage">
        <div className="clip__attack">
          <span className="clip__attack-tag">Synthetic incoming message</span>
          <div className="clip__attack-text">
            {data ? data.attackText.slice(0, typed) : busy ? 'Waiting for the comparison…' : 'The fixed attack fixture appears here after you run the comparison.'}
            {data && playing && phase === 'typing' && <span className="clip__caret" aria-hidden="true" />}
          </div>
        </div>
        <div className={`clip__lane clip__lane--cb${responseShown ? ' is-on' : ''}`}>
          <div className="clip__lane-label">
            <span className="clip__badge">Cerebras · Gemma response</span>
            <span className="clip__provenance">{data ? data.cerebras.ok ? 'Measured response in this run' : 'Illustrative fixture values — not measured' : 'No measurement requested'}</span>
          </div>
          <span className="clip__lane-val">
            {data && responseShown ? <>{data.cerebras.verdict.toUpperCase()} · {milliseconds(data.cerebras.totalMs)}<small>Time to first token: {milliseconds(data.cerebras.ttftMs)}</small></> : busy ? 'Request in progress' : data ? 'Replay in progress' : '—'}
          </span>
        </div>
        <div className={`clip__lane clip__lane--gpu${baselineShown ? ' is-on' : ''}`}>
          <div className="clip__lane-label">
            <span className="clip__badge">{data?.gpu.label ?? 'GPU baseline'}</span>
            <span className="clip__provenance">{data ? data.gpu.ok ? 'Measured response in this run' : 'Illustrative fixture values — not measured' : 'No measurement requested'}</span>
          </div>
          <span className="clip__lane-val">{data && baselineShown ? milliseconds(data.gpu.totalMs) : busy ? 'Request in progress' : data ? 'Replay in progress' : '—'}</span>
          <div className="clip__bar" aria-hidden="true"><div className="clip__bar-fill" style={{ width: `${gpuFill}%` }} /></div>
        </div>
      </div>
      {err ? (
        <div className="clip__error" role="alert">
          <p>The comparison could not be loaded. No timing or outcome claim is shown. You can try the request again.</p>
          <details><summary>Request details</summary>{err}</details>
        </div>
      ) : data ? (
        <div className={`clip__verdict${phase === 'verdict' ? ' is-on' : ''}`}>
          <h2>The model returned <b>{data.cerebras.verdict.toUpperCase()}</b> for this fixture.</h2>
          <p>{data.cerebras.reason}</p>
          <p>{ratio != null ? <>Baseline / Cerebras latency: <b>{ratio}×</b> for this single fixture run. This is not a general performance benchmark.</> : 'At least one lane is illustrative or lacks timing data. No measured comparative claim is made.'}</p>
          <p>This compares model responses. It does not execute the proposed action, prove a prevention outcome, or establish deployment authority.</p>
        </div>
      ) : null}
      <p className="clip__live" role="status">
        {err ? 'Comparison unavailable.' : busy ? 'Requesting the comparison.' : !data ? 'Ready when you are. No comparison runs automatically.' : bothMeasured ? 'Measured this run · re-timed replay · synthetic fixture' : 'Illustrative or mixed-source comparison · provenance shown for each lane · re-timed replay'}
      </p>
      <p className="clip__footer">Inspect deterministic evidence mechanisms in the <a href="/security">verification workbench</a>.</p>
    </div>
  )
}
