import { Repeat, ShieldCheck, Zap } from 'lucide-react'
import './App.css'
import { DeepDiveProvider } from './app/deepDive'
import { useLoopForgeRun } from './app/useLoopForgeRun'
import { CommandCenter } from './components/CommandCenter'
import { ConsentBanner } from './components/ConsentBanner'
import { EvidencePack } from './components/EvidencePack'
import { FailureCluster } from './components/FailureCluster'
import { Footer } from './components/Footer'
import { IngestPanel } from './components/IngestPanel'
import { LoopStepper } from './components/LoopStepper'
import { ModelLeaderboard } from './components/ModelLeaderboard'
import { PostureStrip } from './components/PostureStrip'
import { RepairLoop } from './components/RepairLoop'
import { RepairMoment } from './components/RepairMoment'
import { RootCausePanel } from './components/RootCausePanel'
import { SimulationPanel } from './components/SimulationPanel'
import { SpeedRace } from './components/SpeedRace'
import { TopBar } from './components/TopBar'
import { ValidationMatrix } from './components/ValidationMatrix'
import { VideoFeature } from './components/VideoFeature'
import { WorkflowDiff } from './components/WorkflowDiff'
import { incidents } from './lib/syntheticData'

function App() {
  const { run, isBusy, error, runRecorded, runLive } = useLoopForgeRun()

  return (
    <DeepDiveProvider>
    <main className="app-shell" id="top">
      <TopBar />

      <div className="punch-banner">
        <Zap size={20} aria-hidden="true" />
        <p>
          <strong>LoopForge</strong> catches a broken production support agent, fixes it, and proves
          the fix is safe — the whole repair loop in <strong>~1.4 seconds</strong> on Cerebras.
        </p>
      </div>

      <CommandCenter
        run={run}
        isBusy={isBusy}
        error={error}
        onRunRecorded={runRecorded}
        onRunLive={runLive}
      />

      <RepairMoment volume={run.cluster.volume} />

      <PostureStrip />

      <LoopStepper latency={run.latency} />

      <div className="dashboard-grid">
        <SpeedRace key={`speed-${run.runId}`} latency={run.latency} />
        <ModelLeaderboard />
        <IngestPanel ingest={run.ingest} />
        <FailureCluster run={run} incidents={incidents} />
        <RootCausePanel rootCause={run.rootCause} />
        <WorkflowDiff patch={run.patch} />
        <SimulationPanel simulations={run.simulations} />
        <RepairLoop key={`repair-${run.runId}`} repair={run.repair} />
        <ValidationMatrix gates={run.gates} />
        <EvidencePack
          evidence={run.evidencePack}
          gates={run.gates}
          runId={run.runId}
          failingGates={run.gates.filter((gate) => gate.status === 'fail').length}
          run={run}
        />
      </div>

      <VideoFeature
        src="/queue-to-zero.mp4"
        poster="/queue-to-zero-poster.jpg"
        lazy
        kicker="Why Cerebras"
        title="The whole loop runs while the customer is still typing."
        caption="Silicon built for one job — streaming the whole repair loop faster than a customer can wait."
      >
        <p>
          Diagnosis, rewrite, simulation, and safety gates are eight model calls back to back. On a
          GPU that's a coffee break. On Cerebras it's <strong>~1.4 seconds</strong> — fast enough to
          repair the agent inside the same conversation that broke it.
        </p>
        <div className="why-points">
          <div className="why-point">
            <Zap size={18} aria-hidden="true" />
            <span>
              <b>Wafer-scale inference.</b> Weights live on-chip, so there's no memory round-trip
              between tokens — the Gemma 4 31B repair loop streams at ~1,300 tok/s and finishes in
              ~1.4s.
            </span>
          </div>
          <div className="why-point">
            <Repeat size={18} aria-hidden="true" />
            <span>
              <b>The loop is the product.</b> Repair only works if the full diagnose → fix → verify
              cycle finishes faster than the incident escalates.
            </span>
          </div>
          <div className="why-point">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>
              <b>Speed never skips the guardrails.</b> Every fix ships behind deterministic safety
              gates — the same checks pass or the patch never lands.
            </span>
          </div>
        </div>
      </VideoFeature>

      <Footer />
      <ConsentBanner />
    </main>
    </DeepDiveProvider>
  )
}

export default App
