// Bright, premium progress rail shown across the authoring flow so the operator
// always knows where they are: Capture -> Understand -> Align -> License test -> License.

const STEPS = ['Capture', 'Understand', 'Align', 'License test', 'License'] as const

// Map each app view to a step index. Returns -1 for views outside the flow
// (landing / showcase) so the rail hides itself.
const VIEW_STEP: Record<string, number> = {
  capture: 0,
  understanding: 1,
  reflect: 2,
  illustrate: 2,
  preview: 3,
  results: 4,
}

export function FlowStepper({ view }: { view: string }) {
  const current = VIEW_STEP[view] ?? -1
  if (current < 0) return null

  return (
    <nav className="flow-stepper" aria-label="Workflow progress">
      <ol>
        {STEPS.map((label, i) => {
          const state = i < current ? 'done' : i === current ? 'active' : 'todo'
          return (
            <li key={label} className={`step step-${state}`} aria-current={state === 'active' ? 'step' : undefined}>
              <span className="step-dot" aria-hidden="true">
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span className="step-label">{label}</span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
