import type { CSSProperties } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  RotateCw,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import { formatMs } from '../lib/latency'
import type { RepairLoop as RepairLoopType } from '../lib/schemas'

type RepairLoopProps = {
  repair?: RepairLoopType
}

export function RepairLoop({ repair }: RepairLoopProps) {
  if (!repair || repair.attempts.length < 2) {
    return null
  }

  const initial = repair.attempts[0]
  const final = repair.attempts[repair.attempts.length - 1]
  const totalGates = final.gates.length

  // The gates the Guardian caught on the first pass, shown flipping to their repaired state.
  const caught = initial.gates
    .filter((gate) => gate.status === 'fail')
    .map((gate) => ({
      id: gate.id,
      name: gate.name,
      severity: gate.severity,
      after: final.gates.find((candidate) => candidate.id === gate.id)?.status ?? 'fail',
    }))

  return (
    <section className="panel repair-panel" aria-labelledby="repair-title">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Repair Loop</p>
          <h2 id="repair-title">Guardian-verified auto-repair</h2>
        </div>
        <div className={repair.resolved ? 'repair-badge resolved' : 'repair-badge'}>
          <RotateCw size={16} aria-hidden="true" />
          {repair.iterations} iterations · {formatMs(repair.resolvedMs)}
        </div>
      </div>

      <div className="repair-track">
        <article className="repair-attempt fail">
          <header>
            <CircleAlert size={18} aria-hidden="true" />
            <strong>{initial.label}</strong>
          </header>
          <p className="repair-count">
            <span className="count-fail">{initial.failCount} blocked</span>
            <span className="count-pass">{initial.passCount} passed</span>
          </p>
          <p className="repair-summary">{initial.summary}</p>
          <span className="repair-time">
            <Zap size={13} aria-hidden="true" />
            {formatMs(initial.cerebrasMs)} on Cerebras
          </span>
        </article>

        <div className="repair-arrow" aria-hidden="true">
          <RotateCw size={20} />
          <span>Auto-repair</span>
          <small>{formatMs(final.cerebrasMs)} on Cerebras</small>
        </div>

        <article className="repair-attempt pass">
          <header>
            <ShieldCheck size={18} aria-hidden="true" />
            <strong>{final.label}</strong>
          </header>
          <p className="repair-count">
            <span className="count-pass">
              {final.passCount}/{totalGates} passed
            </span>
            {final.failCount > 0 ? (
              <span className="count-fail">{final.failCount} held</span>
            ) : null}
          </p>
          <p className="repair-summary">{final.summary}</p>
          <span className="repair-time">
            <Zap size={13} aria-hidden="true" />
            {formatMs(final.cerebrasMs)} on Cerebras
          </span>
        </article>
      </div>

      {caught.length > 0 ? (
        <div className="repair-flips" aria-label="Gates caught and repaired">
          {caught.map((gate, index) => (
            <div
              className="flip-row"
              key={gate.id}
              style={{ '--flip-delay': `${index * 90}ms` } as CSSProperties}
            >
              <span className="flip-name">{gate.name}</span>
              <em className="was-fail">fail</em>
              <ArrowRight size={14} aria-hidden="true" />
              <em className={gate.after === 'pass' ? 'now-pass' : 'still-fail'}>{gate.after}</em>
            </div>
          ))}
        </div>
      ) : null}

      <footer className="repair-footer">
        {repair.resolved ? (
          <>
            <CheckCircle2 size={16} aria-hidden="true" />
            Detect → repair → re-verify in {formatMs(repair.resolvedMs)} on Cerebras — verification is
            effectively free.
          </>
        ) : (
          <>
            <CircleAlert size={16} aria-hidden="true" />
            Repair reduced failures but residual gates held — rollout stays blocked.
          </>
        )}
      </footer>
    </section>
  )
}
