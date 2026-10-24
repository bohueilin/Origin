// One floor-total line, used everywhere the proving ground states a count (the
// editor bar, the plan, the playback and the oracle record), always in the same
// order and always labelled, so no section ever shows a bare "3 of 3".
import type { DescriptiveSiteMap } from '../workflowDraft'
import type { RobotEmbodiment } from '../environmentPlan'
import { floorCounts } from './floorCounts'

const count = (n: number, one: string, many: string) => (
  <span className="count-strip__n">
    <b>{n}</b> {n === 1 ? one : many}
  </span>
)

export function FloorCountStrip({ map, fallback }: { map: DescriptiveSiteMap; fallback: RobotEmbodiment }) {
  const c = floorCounts(map, fallback)
  return (
    <p className="count-strip">
      <span className="count-strip__label">Floor total</span>
      {count(c.robots, 'robot', 'robots')}
      <span className="count-strip__sep" aria-hidden="true">·</span>
      {count(c.fleets, 'fleet', 'fleets')}
      <span className="count-strip__sep" aria-hidden="true">·</span>
      {count(c.items, 'item to deliver', 'items to deliver')}
      <span className="count-strip__sep" aria-hidden="true">·</span>
      {count(c.robotTypes, 'robot type scored', 'robot types scored')}
    </p>
  )
}
