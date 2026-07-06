import { useEffect, useRef, useState } from 'react'
import {
  FlaskConical,
  GitBranch,
  Radar,
  Rocket,
  ShieldCheck,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react'
import { formatMs } from '../lib/latency'
import type { LatencyRace } from '../lib/schemas'

type Stage = { task: string | null; name: string; sub: string; Icon: LucideIcon }

// The six-stage loop, in order. Each model stage maps to a real Cerebras call so the
// animation plays out in true loop-time; Verify is the deterministic gate pass.
const STAGES: Stage[] = [
  { task: 'cluster', name: 'Detect', sub: 'cluster the failures', Icon: Radar },
  { task: 'diagnose', name: 'Diagnose', sub: 'find the root cause', Icon: Stethoscope },
  { task: 'patch', name: 'Patch', sub: 'rewrite the workflow', Icon: GitBranch },
  { task: 'simulate', name: 'Simulate', sub: 'adversarial probes', Icon: FlaskConical },
  { task: null, name: 'Verify', sub: 'deterministic gates', Icon: ShieldCheck },
  { task: 'evidence', name: 'Ship', sub: 'evidence pack', Icon: Rocket },
]

const VERIFY_MS = 120

export function LoopStepper({ latency }: { latency: LatencyRace }) {
  const byTask = new Map(latency.cerebrasCalls.map((c) => [c.task, c.totalMs]))
  const stageMs = (s: Stage) => (s.task ? (byTask.get(s.task) ?? 200) : VERIFY_MS)

  // active = index of the currently-lighting stage; STAGES.length = the whole loop closed.
  const [active, setActive] = useState(-1)
  const ref = useRef<HTMLElement>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setActive(STAGES.length)
      return
    }

    let timers: ReturnType<typeof setTimeout>[] = []
    let cancelled = false

    const play = () => {
      timers.forEach(clearTimeout)
      timers = []
      setActive(-1)
      let acc = 60
      STAGES.forEach((s, i) => {
        timers.push(setTimeout(() => !cancelled && setActive(i), acc))
        acc += stageMs(s)
      })
      timers.push(setTimeout(() => !cancelled && setActive(STAGES.length), acc))
      timers.push(setTimeout(play, acc + 2600))
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !startedRef.current) {
            startedRef.current = true
            play()
          }
        })
      },
      { threshold: 0.35 },
    )
    io.observe(el)

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
      io.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closed = active >= STAGES.length

  return (
    <section className="loop-stepper" ref={ref} aria-label="The repair loop, in real time">
      <div className="loop-stepper-head">
        <p className="section-kicker">The repair loop</p>
        <h2>Detect → Diagnose → Patch → Simulate → Verify → Ship</h2>
        <p className="loop-stepper-sub">
          The ten panels below are one ordered loop. It runs end-to-end on Cerebras in{' '}
          <strong>{formatMs(latency.cerebras.totalMs)}</strong> — watch it close in real time.
        </p>
      </div>

      <ol className={closed ? 'loop-steps closed' : 'loop-steps'}>
        {STAGES.map((s, i) => {
          const state = closed || i < active ? 'done' : i === active ? 'active' : 'pending'
          const ms = s.task ? byTask.get(s.task) : null
          return (
            <li key={s.name} className={`loop-step ${state}`}>
              <span className="loop-step-n">{String(i + 1).padStart(2, '0')}</span>
              <s.Icon size={19} aria-hidden="true" />
              <strong>{s.name}</strong>
              <span className="loop-step-sub">{s.sub}</span>
              <em>{ms != null ? formatMs(ms) : 'deterministic'}</em>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
