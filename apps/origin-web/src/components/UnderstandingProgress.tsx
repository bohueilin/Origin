import { useCallback, useState } from 'react'
import { countDeclaredWorkflowInputs, type CaptureManifest } from '../captureManifest'
import type { WorkflowUnderstanding } from '../workflowDraft'
import { BrainStream } from './brain/BrainStream'
import { StepBridge } from './StepBridge'

export function UnderstandingProgress({
  manifest,
  draft,
  onContinue,
  onBack,
}: {
  manifest: CaptureManifest
  draft: WorkflowUnderstanding
  onContinue: () => void
  onBack: () => void
}) {
  const [done, setDone] = useState(false)
  const handleDone = useCallback(() => setDone(true), [])

  return (
    <section className="understanding">
      <div className="flow-shell centered">
        <button className="btn ghost back" onClick={onBack}>
          ← Back to capture
        </button>
        <div className="flow-kicker">Build the robot brain</div>
        <h1>Watch the brain read your floor and propose every call.</h1>
        <p className="flow-sub">
          The brain proposes; a deterministic check gates infeasible calls. No media bytes were
          read and no license is granted here — you confirm every assumption next, then the oracle
          scores the frozen workflow.
        </p>

        <StepBridge done="Site captured" next="the brain proposes every call, and a deterministic check gates the unsafe ones." />

        <div className="analysis-card">
          <div className="analysis-ring" aria-hidden="true">{done ? '✓' : '●'}</div>
          <div>
            <strong>{countDeclaredWorkflowInputs(manifest)} declared input(s)</strong>
            <p>{draft.inputManifestSummary}</p>
          </div>
        </div>

        <BrainStream draft={draft} onDone={handleDone} />

        <div className="flow-actions">
          <button className="btn primary hero-action" onClick={onContinue} disabled={!done}>
            Review proposed workflow
          </button>
          <span className="trust-note">Interpretation only · deterministic oracle judges later</span>
        </div>
      </div>
    </section>
  )
}

