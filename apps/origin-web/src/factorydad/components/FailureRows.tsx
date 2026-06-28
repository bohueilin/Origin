// "Every failure becomes a training row" — the section that has to make a buyer
// care about RSI/RL. Two moves: (1) teach the loop and why it matters in plain
// terms up top, (2) show each failure as a before→after lesson (model's wrong
// call → oracle's correction → the training signal it becomes), two per row.

import type { Bundle, FailureRow } from '../types'
import { TERMINAL_COLOR } from '../labels'

const FLYWHEEL = [
  { t: 'Run', d: 'the model takes the benchmark' },
  { t: 'Score', d: 'the oracle marks every call' },
  { t: 'Label', d: 'each failure → a training row' },
  { t: 'Retrain', d: 'RL fine-tunes the next brain' },
  { t: 'Re-earn', d: 'a higher RSL tier — or not' },
]

// Plain-English meaning of each training-signal type.
const USE_META: Record<string, { label: string; note: string }> = {
  reward_row: { label: 'Reward row', note: 'A scored example the RL update pushes toward.' },
  preference_pair: { label: 'Preference pair', note: 'Oracle answer ranked above the model’s — DPO-style.' },
  refusal_example: { label: 'Refusal example', note: 'A hard “do not act” the next brain must learn.' },
}

export function FailureRows({ bundle }: { bundle: Bundle }) {
  return (
    <section className="fd-section fd-shell" id="training">
      <div className="fd-kicker">Recursive self-improvement</div>
      <h2>Every failure becomes a training row</h2>
      <p className="fd-section-sub">
        A wrong or unsafe answer isn’t just a red mark. The oracle already knows the right call, so
        every miss is captured as a <strong>labeled training row</strong> — the exact lesson the next
        brain learns from. That’s recursive self-improvement (RSI): the robot you deploy gets safer
        on your floor instead of staying frozen at the version you bought.
      </p>

      <div className="fd-rsi-explain">
        <ol className="fd-flywheel" aria-label="The improvement loop">
          {FLYWHEEL.map((s, i) => (
            <li key={s.t}>
              <span className="fd-fly-n">{i + 1}</span>
              <b>{s.t}</b>
              <span>{s.d}</span>
            </li>
          ))}
          <li className="fd-fly-loop" aria-hidden="true">↻ repeats</li>
        </ol>
        <p className="fd-rsi-why">
          <strong>Why it matters:</strong> capability is bought once; <em>trust</em> is earned every
          release. Because the oracle — never a human or another model — writes the correction, the
          loop can’t reward-hack its way to a tier. Safety has to be real to stick.
        </p>
      </div>

      <div className="fd-lessons-head">
        <span className="fd-kicker">Three kinds of lesson</span>
        <div className="fd-lesson-legend">
          {Object.values(USE_META).map((u) => (
            <span key={u.label}><b>{u.label}</b> — {u.note}</span>
          ))}
        </div>
      </div>

      <div className="fd-rows">
        {bundle.failure_examples.map((r, i) => (
          <Row key={i} row={r} />
        ))}
      </div>
    </section>
  )
}

function Verdict({ kind, label }: { kind: 'model' | 'oracle'; label: string | null }) {
  const v = label ?? 'invalid'
  return (
    <div className={`fd-lz-side fd-lz-${kind}`}>
      <span className="fd-lz-role">{kind === 'model' ? 'Model did' : 'Oracle wanted'}</span>
      <span className="fd-lz-verdict" style={{ color: kind === 'oracle' ? TERMINAL_COLOR[v] : 'var(--neg)' }}>
        {v}
      </span>
    </div>
  )
}

function Row({ row }: { row: FailureRow }) {
  const use = USE_META[row.training_use] ?? { label: row.training_use.replace(/_/g, ' '), note: '' }
  const primaryTag = (row.failure_tags[0] ?? 'failure').replace(/_/g, ' ')
  return (
    <div className="fd-card fd-lesson">
      <div className="fd-lz-top">
        <span className="fd-lz-tag">{primaryTag}</span>
        <span className="fd-use">{use.label}</span>
      </div>

      <div className="fd-lz-flip">
        <Verdict kind="model" label={row.model_terminal} />
        <span className="fd-lz-arrow" aria-hidden="true">→</span>
        <Verdict kind="oracle" label={row.oracle_terminal} />
      </div>

      <p className="fd-lz-fix">{row.correction}</p>

      <div className="fd-lz-foot">
        <span className="fd-lz-becomes">Becomes a <b>{use.label.toLowerCase()}</b></span>
        <span className="fd-lz-impact">{row.rsl_impact}</span>
      </div>
    </div>
  )
}
