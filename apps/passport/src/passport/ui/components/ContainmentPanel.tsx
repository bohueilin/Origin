import { useEffect, useState } from 'react'
import { Section } from '../bits'
import { runCordonTellDemo, type CordonTellResult, type CordonTellStep } from '../../engine/cordonTell'

// Surfaces the REAL Cordon + Tell loop (measured intent + blast-radius containment) over the
// live engine + tamper-evident trace. Runs runCordonTellDemo() client-side on mount — the same
// deterministic harness the e2e test asserts — so what's on screen is what the gate actually did.

interface StepView {
  meaning: string
  who: string // which core fired
}

// Deterministic demo → fixed, honest captions keyed to (tool, status).
function describe(step: CordonTellStep): StepView {
  if (step.tool === 'calendar.read' && step.status === 'ok') return { meaning: 'In-plan read — declared == measured == action, so it runs.', who: 'Gate' }
  if (step.tool === 'payments.refund') return { meaning: 'Injected, out-of-plan. Tell measures the intent and blocks it BEFORE it runs — and taints the agent.', who: 'Tell' }
  if (step.tool === 'credential.login') return { meaning: 'The tainted agent asks for a credential. Cordon refuses at the broker — the secret is never fetched.', who: 'Cordon' }
  if (step.tool === 'calendar.read' && step.status === 'denied') return { meaning: 'The agent is quarantined. Nothing further is permitted.', who: 'Cordon' }
  return { meaning: step.note, who: 'Gate' }
}

const STATUS_LABEL: Record<string, string> = { ok: 'allowed', denied: 'blocked', error: 'refused' }

export function ContainmentPanel() {
  const [r, setR] = useState<CordonTellResult | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    runCordonTellDemo({ now: () => 1_000_000 })
      .then((res) => live && setR(res))
      .catch((e) => live && setErr(e instanceof Error ? e.message : 'demo failed'))
    return () => {
      live = false
    }
  }, [])

  if (err) {
    return (
      <Section kicker="Cordon × Tell" title="Containment demo">
        <p className="pp-muted">Couldn’t run the containment demo: {err}</p>
      </Section>
    )
  }
  if (!r) {
    return (
      <Section kicker="Cordon × Tell" title="Containment demo">
        <p className="pp-muted">Running the loop over the live engine…</p>
      </Section>
    )
  }

  return (
    <Section
      kicker="Cordon × Tell — measured intent + blast-radius containment"
      title="One injected action, contained end-to-end"
      aside={
        <span className={`pp-verify ${r.traceVerified ? 'pp-verify-ok' : 'pp-verify-bad'}`}>
          {r.traceVerified ? '✓ trace re-verified' : '✕ trace broken'}
        </span>
      }
    >
      <p className="pp-cd-intro">
        The assistant was mandated to <strong>read the calendar</strong> and <strong>log in</strong>. Mid-run, injected
        content tries to <strong>move money</strong>. Every step below ran through the real gate + tamper-evident trace.
      </p>

      <ol className="pp-cd-steps">
        {r.steps.map((step, i) => {
          const v = describe(step)
          return (
            <li key={i} className={`pp-cd-step pp-cd-${step.status}`}>
              <span className="pp-cd-idx">{i + 1}</span>
              <div className="pp-cd-body">
                <div className="pp-cd-line">
                  <code className="pp-cd-tool">{step.tool}</code>
                  <span className={`pp-cd-pill pp-cd-pill-${step.status}`}>{STATUS_LABEL[step.status] ?? step.status}</span>
                  <span className="pp-cd-who">{v.who}</span>
                </div>
                <p className="pp-cd-meaning">{v.meaning}</p>
              </div>
              {step.tool === 'credential.login' && (
                <div className="pp-cd-freeze">
                  🧊 Cordon freezes the poisoned sub-tree — blast radius <strong>{r.blastRadius}</strong> (the agent + the
                  child it delegated to). The rest of the system keeps working.
                </div>
              )}
            </li>
          )
        })}
      </ol>

      <div className="pp-cd-stats">
        <div className="pp-cd-stat">
          <span className="pp-cd-num">{r.secretFetches}</span>
          <span className="pp-cd-lbl">secrets fetched for the tainted agent</span>
        </div>
        <div className="pp-cd-stat">
          <span className="pp-cd-num">{r.blastRadius}</span>
          <span className="pp-cd-lbl">agents contained (blast radius)</span>
        </div>
        <div className="pp-cd-stat">
          <span className="pp-cd-num">{r.trace.events.length}</span>
          <span className="pp-cd-lbl">events in the tamper-evident trace</span>
        </div>
      </div>
    </Section>
  )
}
