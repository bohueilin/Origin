// Read-only SVG render of a DescriptiveSiteMap: dock (start), item, drop, walls,
// hazards, human-only zones — plus an optional agent trail and a "live" cursor cell.
// Pure presentation; the grid it draws is the DETERMINISTICALLY repaired one.

import type { DescriptiveSiteMap } from '../../workflowDraft'
import type { GridPos } from '../../warehouse'

interface FloorGridProps {
  map: DescriptiveSiteMap
  /** Cells the agent has visited so far (drawn as a trail). */
  trail?: GridPos[]
  /** The agent's current cell (pulsing cursor). */
  cursor?: GridPos | null
  /** A vetoed destination cell to flag in red. */
  veto?: GridPos | null
  size?: number
}

const key = (p: GridPos) => `${p.x},${p.y}`

export function FloorGrid({ map, trail = [], cursor, veto, size = 360 }: FloorGridProps) {
  const cell = Math.max(14, Math.floor(size / Math.max(map.width, map.height)))
  const w = cell * map.width
  const h = cell * map.height
  const wallSet = new Set(map.obstacles.map(key))
  const hazSet = new Set(map.hazards.map(key))
  const humanSet = new Set(map.humanOnly.map(key))
  const trailSet = new Set(trail.map(key))

  const cells = []
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const k = `${x},${y}`
      let fill = 'var(--fg-cell)'
      if (wallSet.has(k)) fill = 'var(--fg-wall)'
      else if (hazSet.has(k)) fill = 'var(--fg-haz)'
      else if (humanSet.has(k)) fill = 'var(--fg-human)'
      else if (trailSet.has(k)) fill = 'var(--fg-trail)'
      cells.push(
        <rect key={k} x={x * cell + 1} y={y * cell + 1} width={cell - 2} height={cell - 2} rx={3} fill={fill} stroke="var(--fg-grid)" strokeWidth={1} />,
      )
    }
  }

  const marker = (p: GridPos, label: string, color: string) => (
    <g key={`m-${label}-${p.x}-${p.y}`}>
      <rect x={p.x * cell + 1} y={p.y * cell + 1} width={cell - 2} height={cell - 2} rx={3} fill={color} />
      <text x={p.x * cell + cell / 2} y={p.y * cell + cell / 2 + 4} textAnchor="middle" fontSize={Math.max(9, cell * 0.42)} fontWeight={700} fill="#fff">
        {label}
      </text>
    </g>
  )

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: size, display: 'block' }} role="img" aria-label="Floor occupancy grid">
      {cells}
      {marker(map.start, 'S', 'var(--fg-start)')}
      {marker(map.item, 'P', 'var(--fg-item)')}
      {marker(map.drop, 'D', 'var(--fg-drop)')}
      {veto && (
        <g>
          <rect x={veto.x * cell + 1} y={veto.y * cell + 1} width={cell - 2} height={cell - 2} rx={3} fill="none" stroke="var(--fg-veto)" strokeWidth={3} />
          <line x1={veto.x * cell + 4} y1={veto.y * cell + 4} x2={veto.x * cell + cell - 4} y2={veto.y * cell + cell - 4} stroke="var(--fg-veto)" strokeWidth={3} />
          <line x1={veto.x * cell + cell - 4} y1={veto.y * cell + 4} x2={veto.x * cell + 4} y2={veto.y * cell + cell - 4} stroke="var(--fg-veto)" strokeWidth={3} />
        </g>
      )}
      {cursor && (
        <circle cx={cursor.x * cell + cell / 2} cy={cursor.y * cell + cell / 2} r={cell * 0.28} fill="var(--fg-cursor)" stroke="#fff" strokeWidth={2}>
          <animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  )
}
