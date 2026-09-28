// The /operations surface — a VERIFIED fleet-operations console. Clean-room from the Worksite
// fleet-metrics concept (see docs/PRIOR_ART.md): utilization, peak-simultaneous, collision
// events "like a real ops dashboard" — but here they are a DETERMINISTIC, signed SLA. Run a
// multi-wave shift; the oracle scores every wave against synthetic targets. Signed
// evidence records those outcomes and re-verifies on /verify without granting operating authority.
// No learned/VLA result is claimed — the metrics are computed from the verified run.
import { useEffect, useMemo, useRef, useState } from 'react'
import { runShift, verifyOperations, DEFAULT_TARGETS } from './opsMetrics'
import { buildWarehouseScene, simulate } from './warehouseSim'
import { Warehouse2DRenderer } from './render2d'
import { signSigil, generateSigningKey, keyThumbprint } from '@origin/verifier-core/sigil'
import { canonical, sha256 } from '@origin/evidence/env-evidence'
import { usePlaybackVisibility } from '../shared/usePlaybackVisibility'

const FPS = 7

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}
const LEVEL_CLS: Record<string, string> = { L0: 'ops-bad', L1: 'ops-bad', L2: 'ops-warn', L3: 'ops-ok', L4: 'ops-ok' }
const VERDICT_DOT: Record<string, string> = { finish: '#0f9d6e', escalate: '#b97400', refuse: '#e5484d' }

export function OperationsPage() {
  const [robots, setRobots] = useState(4)
  const [waves, setWaves] = useState(6)
  const [seed, setSeed] = useState(777)
  const [selected, setSelected] = useState(0)
  const [sigil, setSigil] = useState<{ thumb: string; obj: unknown } | null>(null)

  const { shift, cred } = useMemo(() => {
    const s = runShift(seed, waves, robots)
    return { shift: s, cred: verifyOperations(s, DEFAULT_TARGETS) }
  }, [seed, waves, robots])

  // the selected wave, replayed for the live 2D view
  const wave = shift.waves[Math.min(selected, shift.waves.length - 1)]
  const { scene, result } = useMemo(() => {
    const sc = buildWarehouseScene({ seed: wave.seed, robots })
    return { scene: sc, result: simulate(sc) }
  }, [wave.seed, robots])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const visible = usePlaybackVisibility(canvasRef)
  const [playing, setPlaying] = useState(() => !prefersReducedMotion())
  const [playbackScene, setPlaybackScene] = useState(scene)
  if (playbackScene !== scene) {
    setPlaybackScene(scene)
    setPlaying(!prefersReducedMotion())
  }
  const r2d = useRef<Warehouse2DRenderer | null>(null)
  const frame = useRef(0)
  const raf = useRef(0)
  const acc = useRef(0)
  const lastTs = useRef(0)

  useEffect(() => {
    frame.current = prefersReducedMotion() ? result.frames.length - 1 : 0
    acc.current = 0
    lastTs.current = 0
    if (canvasRef.current) {
      r2d.current = new Warehouse2DRenderer(canvasRef.current)
      r2d.current.render(scene, result, frame.current)
    }
    return () => { r2d.current = null }
  }, [scene, result])

  useEffect(() => {
    if (!playing || !visible) return
    lastTs.current = 0
    const step = (ts: number) => {
      if (!lastTs.current) lastTs.current = ts
      acc.current += ts - lastTs.current
      lastTs.current = ts
      while (acc.current >= 1000 / FPS) {
        acc.current -= 1000 / FPS
        frame.current = Math.min(frame.current + 1, result.frames.length - 1)
      }
      r2d.current?.render(scene, result, frame.current)
      if (frame.current < result.frames.length - 1) raf.current = requestAnimationFrame(step)
      else setPlaying(false)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [scene, result, playing, visible])

  const togglePlayback = () => {
    if (frame.current >= result.frames.length - 1) {
      frame.current = 0
      acc.current = 0
      r2d.current?.render(scene, result, 0)
    }
    setPlaying(value => !value)
  }

  const runNewShift = () => { setSeed((s) => (s * 1664525 + 1013904223) >>> 0); setSelected(0); setSigil(null) }
  const changeRobots = (n: number) => { setRobots(n); setSelected(0); setSigil(null) }
  const changeWaves = (n: number) => { setWaves(n); setSelected(0); setSigil(null) }

  const signShift = async () => {
    const payload = { ...(cred.digest_input as object), receipt_digest: sha256(canonical(cred.digest_input)) }
    const kp = await generateSigningKey()
    const s = await signSigil(payload, kp, { issuer: 'origin-operations', kind: 'fleet-operations-sla' })
    setSigil({ thumb: await keyThumbprint(s.pubkey_jwk), obj: s })
  }
  const download = () => {
    if (!sigil) return
    const blob = new Blob([JSON.stringify(sigil.obj, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fleet-operations.sigil.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const t = shift.totals
  const cls = LEVEL_CLS[cred.rsl_level]

  return (
    <div className="ops-wrap">
      <div className="ops-controls">
        <button className="btn btn--primary btn--sm" onClick={runNewShift}>Run a new shift</button>
        <label className="ops-range">Fleet<input type="range" min={2} max={6} value={robots} onChange={(e) => changeRobots(Number(e.target.value))} /><b>{robots}</b></label>
        <label className="ops-range">Waves<input type="range" min={3} max={8} value={waves} onChange={(e) => changeWaves(Number(e.target.value))} /><b>{waves}</b></label>
        <span className="ops-targets">Targets · util ≥ {Math.round(DEFAULT_TARGETS.min_utilization * 100)}% · fulfilment ≥ {Math.round(DEFAULT_TARGETS.min_fulfilment * 100)}% · collisions = 0</span>
      </div>

      {/* The SLA verdict */}
      <div className={`ops-verdict ${cls}`}>
        <div>
          <p className="ops-verdict__title"><b>{cred.passed ? 'Synthetic shift targets met' : 'Synthetic shift targets not met'}</b></p>
          <p>Tier {cred.rsl_level} on this seeded simulated shift only; no deployment permission.</p>
        </div>
        <p>{t.orders_fulfilled}/{t.orders_total} orders fulfilled · {Math.round(t.avg_utilization * 100)}% utilization · {t.collision_events} collision events.</p>
      </div>

      {/* Metric tiles */}
      <div className="ops-tiles">
        <div><b>{Math.round(t.avg_utilization * 100)}%</b><span>fleet utilization</span></div>
        <div><b>{t.peak_simultaneous}</b><span>peak simultaneous</span></div>
        <div className={t.collision_events === 0 ? 'ops-tile-ok' : 'ops-tile-bad'}><b>{t.collision_events}</b><span>collision events</span></div>
        <div><b>{t.orders_fulfilled}/{t.orders_total}</b><span>orders ({Math.round(t.fulfilment_rate * 100)}%)</span></div>
        <div><b>{t.throughput_per_100_ticks.toFixed(1)}</b><span>orders / 100 ticks</span></div>
        <div><b>{t.waves}</b><span>waves this shift</span></div>
      </div>

      {/* Per-wave timeline + a live view of the selected wave */}
      <div className="ops-grid">
        <div className="ops-timeline">
          <p className="ops-h">Shift timeline — click a wave to watch it</p>
          {shift.waves.map((w, i) => (
            <button key={w.wave} className={`ops-wave${i === selected ? ' is-sel' : ''}`} onClick={() => setSelected(i)}>
              <span className="ops-wave__dot" style={{ background: VERDICT_DOT[w.verdict] }} />
              <span className="ops-wave__label">Wave {w.wave}</span>
              <span className="ops-wave__bar"><i style={{ width: `${Math.round(w.metrics.fleet_utilization * 100)}%`, background: VERDICT_DOT[w.verdict] }} /></span>
              <span className="ops-wave__meta">{w.metrics.orders_fulfilled}/{w.metrics.orders_total} · {Math.round(w.metrics.fleet_utilization * 100)}% · {w.verdict}</span>
            </button>
          ))}
        </div>
        <div className="ops-stage">
          <button className="btn btn--ghost btn--sm" onClick={togglePlayback}>
            {playing ? 'Pause playback' : 'Play'}
          </button>
          <canvas ref={canvasRef} className="ops-canvas" />
          <p className="ops-caption">Wave {wave.wave} · {wave.verdict} · {Math.round(wave.metrics.fleet_utilization * 100)}% utilization · 0 collisions</p>
        </div>
      </div>

      {/* Evidence */}
      <div className="ops-evidence">
        {!sigil
          ? <button className="btn btn--primary btn--sm" onClick={signShift}>Sign synthetic shift evidence</button>
          : <>
              <button className="btn btn--ghost btn--sm" onClick={download}>Download signed shift evidence</button>
              <a className="btn btn--ghost btn--sm" href="/verify">Re-verify it on /verify →</a>
              <span className="ops-thumb">signed · synthetic tier {cred.rsl_level} · key {sigil.thumb.slice(0, 10)}…</span>
            </>}
      </div>
      <p className="ops-note">
        Every metric is computed <b>deterministically</b> from this synthetic shift. The fixed
        verifier compares utilization, fulfilment, collisions and refused waves with the displayed
        targets. Signing records these outcomes; it grants no operating authority. This is
        <b> reproducible under this verifier</b>, never "safe". We claim <b>no learned-coordinator
        result</b>; the metrics score a verified plan, not a trained model. Synthetic layouts;
        seeded and replayable.
      </p>
    </div>
  )
}
