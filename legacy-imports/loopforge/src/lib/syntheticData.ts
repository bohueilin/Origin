import incidentsJson from '../data/incidents.json'
import policiesJson from '../data/policies.json'
import toolTracesJson from '../data/toolTraces.json'
import {
  incidentSchema,
  policySnippetSchema,
  toolTraceSchema,
  type Incident,
  type PolicySnippet,
  type ToolTrace,
} from './schemas'

export const incidents: Incident[] = incidentSchema.array().parse(incidentsJson)
export const policies: PolicySnippet[] = policySnippetSchema.array().parse(policiesJson)
export const toolTraces: ToolTrace[] = toolTraceSchema.array().parse(toolTracesJson)

export const incidentBatchSummary = {
  name: 'Fintech subscription dispute batch',
  incidentCount: incidents.length,
  highRiskCount: incidents.filter(
    (incident) => incident.severity === 'HIGH' || incident.severity === 'CRITICAL',
  ).length,
  workflow: 'refund_and_card_dispute_router.v3',
}
