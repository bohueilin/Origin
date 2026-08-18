// A self-contained, auto-playing, looping "clip" of the latency race — built to be screen-recorded
// as the Track-2 (People's Choice) asset. Big, dark, captioned, honest (real measured ms from the API).
// Open /clip, hit record, let it loop once or twice. No interaction needed.

import { useEffect, useState } from 'react'
import './clip.css'
import { latency } from '../soc/socClient'
import type { LatencyResponse } from '../soc/socTypes'

type Phase = 'idle' | 'typing' | 'blocked' | 'gpu' | 'verdict'

export default function ClipView() {
  const [data, setData] = useState<LatencyResponse | null>(null)
  const [typed, setTyped] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [gpuFill, setGpuFill] = useState(0)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const tos: number[] = []
    const at = (ms: number, fn: () => void) => {
      tos.push(window.setTimeout(() => { if (!cancelled) fn() }, ms))
    }
    let d: LatencyResponse | null = null
    const runStatic = async () => {
      if (cancelled) return
      if (!d) {
        try {
          d = await latency()
        } catch (e) {
          if (!cancelled) setErr(e instanceof Error ? e.message : 'Latency data failed to load.')
          return
        }
        if (cancelled) return
        setData(d)
      }
      setTyped(d.attackText.length)
      setGpuFill(100)
      setPhase('verdict')
    }
    const run = async () => {
      if (cancelled) return
      setTyped(0)
      setGpuFill(0)
      setPhase('typing')
      if (!d) {
        try {
          d = await latency()
        } catch (e) {
          if (!cancelled) setErr(e instanceof Error ? e.message : 'Latency data failed to load.')
          return
        }
        if (cancelled) return
        setData(d)
      }
      const text = d.attackText
      const charMs = 34
      for (let i = 1; i <= text.length; i += 1) at(i * charMs, () => setTyped(i))
      // Drive the block from the MEASURED value, not from a character count. The
      // previous `6 * charMs` fired at a fixed 204ms whatever d.cerebras.totalMs
      // returned, which made the headline timing claim an artifact of the animation.
      at(Math.max(1, Math.round(d.cerebras?.totalMs ?? 6 * charMs)), () => setPhase('blocked'))
      const typeDone = text.length * charMs
      for (let s = 1; s <= 30; s += 1) at((typeDone * s) / 30, () => setGpuFill(Math.round((s / 30) * 100)))
      at(typeDone + 250, () => setPhase('gpu'))
      at(typeDone + 900, () => setPhase('verdict'))
      at(typeDone + 5200, () => { void run() }) // loop
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) void runStatic()
    else void run()
    return () => { cancelled = true; tos.forEach((t) => clearTimeout(t)) }
  }, [])

  const ratio = data && data.cerebras.totalMs && data.gpu.totalMs ? Math.round((data.gpu.totalMs / data.cerebras.totalMs) * 10) / 10 : null

  return (
    <div className="clip">
      <div className="clip__brand">ORIGIN · powered by <b>gemma-4-31b</b> on <b>Cerebras</b></div>

      <div className="clip__stage">
        <div className="clip__attack">
          <span className="clip__attack-tag">incoming prompt injection</span>
          <div className="clip__attack-text">
            {err ? '—' : data ? data.attackText.slice(0, typed) : 'loading…'}
            {!err && <span className="clip__caret" />}
          </div>
        </div>

        <div className={`clip__lane clip__lane--cb${phase === 'blocked' || phase === 'gpu' || phase === 'verdict' ? ' is-on' : ''}`}>
          <span className="clip__badge clip__badge--cb">🛑 Cerebras Guardian</span>
          <span className="clip__lane-val">
            {err
              ? '—'
              : phase === 'blocked' || phase === 'gpu' || phase === 'verdict'
                ? `BLOCKED in ${data?.cerebras.totalMs}ms · TTFT ${data?.cerebras.ttftMs}ms`
                : '…'}
          </span>
        </div>

        <div className={`clip__lane clip__lane--gpu${phase === 'gpu' || phase === 'verdict' ? ' is-on' : ''}`}>
          <span className="clip__badge clip__badge--gpu">⏳ {data?.gpu.label ?? 'GPU model'}</span>
          <div className="clip__bar"><div className="clip__bar-fill" style={{ width: `${gpuFill}%` }} /></div>
          <span className="clip__lane-val">{err ? '—' : phase === 'gpu' || phase === 'verdict' ? `responded at ${data?.gpu.totalMs}ms` : 'still thinking…'}</span>
        </div>
      </div>

      {err
        ? <div className="clip__error" role="alert">
            Illustrative preview unavailable — the latency comparison could not be loaded. No timing claim is shown.
          </div>
        : <div className={`clip__verdict${phase === 'verdict' ? ' is-on' : ''}`}>
            The defense reacted <b>before the attack finished typing.</b>
            {ratio && <> {ratio}× faster than a GPU model.</>} Per-step verification is free — only on Cerebras.
          </div>}

      <div className="clip__live">
        {err
          ? '● unavailable · the latency backend is not reachable from this page'
          : data?.cerebras?.ok
            // The inference completes before the typewriter starts, so the sequence a
            // viewer watches is a replay of a real measurement, not a live race. The
            // numbers are real; the playback is re-timed. Say both.
            ? '● replay · timings measured this run, playback re-timed'
            : '● illustrative · no live key on this server'}
      </div>
    </div>
  )
}
