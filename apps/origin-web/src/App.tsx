import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { PRODUCT_NAME, PRODUCT_TAGLINE } from './factorydad/brand'
import { decide, toMockView } from './agent'
import { fetchEvidenceStatus } from './serverEpisodeClient'
import { buildGymTrace, gymLicenseToState, runReferenceGymEpisode } from './gymClient'
import { computeLicense, computeLicenseFromVerdicts, LICENSE_LEVELS } from './license'
import { seedScenarios, trainScenarios } from './seedScenarios'
import { verify } from './verifier'
import { WAREHOUSE_TOOLS, buildWarehouseDemo, buildWarehouseDemoForTasks } from './warehouse'
import { buildEnvironmentPlan, type EnvironmentPlan, type EnvironmentRequirement } from './environmentPlan'
import type { CaptureManifest } from './captureManifest'
import { AccountMenu } from './auth/AccountMenu'
import {
  frozenToPlanInput,
  proposeUnderstanding,
  type FrozenWorkflow,
  type WorkflowUnderstanding,
} from './workflowDraft'
import type {
  AgentDecision,
  AgentSource,
  EvidenceStatus,
  LicenseState,
  PersistenceStatus,
  Scenario,
  Trace,
} from './types'
import { ScenarioCard } from './components/ScenarioCard'
import { AgentActionCard } from './components/AgentActionCard'
import { VerifierCard } from './components/VerifierCard'
import { LicenseSummary } from './components/LicenseSummary'
import { TraceViewer } from './components/TraceViewer'
import { EvidencePanel } from './components/EvidencePanel'
import { Landing } from './components/Landing'
import { FlowStepper } from './components/FlowStepper'
import { CaptureConsole } from './components/CaptureConsole'
import { UnderstandingProgress } from './components/UnderstandingProgress'
import { ReflectAlign } from './components/ReflectAlign'
import { WorkflowIllustration } from './components/WorkflowIllustration'
import { EnvironmentPreview } from './components/EnvironmentPreview'
import { LicenseResults } from './components/LicenseResults'
import { PolicyProgression } from './components/PolicyProgression'
import { MatrixMini, TriptychCard } from './components/warehouseViz'
import { TrustChain } from './components/TrustChain'
import { actionTrace, pct } from './format'

const FALLBACK_MSG = 'Nebius unavailable — using local policy fallback for demo reliability.'

type View =
  | 'landing'
  | 'capture'
  | 'understanding'
  | 'reflect'
  | 'illustrate'
  | 'preview'
  | 'results'
  | 'showcase'

function App() {
  // Product journey: landing -> capture -> understanding -> reflect -> illustrate -> preview -> results, with the
  // original static warehouse console reachable as the "showcase" sample eval.
  // The marketing home lives at "/"; this console is the workspace, so it opens
  // directly on the submit (capture) step. The in-app 'landing' view is retired
  // from the default path (brand/back links go to the home).
  const [view, setView] = useState<View>('capture')
  const [plan, setPlan] = useState<EnvironmentPlan | null>(null)
  const [requirement, setRequirement] = useState<EnvironmentRequirement | null>(null)
  const [manifest, setManifest] = useState<CaptureManifest | null>(null)
  const [draft, setDraft] = useState<WorkflowUnderstanding | null>(null)
  const [frozen, setFrozen] = useState<FrozenWorkflow | null>(null)
  const planDemo = useMemo(() => (plan ? buildWarehouseDemoForTasks(plan.tasks) : null), [plan])

  function handleAnalyze(req: EnvironmentRequirement, cap: CaptureManifest) {
    setRequirement(req)
    setManifest(cap)
    setDraft(proposeUnderstanding(cap))
    setFrozen(null)
    setPlan(null)
    setView('understanding')
  }

  function handleManual(req: EnvironmentRequirement, cap: CaptureManifest) {
    setRequirement(req)
    setManifest(cap)
    setDraft(proposeUnderstanding(cap, true))
    setFrozen(null)
    setPlan(null)
    setView('reflect')
  }

  function handleApproveWorkflow(nextFrozen: FrozenWorkflow) {
    if (!requirement) return
    setFrozen(nextFrozen)
    setPlan(buildEnvironmentPlan(requirement, frozenToPlanInput(nextFrozen)))
    setView('illustrate')
  }

  // Returning to the approval step must restore the user's edited floor — not the
  // original proposal. The frozen workflow already holds every edit (placements,
  // domain, embodiment, rules), so merge it back into the draft before re-mounting.
  function handleBackToReflect() {
    setDraft((d) =>
      d && frozen
        ? {
            ...d,
            domain: frozen.domain,
            embodiment: frozen.embodiment,
            siteMap: frozen.siteMap,
            storyboard: frozen.storyboard,
            finishRules: frozen.terminalRules.finish,
            escalateRules: frozen.terminalRules.escalate,
            refuseRules: frozen.terminalRules.refuse,
          }
        : d,
    )
    setView('reflect')
  }

  const [traces, setTraces] = useState<Trace[]>([])
  const [cursor, setCursor] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [mode, setMode] = useState<AgentSource>('mock')
  const [running, setRunning] = useState(false)

  // Server-owned evidence state.
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>('idle')
  const [evidence, setEvidence] = useState<EvidenceStatus | null>(null)
  const [backendReached, setBackendReached] = useState(false)
  // Latest authoritative license returned by a `/v1` gym step. When present it is
  // the headline license; the demo-only train eval clears it.
  const [gymLicense, setGymLicense] = useState<LicenseState | null>(null)

  const traceLicense = useMemo(() => computeLicense(traces), [traces])
  const warehouseDemo = useMemo(() => buildWarehouseDemo(), [])
  const oracleBaseline = warehouseDemo.baselines.find((b) => b.name === 'calibrated oracle')!
  // The readiness level the SAMPLE'S calibrated oracle earns (so the ladder marks the
  // level this worked example reaches, not the live console's pre-run L0).
  const sampleLevel = useMemo(
    () =>
      computeLicenseFromVerdicts(
        oracleBaseline.rollouts.map((r) => ({
          passed: r.passed,
          reward: r.reward,
          catastrophic: r.category === 'unsafe_zone' || r.falseAccept,
        })),
      ),
    [oracleBaseline],
  )
  const license = gymLicense ?? traceLicense
  const active = traces.length > 0 ? traces[traces.length - 1] : null

  const nebiusModel = useMemo(
    () => [...traces].reverse().find((t) => t.decision.source === 'nebius')?.decision.model,
    [traces],
  )

  // Pull the compact server evidence status — backend proof that survives a
  // client reload (run id, episode count, latest ids) rather than only React state.
  function refreshEvidence() {
    fetchEvidenceStatus()
      .then((status) => {
        if (status) {
          setEvidence(status)
          setBackendReached(true)
        }
      })
      .catch(() => {})
  }

  useEffect(refreshEvidence, [])

  function buildTrace(scenario: Scenario, episode: number, decision: AgentDecision): Trace {
    const result = verify(scenario, decision)
    const signal = result.catastrophic
      ? 'caps license'
      : result.passed
        ? 'builds trust'
        : 'erodes trust'
    return {
      id: `ep-${episode}-${scenario.id}`,
      episode,
      scenario,
      decision,
      result,
      licenseSignal: signal,
      authority: 'demo_client_trace',
      displayIndex: episode,
    }
  }

  // Canonical single-episode path: the SERVER-OWNED reference endpoint drives the
  // `/v1` gym env. The reference agent (mock or Nebius) proposes an action from
  // the observation; the ENVIRONMENT verifies it, scores it, and computes the
  // license. Nebius failures fall back to a fresh mock episode server-side. The
  // browser runs no verifier/license math and never mints reference provenance —
  // it renders what the endpoint returns.
  async function runGymEpisode() {
    if (running) return
    setRunning(true)
    setNotice(null)
    setPersistenceStatus('saving')
    try {
      const scenario = seedScenarios[cursor % seedScenarios.length]
      const { step, decision, provenance } = await runReferenceGymEpisode(scenario.id, mode)

      setTraces((prev) => [
        ...prev,
        { ...buildGymTrace(scenario, decision, step, provenance), displayIndex: prev.length + 1 },
      ])
      // The `/v1` step license is authoritative — make it the headline license.
      setGymLicense(gymLicenseToState(step.license))
      setCursor((c) => c + 1)
      setPersistenceStatus(step.persisted ? 'saved' : 'local_only')
      if (provenance.fallback) setNotice(FALLBACK_MSG)
      refreshEvidence()
    } catch {
      setPersistenceStatus('unavailable')
      setNotice('Gym episode unavailable — check the server and try again.')
    } finally {
      setRunning(false)
    }
  }

  // Train-split batch eval — intentionally MOCK-ONLY and client-side for
  // reliability. Measures only the public training scenarios; held-out scenarios
  // are reserved for generalization checks. Clears the authoritative gym license so
  // this demo-only view never masquerades as the environment-returned `/v1` license.
  function runTrainEval() {
    if (running) return
    setNotice(null)
    try {
      const fresh = trainScenarios.map((s, i) => buildTrace(s, i + 1, decide(toMockView(s))))
      setTraces(fresh)
      setGymLicense(null)
      setCursor(seedScenarios.length)
    } catch {
      setNotice('Could not run the eval. The loop was left unchanged — try again.')
    }
  }

  function reset() {
    if (running) return
    setTraces([])
    setGymLicense(null)
    setCursor(0)
    setNotice(null)
  }

  const primaryLabel = running
    ? mode === 'nebius'
      ? 'Running Nebius…'
      : 'Running…'
    : mode === 'nebius'
      ? 'Run 1 Nebius Gym Episode'
      : 'Run Gym Episode'

  const mutValue =
    mode === 'nebius' ? nebiusModel ?? 'Nebius Token Factory' : 'Mock Policy (local)'

  return (
    <div className="console">
      <nav className="appnav">
        <a className="appbrand" href="/" aria-label={`${PRODUCT_NAME} home`}>
          <img className="appbrand-mark" src="/origin-logo.png" alt="" aria-hidden="true" />
          <span className="appbrand-text">
            <span className="appbrand-name">{PRODUCT_NAME}</span>
            <span className="appbrand-sub">{PRODUCT_TAGLINE}</span>
          </span>
        </a>
        <div className="appnav-links">
          <a className="navlink" href="/">← Home</a>
          <button
            className={`navlink ${view === 'showcase' ? 'on' : ''}`}
            onClick={() => setView('showcase')}
          >
            Sample report
          </button>
          {typeof window !== 'undefined' &&
            /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && (
              <a
                className="navlink"
                href="http://localhost:8765"
                target="_blank"
                rel="noreferrer"
                title="Passport — the same permission layer for software agents (local demo)"
              >
                Passport ↗
              </a>
            )}
          <button className="btn primary navlink-cta" onClick={() => setView('capture')}>
            Submit your site
          </button>
          <AccountMenu />
        </div>
      </nav>

      <FlowStepper view={view} />

      {view === 'landing' && (
        <Landing onCreate={() => setView('capture')} onSample={() => setView('showcase')} />
      )}
      {view === 'capture' && (
        <CaptureConsole
          onAnalyze={handleAnalyze}
          onManual={handleManual}
          onBack={() => {
            window.location.href = '/'
          }}
        />
      )}
      {view === 'understanding' && manifest && draft && (
        <UnderstandingProgress
          manifest={manifest}
          draft={draft}
          onContinue={() => setView('reflect')}
          onBack={() => setView('capture')}
        />
      )}
      {view === 'reflect' && draft && (
        <ReflectAlign
          draft={draft}
          onApprove={handleApproveWorkflow}
          onBack={() => setView('capture')}
          onEdit={(snap) => setDraft((d) => (d ? { ...d, ...snap } : d))}
        />
      )}
      {view === 'illustrate' && plan && frozen && (
        <WorkflowIllustration
          plan={plan}
          frozen={frozen}
          onFreeze={() => setView('preview')}
          onBack={handleBackToReflect}
        />
      )}
      {view === 'preview' && plan && (
        <EnvironmentPreview
          plan={plan}
          frozen={frozen}
          onRun={() => setView('results')}
          onBack={() => setView(frozen ? 'illustrate' : 'capture')}
        />
      )}
      {view === 'results' && plan && planDemo && (
        <LicenseResults
          plan={plan}
          frozen={frozen}
          demo={planDemo}
          onRefine={() => setView('preview')}
          onRestart={() => setView('capture')}
          onSample={() => setView('showcase')}
        />
      )}

      {view === 'showcase' && (
        <>
          <section className="showcase-intro">
            <div className="si-head">
              <span className="panel-kicker">Sample evaluation report</span>
              <h1>How a robot earns each readiness level</h1>
              <p>
                A worked example. The deterministic oracle scores an agent’s{' '}
                <strong>finish / escalate / refuse</strong> calls on a symbolic warehouse, then the
                FAR/FRR calibration decides which readiness level it has earned. This is the shape of
                the report a customer gets for their own site.
              </p>
            </div>

            <ol className="readiness-ladder" aria-label="Readiness levels">
              {Object.values(LICENSE_LEVELS).map((lvl) => (
                <li
                  key={lvl.id}
                  className={`rl-step ${lvl.id === sampleLevel.level.id ? 'rl-here' : ''}`}
                  style={lvl.id === sampleLevel.level.id ? { borderColor: lvl.color } : undefined}
                >
                  <span className="rl-badge" style={{ background: lvl.color }}>
                    {lvl.id}
                  </span>
                  <span className="rl-text">
                    <strong>{lvl.name}</strong>
                    <span>{lvl.permission}</span>
                  </span>
                  {lvl.id === sampleLevel.level.id && <span className="rl-tag">sample earns this</span>}
                </li>
              ))}
            </ol>

            <div className="si-legend" aria-label="What you are looking at">
              <div>
                <strong>Triptych</strong>
                <span>
                  Three agent archetypes: capable-but-reckless fails (false-accept),
                  cautious-but-useless fails (false-reject), calibrated passes.
                </span>
              </div>
              <div>
                <strong>FAR / FRR</strong>
                <span>
                  The headline safety metric. FAR = acted when it should have refused/escalated (the
                  dangerous error). FRR = refused a doable task.
                </span>
              </div>
              <div>
                <strong>Reward-hacking trace</strong>
                <span>A faked finish scores 0 — shaping can never rescue a wrong outcome.</span>
              </div>
              <div>
                <strong>Signal Extractor</strong>
                <span>Every rollout becomes training rows: failure tags, preference pairs, reward rows.</span>
              </div>
            </div>

            <div className="glossary" aria-label="Plain-English glossary">
              <div className="panel-kicker">In plain English</div>
              <dl>
                <div>
                  <dt>Oracle</dt>
                  <dd>A fixed rulebook (an algorithm), not an AI, that decides the right call — the same way every time.</dd>
                </div>
                <div>
                  <dt>Finish / Escalate / Refuse</dt>
                  <dd>Do the job · ask a human · don’t do it. The three calls we license.</dd>
                </div>
                <div>
                  <dt>FAR</dt>
                  <dd>“Acted when it should have stopped” — the dangerous mistake.</dd>
                </div>
                <div>
                  <dt>FRR</dt>
                  <dd>“Refused a job it could have safely done” — the timid mistake.</dd>
                </div>
                <div>
                  <dt>Reward-hacking</dt>
                  <dd>Faking success to score points — caught, and scored zero.</dd>
                </div>
              </dl>
            </div>
            <TrustChain />
          </section>

          <header className="topbar">
        <div className="brand">
          <h1>Sample warehouse evaluation</h1>
          <p className="tagline">Run a live episode, or read the worked example below.</p>
          <p className="future">deterministic Calibrated Autonomy Gym · no model spend</p>
        </div>

        <div
          className="license-chip"
          style={{ borderColor: license.level.color }}
          aria-label={`Current autonomy license: ${license.level.id} ${license.level.name}`}
        >
          <span className="chip-badge" style={{ background: license.level.color }}>
            {license.level.id}
          </span>
          <span className="chip-text">
            <span className="chip-eyebrow">Autonomy license</span>
            <span className="chip-name" style={{ color: license.level.color }}>
              {license.level.name}
            </span>
          </span>
        </div>

        <div className="runner">
          <div className="mode-row">
            <div className="mode-toggle" role="group" aria-label="Agent mode">
              <button
                className={mode === 'mock' ? 'on' : ''}
                aria-pressed={mode === 'mock'}
                onClick={() => setMode('mock')}
              >
                Mock Policy
              </button>
              <button
                className={mode === 'nebius' ? 'on' : ''}
                aria-pressed={mode === 'nebius'}
                onClick={() => setMode('nebius')}
              >
                Nebius Policy
              </button>
            </div>
            <div className={`mut-badge ${mode === 'nebius' ? 'mut-nebius' : ''}`}>
              <span className="mut-label">Model under test</span>
              <span className="mut-value">{mutValue}</span>
            </div>
          </div>

          <div className="controls">
            <button
              className="btn primary"
              onClick={runGymEpisode}
              disabled={running}
              aria-label={
                mode === 'nebius'
                  ? 'Run one Nebius gym episode through the /v1 environment'
                  : 'Run a single gym episode through the /v1 environment'
              }
            >
              <span aria-hidden="true">▶</span> {primaryLabel}
              <span className="server-tag">/v1 · evidence</span>
            </button>
            <button
              className="btn"
              onClick={runTrainEval}
              disabled={running}
              aria-label="Run the train-split evaluation with the mock policy"
            >
              <span aria-hidden="true">⏩</span> Run Train Eval
              <span className="mock-tag">mock</span>
            </button>
            <button
              className="btn ghost"
              onClick={reset}
              disabled={running}
              aria-label="Reset the console"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}

      <section className="warehouse-demo">
        <div className="warehouse-head">
          <div>
            <div className="section-title">Calibrated Autonomy Gym</div>
            <h2>The safety checker: finish / escalate / refuse</h2>
            <p>
              A toy warehouse the robot must navigate. A fixed rulebook (the “oracle”) labels each
              task and scores the agent — no AI judging. A capable-but-reckless agent fails; a
              cautious-but-useless agent fails; only calibrated behavior earns the license.
            </p>
          </div>
          <div className="warehouse-badges">
            <span>{warehouseDemo.taskCount} tasks</span>
            <span>
              F {warehouseDemo.labelCounts.finish} / E {warehouseDemo.labelCounts.escalate} / R{' '}
              {warehouseDemo.labelCounts.refuse}
            </span>
            <span>{WAREHOUSE_TOOLS.join(', ')}</span>
            <span>/v1/warehouse ready</span>
          </div>
        </div>

        <PolicyProgression demo={warehouseDemo} />

        <div className="triptych">
          {warehouseDemo.triptych.map((item) => (
            <TriptychCard
              key={item.slot}
              slot={item.slot}
              title={item.title}
              line={item.line}
              rollout={item.rollout}
            />
          ))}
        </div>

        <div className="warehouse-grid">
          <div className="warehouse-panel">
            <div className="panel-kicker">Headline calibration</div>
            <div className="baseline-list">
              {warehouseDemo.baselines.map((b) => (
                <div className="baseline-row" key={b.name}>
                  <span>{b.name}</span>
                  <span>FAR {pct(b.matrix.far)}</span>
                  <span>FRR {pct(b.matrix.frr)}</span>
                  <span>avg {b.avgReward.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <MatrixMini matrix={oracleBaseline.matrix} />
          </div>

          <div className="warehouse-panel">
            <div className="panel-kicker">Reward-hacking trace</div>
            <h3>{warehouseDemo.rewardHack.task.title}</h3>
            <p>
              A fake terminal finish without pick/drop gets outcome 0, so shaping cannot
              rescue it: reward {warehouseDemo.rewardHack.reward.toFixed(2)}.
            </p>
            <p className="trip-trace">{actionTrace(warehouseDemo.rewardHack.actions)}</p>
            <div className="trip-stats">
              <span>{warehouseDemo.rewardHack.category}</span>
              <span>oracle {warehouseDemo.rewardHack.expected}</span>
              <span>actual {warehouseDemo.rewardHack.matrixAction}</span>
            </div>
          </div>

          <div className="warehouse-panel">
            <div className="panel-kicker">Signal Extractor</div>
            <div className="signal-grid">
              <span>{warehouseDemo.signal.failureTags.length}</span>
              <span>failure tags</span>
              <span>{warehouseDemo.signal.preferencePairs.length}</span>
              <span>preference pairs</span>
              <span>{warehouseDemo.signal.rewardViews.length}</span>
              <span>GRPO/RFT reward rows</span>
            </div>
            <p className="signal-note">
              {warehouseDemo.signal.failureTags[0]?.tags.join(', ') ?? 'no failures'} {'->'}{' '}
              {warehouseDemo.signal.preferencePairs[0]?.reason ?? 'oracle replay clean'}
            </p>
          </div>

          <div className="warehouse-panel aiuc-panel">
            <div className="panel-kicker">AIUC wedge</div>
            <p>{warehouseDemo.aiucWedge}</p>
            <p className="signal-note">
              HUD SDK path is marked VERIFY-LIVE; until then, external agents can drive the
              deterministic warehouse through /v1/warehouse with no model spend.
            </p>
          </div>
        </div>
      </section>

      <div className="layout">
        <main className="main-col">
          <section className="episode-flow">
            <h2 className="section-title">
              Current episode{' '}
              {active && (
                <span className="muted">
                  · #{active.displayIndex ?? active.episode} — {active.scenario.title}
                  {active.authority === 'server_authoritative_episode' && (
                    <span className="auth-tag auth-server">server-authoritative</span>
                  )}
                </span>
              )}
            </h2>
            {active ? (
              <div className="flow-grid">
                <ScenarioCard scenario={active.scenario} revealed={true} />
                <AgentActionCard decision={active.decision} />
                <VerifierCard result={active.result} />
              </div>
            ) : (
              <div className="empty-flow">
                <p>Run an episode to watch the loop:</p>
                <p className="loop-line">scenario → action → verifier → reward → license signal</p>
              </div>
            )}
          </section>

          <section className="trace-section">
            <TraceViewer traces={traces} />
          </section>
        </main>

        <aside className="side-col">
          <LicenseSummary license={license} />
          <EvidencePanel status={persistenceStatus} evidence={evidence} reached={backendReached} />
          <div className="scenario-bank">
            <div className="bank-head">Scenario bank · {seedScenarios.length} seeded</div>
            <ul>
              {seedScenarios.map((s, i) => {
                const isNext = i === cursor % seedScenarios.length
                return (
                  <li key={s.id} className={isNext ? 'next' : ''}>
                    <span className={`dot domain-${s.domain}`} />
                    {s.title}
                    {isNext && <span className="next-tag">next</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>
      </div>
        </>
      )}
    </div>
  )
}

export default App
