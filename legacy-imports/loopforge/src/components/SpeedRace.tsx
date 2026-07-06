import { useEffect, useState, type CSSProperties } from 'react'
import { CircleCheck, Gauge, TimerReset, Zap } from 'lucide-react'
import { formatMs, formatNumber } from '../lib/latency'
import type { LatencyRace, ProviderLatency } from '../lib/schemas'

type SpeedRaceProps = {
  latency: LatencyRace
}

// Wall-clock seconds for the slowest lane to fill. Both lanes fill at the SAME rate,
// so the faster provider reaches its (shorter) bar length first and stops — the
// visceral "Cerebras finished while the GPU is still going" beat.
const RACE_SECONDS = 3.4

function laneSubtitle(latency: ProviderLatency, featured: boolean) {
  if (featured) {
    return 'Cerebras · gemma-4-31b'
  }
  if (latency.mode === 'simulation') {
    return 'GPU baseline · projected'
  }
  if (latency.mode === 'recorded') {
    return 'GPU · 120B · measured rate, projected time'
  }
  if (latency.mode === 'live') {
    return 'GPU · 120B · live, projected to loop'
  }
  return `GPU baseline · ${latency.mode}`
}

// Compare generation work (completion time) so the bars reflect throughput and stay
// consistent with the tok/s headline, rather than per-call network/prompt overhead.
function raceMetric(latency: ProviderLatency) {
  return latency.completionMs ?? latency.totalMs
}

function RaceLane({
  latency,
  maxMs,
  featured,
}: {
  latency: ProviderLatency
  maxMs: number
  featured?: boolean
}) {
  const targetPct = Math.max(6, Math.min(100, (raceMetric(latency) / maxMs) * 100))
  const durationS = Math.max(0.28, (targetPct / 100) * RACE_SECONDS)
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setStarted(true))
    const timer = setTimeout(() => setDone(true), durationS * 1000 + 60)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [durationS])

  const fillStyle = {
    width: started ? `${targetPct}%` : '0%',
    transitionDuration: `${durationS}s`,
  } as CSSProperties

  return (
    <div className={featured ? 'race-lane featured' : 'race-lane'}>
      <div className="race-label">
        <strong>{latency.label}</strong>
        <span>{laneSubtitle(latency, Boolean(featured))}</span>
      </div>
      <div className="race-track">
        <span className="race-fill" style={fillStyle} />
        {done ? (
          <em className={featured ? 'race-done first' : 'race-done'}>
            <CircleCheck size={13} aria-hidden="true" />
            {featured ? 'finished first' : 'done'}
          </em>
        ) : null}
      </div>
      <div className="race-metrics">
        <span>{formatNumber(latency.tokensPerSecond)}</span>
        <span>tok/s · {formatMs(latency.totalMs)}</span>
      </div>
    </div>
  )
}

export function SpeedRace({ latency }: SpeedRaceProps) {
  const maxMs = Math.max(raceMetric(latency.cerebras), raceMetric(latency.baseline))

  return (
    <section className="panel speed-panel" aria-labelledby="speed-title">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Speed Race</p>
          <h2 id="speed-title">Cerebras vs GPU baseline</h2>
        </div>
        <div className="speed-badge">
          <Zap size={18} aria-hidden="true" />
          {latency.speedup}x faster
        </div>
      </div>

      <div className="speed-headline" aria-label="Throughput comparison">
        <div className="speed-headline-stat featured">
          <strong>{formatNumber(latency.cerebras.tokensPerSecond)}</strong>
          <span>Cerebras tok/s</span>
        </div>
        <div className="speed-headline-x">{latency.speedup}×</div>
        <div className="speed-headline-stat">
          <strong>{formatNumber(latency.baseline.tokensPerSecond)}</strong>
          <span>GPU tok/s</span>
        </div>
        <p className="speed-caption">
          Same generated-token budget: Cerebras finishes the full repair loop in{' '}
          {formatMs(latency.cerebras.totalMs)} versus {formatMs(latency.baseline.totalMs)} on the GPU
          baseline.
        </p>
        <p className="speed-basis">
          {latency.speedup}× vs the GPU open-model field (gpt-oss-120b): Cerebras measured tok/s
          end-to-end; GPU loop time projected from its measured rate.
        </p>
      </div>

      <div className="race-stack">
        <RaceLane latency={latency.cerebras} maxMs={maxMs} featured />
        <RaceLane latency={latency.baseline} maxMs={maxMs} />
      </div>

      <div className="gpu-field" aria-label="GPU baseline field">
        <span className="gpu-field-label">GPU field</span>
        <span>OpenAI gpt-oss-120b · {latency.speedup}×</span>
        <span>DeepSeek-V4 · ~65×</span>
        <span>same task, GPU inference</span>
      </div>

      <p className="speed-footnote">{latency.baseline.note}</p>

      <div className="time-grid" aria-label="Cerebras time info">
        <div>
          <TimerReset size={18} aria-hidden="true" />
          <span>Total</span>
          <strong>{formatMs(latency.cerebras.totalMs)}</strong>
        </div>
        <div>
          <TimerReset size={18} aria-hidden="true" />
          <span>Queue</span>
          <strong>{formatMs(latency.cerebras.queueMs)}</strong>
        </div>
        <div>
          <Gauge size={18} aria-hidden="true" />
          <span>Completion</span>
          <strong>{formatMs(latency.cerebras.completionMs)}</strong>
        </div>
        <div>
          <Gauge size={18} aria-hidden="true" />
          <span>Prompt tokens</span>
          <strong>{formatNumber(latency.cerebras.promptTokens)}</strong>
        </div>
        <div>
          <Gauge size={18} aria-hidden="true" />
          <span>Completion tokens</span>
          <strong>{formatNumber(latency.cerebras.completionTokens)}</strong>
        </div>
        <div>
          <Zap size={18} aria-hidden="true" />
          <span>Output tok/s</span>
          <strong>{formatNumber(latency.cerebras.tokensPerSecond)}</strong>
        </div>
      </div>

      <div className="call-trace" aria-label="Cerebras call trace">
        {latency.cerebrasCalls.map((call) => (
          <div key={call.task}>
            <span>{call.label}</span>
            <strong>{formatMs(call.totalMs)}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}
