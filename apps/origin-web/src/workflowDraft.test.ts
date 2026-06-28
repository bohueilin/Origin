import { describe, expect, it } from 'vitest'
import { createCaptureManifest, fileMetaToCaptureItem } from './captureManifest'
import { buildEnvironmentPlan, type EnvironmentRequirement } from './environmentPlan'
import { bfsOracle } from './warehouse'
import { freezeWorkflow, frozenToPlanInput, proposeUnderstanding } from './workflowDraft'

const req: EnvironmentRequirement = {
  outcome: 'A robot assistant for my dad’s factory that moves totes safely.',
  domain: 'manufacturing',
  embodiment: 'humanoid',
}

const manifest = createCaptureManifest({
  outcome: req.outcome,
  domain: req.domain,
  expectedEmbodiment: req.embodiment,
  description: 'Dad moves totes from receiving to packing.',
  safetyRules: ['Never enter operator-only cells'],
  items: [fileMetaToCaptureItem({ name: 'dad-floor.mp4', type: 'video/mp4', size: 1024 }, 0)],
})

describe('workflowDraft', () => {
  it('proposes a deterministic draft for the same capture manifest', () => {
    expect(proposeUnderstanding(manifest)).toEqual(proposeUnderstanding(manifest))
  })

  it('freezes to a stable hash and serializable snapshot', () => {
    const frozen = freezeWorkflow(proposeUnderstanding(manifest))
    expect(frozen.approvedFactsHash).toBe(freezeWorkflow(proposeUnderstanding(manifest)).approvedFactsHash)
    expect(JSON.stringify(frozen)).not.toContain('File')
    expect(frozen.terminalRules.refuse[0].state).toBe('confirmed')
  })

  it('emits only safe plan levers and descriptive provenance', () => {
    const input = frozenToPlanInput(freezeWorkflow(proposeUnderstanding(manifest)))
    const text = JSON.stringify(input)
    expect(input.embodiment).toBe('humanoid')
    expect(input.domain).toBe('manufacturing')
    expect(input.selectedTaskIds?.length).toBeGreaterThan(0)
    expect(text).not.toMatch(/reward|license|battery|maxSteps|hazards|humanOnly|label/i)
    // Trust boundary: descriptive deployment intent (robots) and the full site map
    // must NOT cross into the plan lever payload.
    expect(text).not.toMatch(/robots/i)
    expect(text).not.toMatch(/siteMap/i)
  })

  it('keeps oracle labels derived from BFS over selected tasks', () => {
    const frozen = freezeWorkflow(proposeUnderstanding(manifest))
    const plan = buildEnvironmentPlan(req, frozenToPlanInput(frozen))
    for (const task of plan.tasks) {
      expect(['finish', 'escalate', 'refuse']).toContain(bfsOracle(task).label)
    }
  })
})
