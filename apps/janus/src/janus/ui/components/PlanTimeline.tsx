import type { AgentView, PlanStep } from '../../types'
import type { JanusSnapshot } from '../../engine/session'
import { Section } from '../bits'

const ICON: Record<PlanStep['status'], string> = {
  pending: '○',
  running: '◍',
  awaiting_approval: '⏸',
  done: '✓',
  denied: '✕',
  blocked: '⊘',
  skipped: '–',
}

export function PlanTimeline({ snap }: { snap: JanusSnapshot }) {
  const { plan, agents, activeAgentId } = snap
  const byId = new Map<string, AgentView>(agents.map((a) => [a.id, a]))
  const doneCount = plan.steps.filter((s) => s.status === 'done').length
  const pct = Math.round((doneCount / Math.max(1, plan.steps.length)) * 100)

  return (
    <Section
      kicker="5 · Multi-step plan"
      title="The agent proposes; Janus gates"
      aside={<span className="pp-count">{doneCount}/{plan.steps.length} done</span>}
    >
      <div className="pp-progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      <ol className="pp-timeline">
        {plan.steps.map((step) => {
          const agent = step.agent_id ? byId.get(step.agent_id) : undefined
          const isActive = Boolean(agent && step.agent_id === activeAgentId && step.status !== 'done' && step.status !== 'denied')
          return (
            <li
              key={step.step_id}
              className={`pp-step pp-step-${step.status} ${step.kind === 'approval' ? 'pp-step-gate' : ''} ${isActive ? 'pp-step-active' : ''}`}
            >
              <span className="pp-step-icon" aria-hidden="true">
                {step.status === 'awaiting_approval' ? '🔒' : ICON[step.status]}
              </span>
              <div className="pp-step-body">
                <div className="pp-step-head">
                  <span className="pp-step-title">{step.title}</span>
                  {agent && (
                    <span className="pp-step-agent" style={{ ['--hue' as string]: agent.hue }}>
                      <span className="pp-step-agent-mono">{agent.mono}</span>
                      {agent.name}
                    </span>
                  )}
                  {step.kind === 'approval' && <span className="pp-step-tag">approval gate</span>}
                  {step.capability && <code className="pp-step-cap">{step.capability}</code>}
                </div>
                <div className="pp-step-desc">{step.description}</div>
                {isActive && (
                  <div className="pp-step-working" aria-hidden="true">
                    working<span className="pp-think-dots"><i /><i /><i /></span>
                  </div>
                )}
                {step.output_summary && <div className="pp-step-out">{step.output_summary}</div>}
              </div>
            </li>
          )
        })}
      </ol>
      <div className="pp-fallback">
        <b>Fallback:</b> {plan.fallback_plan}
      </div>
    </Section>
  )
}
