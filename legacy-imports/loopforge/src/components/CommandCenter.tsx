import {
  Activity,
  BadgeCheck,
  Database,
  Film,
  RadioTower,
  ShieldCheck,
  TriangleAlert,
  Zap,
} from 'lucide-react'
import { track } from '../lib/analytics'
import { formatNumber } from '../lib/latency'
import type { LoopForgeRun } from '../lib/schemas'

type CommandCenterProps = {
  run: LoopForgeRun
  isBusy: boolean
  error: string | null
  onRunRecorded: () => void
  onRunLive: () => void
}

export function CommandCenter({
  run,
  isBusy,
  error,
  onRunRecorded,
  onRunLive,
}: CommandCenterProps) {
  const passCount = run.gates.filter((gate) => gate.status === 'pass').length
  const failCount = run.gates.filter((gate) => gate.status === 'fail').length
  const tps = run.latency.cerebras.tokensPerSecond
  const speedup = run.latency.speedup

  return (
    <>
      <section className="command-center film" aria-labelledby="command-center-title">
        <div className="command-copy">
          <div className="eyebrow">
            <RadioTower size={15} aria-hidden="true" />
            LoopForge — Enterprise Agent Repair OS
          </div>
          <h1 id="command-center-title">Repair broken production AI agents in ~1.4 seconds.</h1>
          <p className="thesis">
            When a support agent silently breaks in production, LoopForge diagnoses the root cause,
            rewrites the workflow, and proves the fix is safe behind 10 deterministic gates — so
            customers get resolved on first contact, not escalated.{' '}
            <span className="thesis-credit">Powered by Gemma 4 on Cerebras.</span>
          </p>
          <div className="run-actions" aria-label="Run controls">
            <button
              className="live-action"
              type="button"
              onClick={() => {
                track('run_live')
                onRunLive()
              }}
              disabled={isBusy}
            >
              <Zap size={18} aria-hidden="true" />
              {isBusy ? 'Running on Cerebras…' : 'Run live'}
            </button>
            <button
              className="secondary-action"
              type="button"
              onClick={() => {
                track('replay_demo')
                onRunRecorded()
              }}
              disabled={isBusy}
            >
              <Database size={18} aria-hidden="true" />
              Replay demo
            </button>
          </div>
          {error ? (
            <div className="safe-message" role="status">
              <TriangleAlert size={18} aria-hidden="true" />
              {error}
            </div>
          ) : null}
          <p className="hero-audience">For support, trust &amp; safety, and AI-platform teams.</p>
        </div>

        <figure className="hero-film">
          <video
            src="/bounced.mp4"
            poster="/bounced-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
          <figcaption>
            <Film size={13} aria-hidden="true" />
            Production support at machine scale — one broken workflow bounces thousands before anyone
            notices.
          </figcaption>
        </figure>
      </section>

      <section className="ops-band" aria-label="Live run summary">
        <div className="ops-speed-band">
          <span>
            <Zap size={13} aria-hidden="true" />
            Cerebras · Gemma 4 31B
          </span>
          <strong>
            {formatNumber(tps)}
            <em>tok/s</em>
          </strong>
          <p>{speedup}× faster than a GPU — the full repair loop in ~1.4s</p>
          <p className="ops-roi">
            Illustrative ROI: ≈18.4 support hours saved / 1,000 contacts · 21-pt fewer repeat contacts
          </p>
        </div>
        <div className="ops-metrics">
          <div>
            <Activity size={16} aria-hidden="true" />
            <span>Cluster</span>
            <strong>{run.cluster.volume}</strong>
          </div>
          <div>
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Risk</span>
            <strong>{run.cluster.riskTier}</strong>
          </div>
          <div>
            <BadgeCheck size={16} aria-hidden="true" />
            <span>Gates</span>
            <strong>
              {passCount}/{run.gates.length}
            </strong>
          </div>
          <div className={failCount > 0 ? 'stat-danger' : ''}>
            <TriangleAlert size={16} aria-hidden="true" />
            <span>Fails</span>
            <strong>{failCount}</strong>
          </div>
        </div>
      </section>
    </>
  )
}
