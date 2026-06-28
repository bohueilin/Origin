// A small "what just happened → what's next" handoff line shown under each funnel
// step's header. It stitches the journey together: every step opens by naming the
// artifact the previous step produced, then points at what this step will do.

export function StepBridge({ done, next }: { done?: string; next?: string }) {
  return (
    <div className="step-bridge" role="note">
      {done && (
        <span className="sb-done">
          <span className="sb-check" aria-hidden="true">✓</span>
          {done}
        </span>
      )}
      {done && next && (
        <span className="sb-arrow" aria-hidden="true">→</span>
      )}
      {next && (
        <span className="sb-next">
          <span className="sb-next-k">Next</span>
          {next}
        </span>
      )}
    </div>
  )
}
