// "Your drawn floor, scored" — turns the operator's edited site map into a real
// deterministic-oracle verdict (finish / escalate / refuse), shows the safe path
// the oracle found, and contrasts it with a reckless always-finish policy so the
// safety gate is visible. The human drew the map; the oracle alone judged it.

import { evaluateDrawnSite } from '../siteEval'
import type { DescriptiveSiteMap } from '../workflowDraft'
import type { RobotEmbodiment } from '../environmentPlan'

const VERDICT_COLOR: Record<string, string> = {
  finish: 'var(--pos)',
  escalate: 'var(--warn)',
  refuse: 'var(--neg)',
}
const VERDICT_VERB: Record<string, string> = {
  finish: 'may FINISH',
  escalate: 'must ESCALATE',
  refuse: 'must REFUSE',
}

function keyOf(x: number, y: number): string {
  return `${x},${y}`
}

export function DrawnFloorEval({
  siteMap,
  embodiment,
  hazardTerm = 'hazard',
  humanOnlyTerm = 'human-only',
}: {
  siteMap: DescriptiveSiteMap
  embodiment: RobotEmbodiment
  hazardTerm?: string
  humanOnlyTerm?: string
}) {
  const evalResult = evaluateDrawnSite(siteMap, embodiment)
  const { verdict, reason, pathCells, oracleRollout, recklessRollout, counts } = evalResult
  const color = VERDICT_COLOR[verdict]

  const pathSet = new Set(pathCells.map((p) => keyOf(p.x, p.y)))
  const has = (list: readonly { x: number; y: number }[], x: number, y: number) =>
    list.some((p) => p.x === x && p.y === y)

  function cellKind(x: number, y: number): string {
    if (siteMap.start.x === x && siteMap.start.y === y) return 'S'
    if (siteMap.item.x === x && siteMap.item.y === y) return 'I'
    if (siteMap.drop.x === x && siteMap.drop.y === y) return 'D'
    if (has(siteMap.obstacles, x, y)) return 'wall'
    if (has(siteMap.hazards, x, y)) return 'hazard'
    if (has(siteMap.humanOnly, x, y)) return 'human'
    if (pathSet.has(keyOf(x, y))) return 'path'
    return 'clear'
  }
  function cellText(kind: string): string {
    if (kind === 'S' || kind === 'I' || kind === 'D') return kind
    if (kind === 'wall') return 'W'
    if (kind === 'hazard') return '!'
    if (kind === 'human') return 'H'
    return ''
  }

  // The reckless policy charges in. When the oracle didn't say finish, that's an
  // unsafe accept the gate caught (reward 0).
  const recklessCaught = verdict !== 'finish' && recklessRollout.reward === 0

  return (
    <section className="drawn-eval" aria-label="Your drawn floor, verified against telemetry">
      <div className="panel-kicker">Your floor, judged by the same verification</div>
      <h2>You drew this floor — here's the deterministic verdict.</h2>
      <p className="de-sub">
        The map you placed in “Does this match the real workflow?” is now scored by the same
        evidence-backed verification as the benchmark. You define the layout; verification alone decides{' '}
        <strong>finish</strong>, <strong>escalate</strong>, or <strong>refuse</strong>.
      </p>

      <div className="de-body">
        <div
          className="site-grid de-grid"
          style={{ gridTemplateColumns: `repeat(${siteMap.width}, 1fr)` }}
          aria-label="Drawn floor grid with the verified safe path"
        >
          {Array.from({ length: siteMap.width * siteMap.height }, (_, i) => {
            const x = i % siteMap.width
            const y = Math.floor(i / siteMap.width)
            const kind = cellKind(x, y)
            return (
              <div key={keyOf(x, y)} className={`site-cell cell-${kind}`} aria-label={`${x},${y} ${kind}`}>
                {cellText(kind)}
              </div>
            )
          })}
        </div>

        <div className="de-readout">
          <div className="de-verdict" style={{ borderColor: color }}>
            <span className="de-verdict-tag" style={{ background: color }}>
              {verdict.toUpperCase()}
            </span>
            <div>
              <strong style={{ color }}>The robot {VERDICT_VERB[verdict]}</strong>
              <p>{reason}</p>
            </div>
          </div>

          <div className="de-counts">
            <span><b>{counts.walls}</b> walls</span>
            <span><b>{counts.hazards}</b> {hazardTerm}</span>
            <span><b>{counts.humanOnly}</b> {humanOnlyTerm}</span>
          </div>

          <div className="de-compare">
            <div className="de-cmp de-cmp-oracle">
              <span>Calibrated reference</span>
              <code>
                {oracleRollout.passed ? 'pass' : 'fail'} · reward {oracleRollout.reward.toFixed(2)}
              </code>
            </div>
            <div className={`de-cmp ${recklessCaught ? 'de-cmp-bad' : 'de-cmp-ok'}`}>
              <span>Reckless “always finish”</span>
              <code>
                {recklessRollout.reward.toFixed(2)} reward
                {recklessRollout.falseAccept ? ' · unsafe accept caught' : ''}
              </code>
            </div>
          </div>

          <p className="de-note">
            Evidence-backed verification — no model, no LLM. Change the walls or {hazardTerm} cells on the
            previous step and the verdict changes with them.
          </p>
        </div>
      </div>
    </section>
  )
}
