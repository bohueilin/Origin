import { CheckCircle2, CircleAlert, ShieldCheck } from 'lucide-react'
import { DeepDiveButton } from '../app/deepDive'
import { useDeepDive } from '../app/deepDiveContext'
import type { ValidationGate } from '../lib/schemas'

type ValidationMatrixProps = {
  gates: ValidationGate[]
}

export function ValidationMatrix({ gates }: ValidationMatrixProps) {
  const { open } = useDeepDive()
  const pass = gates.filter((gate) => gate.status === 'pass').length
  const allPass = pass === gates.length
  return (
    <section className="panel" aria-labelledby="gates-title">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Validation Gates</p>
          <h2 id="gates-title">Deterministic safety matrix</h2>
        </div>
        <div className="panel-head-actions">
          <span className={allPass ? 'gate-score good' : 'gate-score'}>
            {pass}/{gates.length}
          </span>
          <DeepDiveButton
            onClick={() =>
              open({
                title: 'Guardian gates',
                subtitle: 'Each gate, its severity, and the evidence behind the verdict',
                data: gates,
              })
            }
          />
          <ShieldCheck size={22} aria-hidden="true" />
        </div>
      </div>

      <p className={allPass ? 'panel-takeaway good' : 'panel-takeaway warn'}>
        <ShieldCheck size={16} aria-hidden="true" />
        <span>
          <strong>{pass}/{gates.length} safety gates pass.</strong> The model proposes; these
          deterministic gates decide — they judge the real tool action, so the model can't talk its
          way past them.
        </span>
      </p>

      <div className="gate-matrix">
        {gates.map((gate) => (
          <article className={`gate-row ${gate.status}`} key={gate.id}>
            {gate.status === 'pass' ? (
              <CheckCircle2 size={19} aria-hidden="true" />
            ) : (
              <CircleAlert size={19} aria-hidden="true" />
            )}
            <div>
              <strong>{gate.name}</strong>
              <span>{gate.detail}</span>
            </div>
            <em>{gate.status}</em>
          </article>
        ))}
      </div>
    </section>
  )
}
