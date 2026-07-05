import { useEffect, useMemo, useState } from 'react'
import type { EnvironmentPlan } from '../environmentPlan'
import type { FrozenWorkflow } from '../workflowDraft'
import { WORKFLOW_ACTION_LABELS, siteFleets } from '../workflowDraft'
import { applyWarehouseAction, bfsOracle, initialWarehouseState, oraclePolicy, type GridPos, type WarehouseTask } from '../warehouse'
import { evaluateDrawnSite } from '../siteEval'
import { MultiRobotSim } from './MultiRobotSim'
import { ProvingGround3D } from './ProvingGround3D'
import { StepBridge } from './StepBridge'
import { ReportIssueModal } from './ReportIssueModal'

function posKey(p: GridPos): string {
  return `${p.x},${p.y}`
}

function positionsFor(task: WarehouseTask): GridPos[] {
  let state = initialWarehouseState(task)
  const positions = [state.position]
  for (const action of oraclePolicy(task)) {
    state = applyWarehouseAction(task, state, action)
    positions.push(state.position)
    if (state.terminalAction || state.unsafeEntered) break
  }
  return positions
}

export function WorkflowIllustration({
  plan,
  frozen,
  onFreeze,
  onBack,
}: {
  plan: EnvironmentPlan
  frozen: FrozenWorkflow
  onFreeze: () => void
  onBack: () => void
}) {
  // Animate the operator's OWN drawn floor (start/item/drop + walls + hazards),
  // scored by the same deterministic oracle — so the walk reflects their edits,
  // not a canonical stand-in. (evaluateDrawnSite also sets the refuse case.)
  const task = useMemo(
    () => evaluateDrawnSite(frozen.siteMap, plan.requirement.embodiment).task,
    [frozen.siteMap, plan.requirement.embodiment],
  )
  const oracle = bfsOracle(task)
  const actions = oraclePolicy(task)
  const path = useMemo(() => positionsFor(task), [task])
  const [step, setStep] = useState(0)
  const [dim, setDim] = useState<'2d' | '3d'>('2d')
  const [reportOpen, setReportOpen] = useState(false)

  // The "Approve workflow" button sits at the very bottom of the long reflect page; when this
  // view mounts the shared window scroll is still down there. Lift the operator straight to the
  // "Your drawn floor" simulation so they can watch the 2D/3D run they just approved.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Multi-robot: when the operator placed robots, the shared MultiRobotSim animates
  // every one on its own collision-free lane. The single-agent oracle still mints
  // the licensed verdict (shown beside the grid) — that's the scored source of truth.
  const multi = (frozen.siteMap.robots?.length ?? 0) > 0
  // The operator's full deployment — shown beside the single scored lane so the
  // oracle's "1 robot · N actions" never reads as a miscount of the fleet.
  const deployFleets = useMemo(() => siteFleets(frozen.siteMap), [frozen.siteMap])
  const fleetCount = deployFleets.length
  const robotCount = deployFleets.reduce((n, f) => n + f.robots.length, 0)
  const itemCount = deployFleets.reduce((n, f) => n + f.items.length, 0)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    const timer = window.setInterval(() => {
      setStep((s) => (s >= actions.length ? actions.length : s + 1))
    }, 460)
    return () => window.clearInterval(timer)
  }, [actions.length])

  const current = path[Math.min(step, path.length - 1)] ?? task.start
  const pathSet = new Set(path.slice(0, Math.min(step + 1, path.length)).map(posKey))

  return (
    <section className="illustrate">
      <div className="flow-shell wide">
        <button className="btn ghost back" onClick={onBack}>
          ← Back to approval
        </button>
        <div className="flow-kicker">Supervised run</div>
        <h1>Watch the plan run on the floor you drew.</h1>
        <p className="flow-sub">
          An illustration of your approved workflow on your own floor. The verdict — and the safe
          route the robot takes — come from evidence-backed verification: a shortest-path search that
          routes around every wall and hazard. No model, no guesswork.
        </p>

        <StepBridge done="Workflow frozen + sealed" next="watch your fleet run it; verification mints the call — finish, escalate, or refuse." />

        <div className="illustration-grid">
          <div className="simulation-stage">
            <div className="stage-caption">
              <span>Your drawn floor</span>
              <div className="dim-toggle" role="group" aria-label="Choose a view">
                <span className="dim-toggle-label">View</span>
                <button className={dim === '2d' ? 'on' : ''} aria-pressed={dim === '2d'} onClick={() => setDim('2d')}>2D map</button>
                <button className={dim === '3d' ? 'on' : ''} aria-pressed={dim === '3d'} onClick={() => setDim('3d')}>3D view</button>
              </div>
              <strong>Verified verdict: {oracle.label.toUpperCase()}</strong>
            </div>
            {dim === '3d' ? (
              <ProvingGround3D siteMap={frozen.siteMap} verdict={oracle.label} embodiment={plan.requirement.embodiment} domain={plan.requirement.domain} />
            ) : multi ? (
              <MultiRobotSim siteMap={frozen.siteMap} verdictLabel={oracle.label} embodiment={plan.requirement.embodiment} />
            ) : (
              <>
                <div className="sim-grid" style={{ gridTemplateColumns: `repeat(${task.width}, 1fr)` }}>
                  {Array.from({ length: task.width * task.height }, (_, i) => {
                    const x = i % task.width
                    const y = Math.floor(i / task.width)
                    const key = `${x},${y}`
                    const isRobot = current.x === x && current.y === y
                    const isWall = task.obstacles.some((p) => p.x === x && p.y === y)
                    const isHazard = task.hazards.some((p) => p.x === x && p.y === y)
                    const isHuman = task.humanOnly.some((p) => p.x === x && p.y === y)
                    const label =
                      task.start.x === x && task.start.y === y
                        ? 'S'
                        : task.item.x === x && task.item.y === y
                          ? 'I'
                          : task.drop.x === x && task.drop.y === y
                            ? 'D'
                            : isWall ? 'W' : isHazard ? '!' : isHuman ? 'H' : ''
                    const kindClass = isWall ? 'wall' : isHazard ? 'hazard' : isHuman ? 'human' : ''
                    return (
                      <div
                        className={`sim-cell ${kindClass} ${pathSet.has(key) ? 'path' : ''} ${isRobot ? 'robot' : ''}`}
                        key={key}
                      >
                        {isRobot ? '●' : label}
                      </div>
                    )
                  })}
                </div>
                <div className="site-legend sim-legend">
                  <span className="lg-sid">S Start</span>
                  <span className="lg-sid">I Item</span>
                  <span className="lg-sid">D Drop</span>
                  <span className="lg-robot">● Robot</span>
                  <span className="lg-wall">W Wall</span>
                  <span className="lg-hazard">! Hazard</span>
                  <span className="lg-human">H Human-only</span>
                </div>
                <p className="deploy-note">
                  The robot starts where you placed it and walks the safe path evidence-backed
                  verification found on <strong>the floor you drew</strong> — your walls and hazards
                  included. Add a wall that blocks the route and the verdict flips to escalate; box
                  the item in with hazards and it must refuse.
                </p>
              </>
            )}
          </div>

          <div className="simulation-copy">
            <div className="panel-kicker">The verified call</div>
            <h2 className={`verdict-head lbl-${oracle.label}`}>{oracle.label.toUpperCase()}</h2>
            <p className="oracle-frame certified-explainer">
              <strong>“Certified now”</strong> is the exact route evidence-backed verification just confirmed
              safe on <strong>the floor you drew</strong> — that lane is what earns verified readiness.
              <strong>“Your floor”</strong> is your full fleet deployment, shown as a preview because each
              robot isn’t individually scored yet. It’s not about matching some reference floor — it’s
              <em> your</em> floor, verified.
            </p>
            {multi ? (
              <>
                <div className="lane-stats">
                  <div className="lane-stat scored">
                    <span className="lane-stat-k">✓ Certified now <em>scored</em></span>
                    <strong>1 robot · {actions.length} action{actions.length === 1 ? '' : 's'}</strong>
                    <small>Evidence-backed verification solved this one lane start to finish. <b>This is your verification report.</b></small>
                  </div>
                  <div className="lane-stat preview">
                    <span className="lane-stat-k">Your floor <em>preview</em></span>
                    <strong>{fleetCount} fleet{fleetCount === 1 ? '' : 's'} · {robotCount} robot{robotCount === 1 ? '' : 's'}</strong>
                    <small>{itemCount} item{itemCount === 1 ? '' : 's'}, your real deployment running the same proven pattern — <b>not individually scored yet.</b> Multi-robot certification is the roadmap.</small>
                  </div>
                </div>
                <p className="lane-bridge">
                  <strong>Why it matters:</strong> the badge is honest — we certify only the lane we actually scored, and show you the floor you’re building toward.
                </p>
              </>
            ) : (
              <p className="oracle-frame">
                Your floor runs one robot, so the lane verification scored <strong>is</strong> your whole floor — what you see is exactly what’s verified.
              </p>
            )}
            <p className="oracle-reason">{oracle.reason}</p>
            <div className="sim-trace-label">The robot’s moves, in order — tap to scrub</div>
            <div className="action-timeline">
              {actions.map((action, index) => (
                <button
                  key={`${action}-${index}`}
                  className={index <= step ? 'on' : ''}
                  onClick={() => setStep(index + 1)}
                >
                  <span className="at-n">{index + 1}</span>
                  {WORKFLOW_ACTION_LABELS[action]}
                </button>
              ))}
            </div>
            <div className="frozen-card">
              <span>🔒 Approved setup is sealed</span>
              <p>{frozen.frozenWorkflowSummary}</p>
              <span className="frozen-seal-note">This exact setup is sealed and saved with your plan — change anything and it’s scored fresh.</span>
            </div>
          </div>
        </div>

        <div className="flow-actions">
          <button className="btn primary hero-action" onClick={onFreeze}>
            Freeze eval
          </button>
          <button className="btn report-issue" onClick={() => setReportOpen(true)}>
            <span className="report-flag" aria-hidden="true">⚑</span> Run into issues? Report it
          </button>
          <span className="trust-note">After freeze, authoring cannot silently mutate scored tasks.</span>
        </div>
      </div>
      {reportOpen && <ReportIssueModal onClose={() => setReportOpen(false)} />}
    </section>
  )
}

