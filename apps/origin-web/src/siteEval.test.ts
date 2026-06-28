import { describe, expect, it } from 'vitest'
import { evaluateDrawnSite } from './siteEval'
import type { DescriptiveSiteMap } from './workflowDraft'

const floor = (over: Partial<DescriptiveSiteMap> = {}): DescriptiveSiteMap => ({
  width: 6,
  height: 5,
  start: { x: 0, y: 2 },
  item: { x: 2, y: 2 },
  drop: { x: 5, y: 2 },
  obstacles: [],
  hazards: [],
  humanOnly: [],
  robots: [{ x: 0, y: 0 }],
  ...over,
})

describe('evaluateDrawnSite — trust boundary', () => {
  it('robot placement is descriptive: moving/adding robots does not change the verdict', () => {
    const a = evaluateDrawnSite(floor({ robots: [{ x: 0, y: 0 }] }), 'humanoid')
    const b = evaluateDrawnSite(floor({ robots: [{ x: 4, y: 4 }] }), 'humanoid')
    const c = evaluateDrawnSite(floor({ robots: [] }), 'humanoid')
    const d = evaluateDrawnSite(floor({ robots: [{ x: 1, y: 0 }, { x: 3, y: 4 }, { x: 5, y: 0 }] }), 'humanoid')
    expect(b.verdict).toBe(a.verdict)
    expect(c.verdict).toBe(a.verdict)
    expect(d.verdict).toBe(a.verdict)
    // The scored start is the fixed map anchor, never a robot cell.
    expect(a.task.start).toEqual({ x: 0, y: 2 })
    expect(d.task.start).toEqual({ x: 0, y: 2 })
  })

  it('hazards around the item flip the verdict to refuse (oracle, not robots)', () => {
    const safe = evaluateDrawnSite(floor(), 'humanoid')
    expect(safe.verdict).toBe('finish')
    const boxed = evaluateDrawnSite(
      floor({
        hazards: [
          { x: 1, y: 2 },
          { x: 3, y: 2 },
          { x: 2, y: 1 },
          { x: 2, y: 3 },
        ],
      }),
      'humanoid',
    )
    expect(boxed.verdict).toBe('refuse')
  })
})
