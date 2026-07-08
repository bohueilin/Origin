// Planner — turns a scenario script into an AgentPlan: an ordered list of steps with the
// approval gates marked. The plan is what the agent *proposes*; Janus decides what may run.

import type { AgentPlan, PlanStep, UserIntent } from '../types'
import type { ScenarioSpec } from '../scenarios/types'
import { getConnector } from '../connectors'
import { workerForTool } from '../agents'
import type { IdFactory } from './ids'

export const Planner = {
  build(scenario: ScenarioSpec, intent: UserIntent, riskNotes: string[], idf: IdFactory): AgentPlan {
    const steps: PlanStep[] = scenario.steps.map((spec, index) => {
      const base = { step_id: idf.next('step'), index, status: 'pending' as const }
      if (spec.kind === 'note') {
        return { ...base, kind: 'note', title: spec.title, description: spec.description }
      }
      if (spec.kind === 'tool') {
        const adapter = getConnector(spec.tool)
        return {
          ...base,
          kind: 'tool',
          title: spec.title,
          description: spec.description,
          tool_name: spec.tool,
          capability: adapter?.requiredCapability,
          agent_id: workerForTool(spec.tool).id,
        }
      }
      // approval
      return {
        ...base,
        kind: 'approval',
        title: spec.title,
        description: spec.description,
        tool_name: spec.commitTool,
        capability: spec.packet.capability,
        agent_id: workerForTool(spec.commitTool).id,
      }
    })

    const tools_required = uniq(
      scenario.steps.flatMap((s) => (s.kind === 'tool' ? [s.tool] : s.kind === 'approval' ? [s.commitTool] : [])),
    )
    const approval_points = steps.filter((s) => s.kind === 'approval').map((s) => s.step_id)

    return {
      plan_id: idf.next('plan'),
      intent_id: intent.intent_id,
      steps,
      tools_required,
      approval_points,
      risk_notes: riskNotes,
      fallback_plan: scenario.fallback_plan,
    }
  },
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}
