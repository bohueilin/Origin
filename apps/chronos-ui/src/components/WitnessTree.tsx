import { clsx } from 'clsx'
import type { BranchRun, ForkPoint } from '../domain/types'

/**
 * A compact, read-only render of the run's branch tree — the same fork → branch
 * structure shown on the canvas, drawn as labelled boxes to match the run
 * minimap. Used inside the replay / pre-attack modals to place the focused node
 * in the context of its lineage.
 */

const W = 172
const H = 44

function edgeColor(status: string): string {
  if (status === 'witness') return 'var(--fp-edge-witness)'
  if (status === 'promising' || status === 'qa_review') return 'var(--fp-edge-promising)'
  return 'var(--fp-edge-control)'
}

const nodeId = (b: BranchRun) => b.runId.replace('run-', '')

export function WitnessTree({
  forkPoint,
  branches,
  focusId,
  mode,
}: {
  forkPoint?: ForkPoint
  branches: BranchRun[]
  focusId: string
  mode: 'replay' | 'preattack'
}) {
  const laid = branches.filter((b) => b.layout)
  if (!laid.length) return null

  const byId: Record<string, BranchRun> = {}
  laid.forEach((b) => (byId[nodeId(b)] = b))

  // Synthetic root (the ForkPoint), centered above its direct children.
  const rootChildren = laid.filter((b) => !b.parentNodeId)
  const centerX = rootChildren.reduce((s, b) => s + b.layout!.x + W / 2, 0) / Math.max(rootChildren.length, 1)
  const minChildY = Math.min(...laid.map((b) => b.layout!.y))
  const pos: Record<string, { x: number; y: number }> = { fork: { x: centerX - W / 2, y: minChildY - 132 } }
  laid.forEach((b) => (pos[nodeId(b)] = { x: b.layout!.x, y: b.layout!.y }))

  // Lineage from the focused branch up to the fork.
  const onPath = new Set<string>(['fork'])
  let walker: string | undefined = focusId
  while (walker && byId[walker]) {
    onPath.add(walker)
    walker = byId[walker].parentNodeId ?? 'fork'
    if (walker === 'fork') break
  }
  const focusNode = mode === 'preattack' ? 'fork' : focusId

  const xs = Object.values(pos).map((p) => p.x)
  const ys = Object.values(pos).map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const pad = 26
  const vbW = Math.max(...xs) + W - minX + pad * 2
  const vbH = Math.max(...ys) + H - minY + pad * 2

  const cx = (id: string) => pos[id].x + W / 2

  return (
    <svg viewBox={`${minX - pad} ${minY - pad} ${vbW} ${vbH}`} className="w-full" style={{ maxHeight: 200 }}>
      {laid.map((b) => {
        const child = nodeId(b)
        const parent = b.parentNodeId ?? 'fork'
        if (!pos[parent]) return null
        const lit = onPath.has(child) && onPath.has(parent)
        return (
          <line
            key={`e-${child}`}
            x1={cx(parent)}
            y1={pos[parent].y + H}
            x2={cx(child)}
            y2={pos[child].y}
            stroke={edgeColor(b.status)}
            strokeWidth={lit ? 4 : 2}
            opacity={lit ? 1 : 0.3}
          />
        )
      })}
      {Object.keys(pos).map((id) => {
        const isFork = id === 'fork'
        const isFocus = id === focusNode
        const lit = onPath.has(id)
        const color = isFork ? 'var(--fp-edge-witness)' : edgeColor(byId[id]?.status ?? '')
        const stroke = lit ? color : undefined
        return (
          <g key={id} opacity={lit ? 1 : 0.45}>
            {isFocus && (
              <rect
                x={pos[id].x - 7}
                y={pos[id].y - 7}
                width={W + 14}
                height={H + 14}
                rx={13}
                fill="none"
                stroke={color}
                strokeWidth={2}
                opacity={0.5}
              />
            )}
            <rect
              x={pos[id].x}
              y={pos[id].y}
              width={W}
              height={H}
              rx={9}
              className={clsx(lit || isFork ? 'fill-surface-raised' : 'fill-surface-sunken', !stroke && 'stroke-stroke')}
              stroke={stroke}
              strokeWidth={isFocus ? 5 : lit ? 3 : 2}
            />
            <text
              x={cx(id)}
              y={pos[id].y + H / 2 + 5}
              textAnchor="middle"
              className={clsx('fill-ink-primary', !lit && 'fill-ink-tertiary')}
              style={{ fontSize: 15, fontWeight: lit ? 600 : 500 }}
            >
              {label(isFork ? (forkPoint?.label ?? 'ForkPoint') : byId[id]?.title ?? id)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function label(s: string): string {
  return s.length > 22 ? `${s.slice(0, 21)}…` : s
}
