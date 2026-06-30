import { LEARNING_CURVE, MODEL_RESULT, PER_CLASS, EMPTY_CLASSES, GYM, JOURNEY, SAFETY_POLICY } from '../trainingProgress'

// Plot geometry — shared by the curve + its reference lines.
const PLOT = { x0: 64, x1: 600, y0: 28, y1: 250, accMax: 0.75, epochMax: 90 }
const ex = (epoch: number) => PLOT.x0 + ((epoch - 1) / (PLOT.epochMax - 1)) * (PLOT.x1 - PLOT.x0)
const ay = (acc: number) => PLOT.y1 - (acc / PLOT.accMax) * (PLOT.y1 - PLOT.y0)
const pct = (v: number) => `${Math.round(v * 100)}%`
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`

function LearningCurve() {
  const pts = LEARNING_CURVE.map((p) => `${ex(p.epoch).toFixed(1)},${ay(p.valBalancedAcc).toFixed(1)}`)
  const line = pts.join(' ')
  const area = `${ex(1).toFixed(1)},${PLOT.y1} ${line} ${ex(PLOT.epochMax).toFixed(1)},${PLOT.y1}`
  const best = LEARNING_CURVE.find((p) => p.epoch === MODEL_RESULT.bestEpoch) ?? LEARNING_CURVE[LEARNING_CURVE.length - 1]
  const floorY = ay(MODEL_RESULT.floorBalancedAcc)
  const targetY = ay(MODEL_RESULT.targetBalancedAcc)

  return (
    <svg className="ml-curve" viewBox="0 0 620 280" role="img"
         aria-label={`A measured training curve: balanced accuracy climbs from a ${pct(MODEL_RESULT.floorBalancedAcc)} floor to ${pct(best.valBalancedAcc)} over training, past the ${pct(MODEL_RESULT.targetBalancedAcc)} target.`}>
      <defs>
        <linearGradient id="mlFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* y gridlines at 25/50/75% */}
      {[0.25, 0.5, 0.75].map((a) => (
        <g key={a}>
          <line x1={PLOT.x0} y1={ay(a)} x2={PLOT.x1} y2={ay(a)} stroke="var(--line)" strokeWidth={1} />
          <text x={PLOT.x0 - 8} y={ay(a) + 4} textAnchor="end" style={{ fill: 'var(--muted)', fontSize: 11 }}>{pct(a)}</text>
        </g>
      ))}

      {/* floor: always-guess-majority */}
      <line x1={PLOT.x0} y1={floorY} x2={PLOT.x1} y2={floorY} stroke="var(--neg)" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.7} />
      <text x={PLOT.x1} y={floorY - 7} textAnchor="end" style={{ fill: 'var(--neg-ink)', fontSize: 11 }}>
        {pct(MODEL_RESULT.floorBalancedAcc)} floor — always guess the commonest room
      </text>

      {/* target line */}
      <line x1={PLOT.x0} y1={targetY} x2={PLOT.x1} y2={targetY} stroke="var(--warn)" strokeWidth={1.25} strokeDasharray="2 4" opacity={0.7} />
      <text x={PLOT.x1} y={targetY - 7} textAnchor="end" style={{ fill: 'var(--warn-ink)', fontSize: 11 }}>{pct(MODEL_RESULT.targetBalancedAcc)} launch target</text>

      {/* area + the measured curve (draws in) */}
      <polygon points={area} fill="url(#mlFill)" />
      <polyline className="ml-curve-line" points={line} fill="none" stroke="var(--accent)" strokeWidth={2.75}
                strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
      {LEARNING_CURVE.map((p) => (
        <circle key={p.epoch} cx={ex(p.epoch)} cy={ay(p.valBalancedAcc)} r={p.epoch === MODEL_RESULT.bestEpoch ? 5 : 3}
                fill={p.epoch === MODEL_RESULT.bestEpoch ? 'var(--accent)' : 'var(--panel)'}
                stroke="var(--accent)" strokeWidth={1.75} />
      ))}
      <text x={ex(best.epoch)} y={ay(best.valBalancedAcc) - 12} textAnchor="middle"
            style={{ fill: 'var(--accent-ink)', fontSize: 12, fontWeight: 700 }}>
        {pct(best.valBalancedAcc)}
      </text>

      {/* x axis ticks */}
      {[1, 30, 60, 90].map((e) => (
        <text key={e} x={ex(e)} y={272} textAnchor="middle" style={{ fill: 'var(--muted)', fontSize: 11 }}>
          {e === 1 ? 'epoch 1' : e}
        </text>
      ))}
    </svg>
  )
}

function PerClassBars() {
  const max = Math.max(...PER_CLASS.map((c) => c.recall))
  return (
    <div className="ml-classes">
      <div className="ml-classes-head">What it learned to read — held-out recall by room type</div>
      <ul className="ml-class-list">
        {PER_CLASS.map((c) => (
          <li key={c.name} className="ml-class-row">
            <span className="ml-class-name">{c.name.replace(/_/g, ' ')}</span>
            <span className="ml-class-track">
              <span className="ml-class-fill" style={{ width: `${(c.recall / max) * 100}%` }} />
            </span>
            <span className="ml-class-val">{pct(c.recall)}</span>
          </li>
        ))}
      </ul>
      <p className="ml-class-note">
        {EMPTY_CLASSES.length} classes ({EMPTY_CLASSES.join(', ').replace(/_/g, ' ')}) have no held-out examples yet — shown as honest gaps, not hidden.
      </p>
    </div>
  )
}

export function ModelLearning() {
  const r = MODEL_RESULT
  return (
    <section className="fd-section fd-shell ml" id="learning">
      <div className="fd-kicker ml-kicker">Measured, not projected</div>
      <h2>Watch the brain actually learn the floor.</h2>
      <p className="fd-section-sub">
        A real training run on {GYM.floors.toLocaleString()} deterministically-graded floors. Balanced accuracy climbs off a{' '}
        <strong>{pct(r.floorBalancedAcc)} floor</strong> to <strong>{pct(r.testBalancedAcc)}</strong> on held-out floors —
        <strong> {(r.testBalancedAcc / r.targetBalancedAcc).toFixed(1)}×</strong> our launch target — graded against a deterministic oracle, never an LLM.
      </p>

      <div className="fd-card ml-perf">
        <div className="ml-perf-grid">
          <div className="ml-curve-wrap">
            <LearningCurve />
            <div className="ml-headline">
              <span className="ml-headline-from">{pct(r.floorBalancedAcc)}</span>
              <span className="ml-headline-arrow" aria-hidden="true">→</span>
              <span className="ml-headline-to">{pct(r.testBalancedAcc)}</span>
              <span className="ml-headline-label">balanced accuracy · held-out · {r.samples.test.toLocaleString()} test nodes</span>
            </div>
          </div>
          <PerClassBars />
        </div>
        <div className="ml-stats">
          <div className="ml-stat"><b>{r.samples.train.toLocaleString()}</b><span>training nodes</span></div>
          <div className="ml-stat"><b>{r.classes}</b><span>room types</span></div>
          <div className="ml-stat"><b>{pct(r.testAccuracy)}</b><span>raw accuracy</span></div>
          <div className="ml-stat"><b>~{r.runtimeSeconds}s</b><span>to train (CPU)</span></div>
          <div className="ml-stat ml-stat--key"><b>0</b><span>LLM judges</span></div>
        </div>
        <p className="ml-honesty">
          <span className="ml-honesty-tag">What this is</span> the brain learning to <strong>read</strong> a floor (room structure) — the foundation.
          The <strong>finish / escalate / refuse</strong> safety policy below is a separate measured result from the same oracle-labeled gym.
        </p>
      </div>

      <div className="ml-journey-head">
        <div className="fd-kicker ml-kicker">Floor in → readiness out</div>
        <h3>Every customer floor becomes a gym their robot has to pass.</h3>
      </div>
      <ol className="ml-journey">
        {JOURNEY.map((s, i) => (
          <li key={s.key} className={`ml-stage ml-stage--${s.state}`}>
            <div className="ml-stage-top">
              <span className="ml-stage-idx">{i + 1}</span>
              <span className="ml-stage-metric">{s.metric}</span>
            </div>
            <div className="ml-stage-label">{s.label}</div>
            <p className="ml-stage-detail">{s.detail}</p>
            {s.state === 'next' && <span className="ml-stage-badge">next</span>}
          </li>
        ))}
      </ol>

      <div className="ml-gym-strip">
        <div className="ml-gym-bar" role="img" aria-label={`Gym label balance: ${GYM.finish} finish, ${GYM.escalate} escalate, ${GYM.refuse} refuse`}>
          <span className="ml-gym-seg ml-gym-seg--finish" style={{ flexGrow: GYM.finish }}><b>{GYM.finish.toLocaleString()}</b> finish</span>
          <span className="ml-gym-seg ml-gym-seg--escalate" style={{ flexGrow: GYM.escalate }}><b>{GYM.escalate.toLocaleString()}</b> escalate</span>
          <span className="ml-gym-seg ml-gym-seg--refuse" style={{ flexGrow: GYM.refuse }}><b>{GYM.refuse.toLocaleString()}</b> refuse</span>
        </div>
        <p className="ml-gym-note">
          <strong>{GYM.floors.toLocaleString()} floors</strong>, every one labeled by the deterministic oracle. The <strong style={{ color: 'var(--neg-ink)' }}>{GYM.refuse} refuse</strong> floors
          are synthesized hazard / blocked-egress cases — the safety class a robot must learn to <em>not</em> act on. A balanced {GYM.balancedView}/{GYM.balancedView}/{GYM.balancedView} view trains the policy without gaming the metric.
        </p>
      </div>
      <div className="ml-safety fd-card">
        <div>
          <div className="fd-kicker ml-kicker">Safety policy v1</div>
          <h3>Finish / escalate / refuse, recovered from raw geometry.</h3>
          <p>
            <strong>{pct1(SAFETY_POLICY.balancedMean)}</strong> mean balanced accuracy over {SAFETY_POLICY.seedCount} raw-geometry seeds
            {' '}(<strong>{pct1(SAFETY_POLICY.balancedMin)}-{pct1(SAFETY_POLICY.balancedMax)}</strong> range). Refuse recall:
            {' '}<strong>{pct1(SAFETY_POLICY.refuseRecallMean)}</strong> mean, range <strong>{pct1(SAFETY_POLICY.refuseRecallMin)}-{pct1(SAFETY_POLICY.refuseRecallMax)}</strong>.
          </p>
        </div>
        <div className="ml-safety__bounds">
          <span><b>{pct1(SAFETY_POLICY.oracleRecoveryUpperBound)}</b> oracle-recovery upper bound</span>
          <span><b>{pct1(SAFETY_POLICY.featureDisjointBalancedAcc)}</b> feature-disjoint regroup</span>
          <em>Bounded Gym, not production certification. The oracle is the judge.</em>
        </div>
      </div>
      <a className="ml-rsi-link fd-card" href="/rsi/rsi_dashboard.html">
        <img src="/rsi/dashboard-preview.png" alt="Preview of the Origin RSI verifier dashboard" loading="lazy" />
        <span>
          <b>Open the RSI verifier dashboard</b>
          <em>Gemma proposes, Origin verifies, oracle divergence 0.</em>
        </span>
      </a>
    </section>
  )
}
