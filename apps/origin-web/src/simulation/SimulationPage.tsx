// The /simulation surface — the physical "actor" of "one evidence spine, two actors":
// autonomous robots execute an oracle-VERIFIED plan on a warehouse floor, in 2D and 3D,
// collision-free and people-first, and the whole run drops a signed Sigil you re-verify on
// /verify. Clean-room (see docs/PRIOR_ART.md); Origin's own deterministic oracle is the judge.
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildWarehouseScene, simulate, type SimResult, type SimScene } from './warehouseSim'
import { Warehouse2DRenderer } from './render2d'
import { Warehouse3DRenderer } from './render3d'
import { signSigil, generateSigningKey, keyThumbprint } from '@origin/verifier-core/sigil'
import { canonical, sha256 } from '@origin/evidence/env-evidence'

const FPS = 7 // deliberate, readable cadence

const VERDICT_STYLE: Record<string, { label: string; cls: string }> = {
  finish: { label: 'FINISH', cls: 'sim-verdict--ok' },
  escalate: { label: 'ESCALATE', cls: 'sim-verdict--warn' },
  refuse: { label: 'REFUSE', cls: 'sim-verdict--bad' },
}

export function SimulationPage() {
  const [seed, setSeed] = useState(20260713)
  const [robots, setRobots] = useState(4)
  const [view, setView] = useState<'2d' | '3d'>('2d')
  const [playing, setPlaying] = useState(true)
  const [frameIdx, setFrameIdx] = useState(0)
  const [sigil, setSigil] = useState<{ thumb: string; obj: unknown } | null>(null)

  const { scene, result } = useMemo<{ scene: SimScene; result: SimResult }>(() => {
    const s = buildWarehouseScene({ seed, robots })
    return { scene: s, result: simulate(s) }
  }, [seed, robots])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const r2d = useRef<Warehouse2DRenderer | null>(null)
  const r3d = useRef<Warehouse3DRenderer | null>(null)
  const frame = useRef(0)
  const raf = useRef(0)
  const acc = useRef(0)
  const last = useRef(0)

  // (re)build the active renderer when the view or scene changes
  // (re)build the active renderer for the current view/scene. Playback state is reset by the
  // handlers that change the scene (below), not here, to avoid setState-in-effect churn.
  useEffect(() => {
    if (view === '2d' && canvasRef.current) {
      r2d.current = new Warehouse2DRenderer(canvasRef.current)
      r2d.current.render(scene, result, frame.current)
    }
    if (view === '3d' && containerRef.current) {
      r3d.current = new Warehouse3DRenderer(containerRef.current)
      r3d.current.build(scene)
      r3d.current.update(scene, result, frame.current)
    }
    return () => {
      if (r3d.current) { r3d.current.dispose(); r3d.current = null }
      r2d.current = null
    }
  }, [view, scene, result])

  // animation loop (drives both renderers from the same frame index)
  useEffect(() => {
    const step = (ts: number) => {
      raf.current = requestAnimationFrame(step)
      if (!last.current) last.current = ts
      const dt = ts - last.current
      last.current = ts
      let advanced = false
      if (playing) {
        acc.current += dt
        while (acc.current >= 1000 / FPS) {
          acc.current -= 1000 / FPS
          if (frame.current < result.frames.length - 1) { frame.current += 1; advanced = true }
          else setPlaying(false)
        }
      }
      if (view === '2d') r2d.current?.render(scene, result, frame.current)
      else r3d.current?.update(scene, result, frame.current)
      if (advanced) setFrameIdx(frame.current)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, view, scene, result])

  const resetPlayback = () => { frame.current = 0; acc.current = 0; setFrameIdx(0); setSigil(null); setPlaying(true) }
  const reset = () => { frame.current = 0; setFrameIdx(0); setPlaying(true) }
  const stepOnce = () => { setPlaying(false); frame.current = Math.min(frame.current + 1, result.frames.length - 1); setFrameIdx(frame.current) }
  const regenerate = () => { setSeed((s) => (s * 1664525 + 1013904223) >>> 0); resetPlayback() }
  const changeRobots = (n: number) => { setRobots(n); resetPlayback() }

  const signRun = async () => {
    const payload = { ...(result.digest_input as object), receipt_digest: sha256(canonical(result.digest_input)) }
    const kp = await generateSigningKey()
    const s = await signSigil(payload, kp, { issuer: 'origin-simulation', kind: 'warehouse-run' })
    setSigil({ thumb: await keyThumbprint(s.pubkey_jwk), obj: s })
  }
  const download = () => {
    if (!sigil) return
    const blob = new Blob([JSON.stringify(sigil.obj, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'warehouse-run.sigil.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const v = VERDICT_STYLE[result.verdict]

  return (
    <div className="sim-wrap">
      <div className="sim-controls">
        <div className="sim-viewtoggle" role="tablist" aria-label="View">
          <button className={view === '2d' ? 'is-on' : ''} onClick={() => setView('2d')}>2D floor</button>
          <button className={view === '3d' ? 'is-on' : ''} onClick={() => setView('3d')}>3D</button>
        </div>
        <div className="sim-btns">
          <button className="btn btn--primary btn--sm" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
          <button className="btn btn--ghost btn--sm" onClick={stepOnce}>Step</button>
          <button className="btn btn--ghost btn--sm" onClick={reset}>Restart</button>
          <button className="btn btn--ghost btn--sm" onClick={regenerate}>New layout</button>
          <label className="sim-range">Robots
            <input type="range" min={2} max={6} value={robots} onChange={(e) => changeRobots(Number(e.target.value))} />
            <b>{robots}</b>
          </label>
        </div>
      </div>

      <div className="sim-stage">
        {view === '2d'
          ? <canvas ref={canvasRef} className="sim-canvas" />
          : <div ref={containerRef} className="sim-canvas sim-canvas--3d" />}
        <div className="sim-progress"><span style={{ width: `${(frameIdx / Math.max(1, result.frames.length - 1)) * 100}%` }} /></div>
      </div>

      <div className="sim-panel">
        <div className={`sim-verdict ${v.cls}`}>
          <b>{v.label}</b>
          <span>{result.reason}</span>
        </div>
        <div className="sim-scores">
          <div><b>{result.score.orders_fulfilled}/{result.score.orders_total}</b><span>orders fulfilled</span></div>
          <div><b>{result.score.collisions}</b><span>collisions (invariant)</span></div>
          <div><b>{result.score.human_yields}</b><span>yields to human</span></div>
          <div><b>{result.score.robot_yields}</b><span>robot–robot yields</span></div>
          <div><b>{result.score.steps}</b><span>ticks · t={result.frames[frameIdx]?.t ?? 0}</span></div>
        </div>
        <div className="sim-robots">
          {result.per_robot.map((r, i) => (
            <span key={r.id} className={`sim-chip sim-chip--${r.oracle_label}`}>
              <i style={{ background: scene.robots[i]?.color }} /> {scene.robots[i]?.sku} · {r.oracle_label}
            </span>
          ))}
        </div>

        <div className="sim-evidence">
          {!sigil
            ? <button className="btn btn--primary btn--sm" onClick={signRun}>Sign this run → Sigil</button>
            : <>
                <button className="btn btn--ghost btn--sm" onClick={download}>Download the Sigil</button>
                <a className="btn btn--ghost btn--sm" href="/verify">Re-verify it on /verify →</a>
                <span className="sim-thumb">signed · key {sigil.thumb.slice(0, 10)}…</span>
              </>}
        </div>
        <p className="sim-note">
          The robots follow the <b>oracle-verified</b> plan (Origin’s deterministic <code>bfsOracle</code>,
          finish/escalate/refuse) and a deterministic coordinator keeps every executed step collision-free
          and people-first — so a whole run is <b>reproducible under this verifier</b> and drops a signed
          Sigil you can re-check offline. We claim <b>no learned-policy result</b>: this visualizes a
          verified plan executing, not a trained model. Synthetic layout; seeded + replayable.
        </p>
      </div>
    </div>
  )
}
