// Premium one-click voice intake. Click the mic, speak the site in plain words,
// and the fields fill themselves (structured server-side by MiniMax). Built for
// non-typists: large target, clear states, live transcript, reduced-motion safe.
// Authoring only — the human reviews the fields and the deterministic oracle judges.

import { useVoiceWorkflow, type VoiceFields } from '../useVoiceWorkflow'

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function VoiceInput({
  onFields,
}: {
  onFields: (fields: VoiceFields, opts: { fallback: boolean }) => void
}) {
  const { state, transcript, error, seconds, supported, start, stop, reset } = useVoiceWorkflow(onFields)

  if (!supported) {
    return (
      <div className="voice unsupported">
        <span className="voice-icon" aria-hidden="true">🎤</span>
        <p>Voice input needs Chrome, Edge, or Safari. You can still type the fields below.</p>
      </div>
    )
  }

  const listening = state === 'listening'
  const processing = state === 'processing'

  return (
    <div className={`voice voice-${state}`}>
      <div className="voice-row">
        {state === 'idle' || state === 'error' ? (
          <button className="voice-btn" onClick={start} aria-label="Speak your site to fill the form">
            <span className="voice-mic" aria-hidden="true">🎤</span>
            Speak your site
          </button>
        ) : listening ? (
          <button className="voice-btn voice-stop" onClick={stop} aria-label="Stop recording">
            <span className="voice-pulse" aria-hidden="true" />
            Stop · {fmt(seconds)}
          </button>
        ) : processing ? (
          <span className="voice-btn voice-working" aria-live="polite">
            <span className="voice-spinner" aria-hidden="true" />
            Structuring your words…
          </span>
        ) : (
          <button className="voice-btn voice-again" onClick={reset} aria-label="Record again">
            <span className="voice-mic" aria-hidden="true">↺</span>
            Record again
          </button>
        )}

        <span className="voice-hint">
          {state === 'idle' && 'No typing needed — just describe the workplace out loud.'}
          {listening && 'Listening… click stop when you’re done.'}
          {processing && 'Cleaning up and filling the fields below.'}
          {state === 'success' && 'Done — we filled Outcome, Workflow, and Safety rules. Review them below.'}
          {state === 'error' && (error ?? 'Something went wrong — try again or type below.')}
        </span>
      </div>

      {(listening || (transcript && state !== 'idle')) && (
        <p className="voice-transcript" aria-live="polite">
          {transcript || 'Go ahead…'}
        </p>
      )}

      <p className="voice-note">
        Your browser does the speech-to-text; the server receives text only. AI proposes; you
        approve; the deterministic oracle still judges.
      </p>
    </div>
  )
}
