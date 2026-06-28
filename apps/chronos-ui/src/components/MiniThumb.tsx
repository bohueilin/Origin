import type { BranchRun } from '../domain/types'

const WIDTH = 176
const HEIGHT = 56
const PAD_X = 10
const PAD_TOP = 6
const PAD_BOTTOM = 8
const NODE_W = 24
const NODE_H = 7

function nodeId(branch: BranchRun) {
  return branch.runId.replace('run-', '')
}

function edgeColor(branch: BranchRun) {
  if (branch.status === 'witness') return 'var(--fp-edge-witness)'
  if (branch.status === 'promising' || branch.status === 'verifying' || branch.status === 'qa_review' || branch.status === 'rewarded' || branch.status === 'snapshot') {
    return 'var(--fp-edge-promising)'
  }
  if (branch.status === 'control' || branch.status === 'control_pass') return 'var(--fp-edge-control)'
  return 'var(--fp-edge-default)'
}

function nodeClass(branch?: BranchRun, selected?: boolean) {
  if (selected || branch?.status === 'witness') return 'fill-surface-raised'
  return 'fill-surface-sunken'
}

function layoutTree(branches: BranchRun[]) {
  const laid = branches.filter((branch) => branch.layout)
  if (!laid.length) return null

  const minX = Math.min(...laid.map((branch) => branch.layout!.x))
  const maxX = Math.max(...laid.map((branch) => branch.layout!.x))
  const minY = Math.min(...laid.map((branch) => branch.layout!.y))
  const maxY = Math.max(...laid.map((branch) => branch.layout!.y))
  const rootChildren = laid.filter((branch) => !branch.parentNodeId)
  const rootSource = rootChildren.length ? rootChildren : laid
  const rootRawX = rootSource.reduce((sum, branch) => sum + branch.layout!.x, 0) / rootSource.length

  const scaleX = (WIDTH - PAD_X * 2 - NODE_W) / Math.max(maxX - minX, 1)
  const scaleY = (HEIGHT - PAD_TOP - PAD_BOTTOM - NODE_H - 10) / Math.max(maxY - minY, 1)
  const point = (x: number, y: number) => ({
    x: PAD_X + (x - minX) * scaleX,
    y: PAD_TOP + 10 + (y - minY) * scaleY,
  })

  const positions: Record<string, { x: number; y: number }> = {
    fork: {
      x: PAD_X + (rootRawX - minX) * scaleX,
      y: PAD_TOP,
    },
  }

  laid.forEach((branch) => {
    positions[nodeId(branch)] = point(branch.layout!.x, branch.layout!.y)
  })

  return { branches: laid, positions }
}

/** Compact run minimap thumbnail shown in the run-summary footer. */
export function MiniThumb({
  variant = 'tree',
  branches = [],
  selectedId,
}: {
  variant?: 'row' | 'tree'
  branches?: BranchRun[]
  selectedId?: string
}) {
  const tree = variant === 'tree' ? layoutTree(branches) : null

  return (
    <div className="relative h-14 w-44 rounded-lg border border-hairline bg-surface-raised">
      <svg viewBox="0 0 176 56" className="h-full w-full p-2">
        {variant === 'row' ? (
          <>
            <rect x="6" y="20" width="34" height="16" rx="3" className="fill-surface-sunken stroke-stroke" />
            <rect x="62" y="20" width="34" height="16" rx="3" className="fill-surface-sunken stroke-stroke" />
            <rect x="118" y="18" width="36" height="20" rx="3" className="fill-none" stroke="var(--ds-green-500)" />
            <line x1="40" y1="28" x2="62" y2="28" stroke="var(--ds-green-500)" />
            <line x1="96" y1="28" x2="118" y2="28" stroke="var(--ds-green-500)" />
          </>
        ) : tree ? (
          <>
            {tree.branches.map((branch) => {
              const id = nodeId(branch)
              const parent = branch.parentNodeId ?? 'fork'
              const source = tree.positions[parent]
              const target = tree.positions[id]
              if (!source || !target) return null

              return (
                <polyline
                  key={`e-${id}`}
                  points={`${source.x + NODE_W / 2},${source.y + NODE_H} ${target.x + NODE_W / 2},${target.y}`}
                  fill="none"
                  stroke={edgeColor(branch)}
                  strokeWidth={branch.status === 'witness' ? 1.35 : 1}
                  strokeLinecap="round"
                />
              )
            })}
            <rect
              x={tree.positions.fork.x}
              y={tree.positions.fork.y}
              width={NODE_W}
              height={NODE_H}
              rx="2"
              className="fill-surface-raised"
              stroke="var(--fp-edge-witness)"
              strokeWidth="1.25"
            />
            {tree.branches.map((branch) => {
              const id = nodeId(branch)
              const selected = id === selectedId
              const position = tree.positions[id]
              return (
                <rect
                  key={id}
                  x={position.x}
                  y={position.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx="2"
                  className={`${nodeClass(branch, selected)} stroke-stroke`}
                  stroke={selected ? 'var(--fp-edge-witness)' : undefined}
                  strokeWidth={selected ? 1.5 : 1}
                />
              )
            })}
          </>
        ) : (
          <>
            <rect x="74" y="4" width="28" height="9" rx="2" className="fill-none" stroke="var(--ds-green-500)" />
            <line x1="88" y1="13" x2="36" y2="24" stroke="var(--ds-green-500)" />
            <line x1="88" y1="13" x2="88" y2="24" stroke="var(--fp-edge-promising)" />
            <line x1="88" y1="13" x2="140" y2="24" stroke="var(--ds-neutral-700)" />
            <rect x="22" y="24" width="28" height="8" rx="2" className="fill-surface-sunken stroke-stroke" />
            <rect x="74" y="24" width="28" height="8" rx="2" className="fill-surface-sunken stroke-stroke" />
            <rect x="126" y="24" width="28" height="8" rx="2" className="fill-surface-sunken stroke-stroke" />
            <rect x="8" y="42" width="24" height="7" rx="2" className="fill-surface-sunken stroke-stroke" />
            <rect x="40" y="42" width="24" height="7" rx="2" className="fill-surface-sunken stroke-stroke" />
            <rect x="74" y="42" width="24" height="7" rx="2" className="fill-surface-sunken stroke-stroke" />
          </>
        )}
      </svg>
    </div>
  )
}
