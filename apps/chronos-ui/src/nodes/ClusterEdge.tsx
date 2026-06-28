import { BaseEdge, type EdgeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'

const COLORS: Record<string, string> = {
  witness: 'var(--fp-edge-witness)',
  promising: 'var(--fp-edge-promising)',
  control: 'var(--fp-edge-control)',
  default: 'var(--fp-edge-default)',
}

/** Handles on sibling nodes can differ by a few px — still one vertical edge. */
const VERTICAL_EPS = 32

function getClusterEdgePath(sourceX: number, sourceY: number, targetX: number, targetY: number) {
  const dx = Math.abs(sourceX - targetX)
  if (dx < VERTICAL_EPS) {
    const x = (sourceX + targetX) / 2
    return {
      path: `M ${x} ${sourceY} L ${x} ${targetY}`,
      sourceDot: { cx: x, cy: sourceY },
      targetDot: { cx: x, cy: targetY },
    }
  }
  const midY = sourceY + (targetY - sourceY) / 2
  return {
    path: `M ${sourceX} ${sourceY} L ${sourceX} ${midY} L ${targetX} ${midY} L ${targetX} ${targetY}`,
    sourceDot: { cx: sourceX, cy: sourceY },
    targetDot: { cx: targetX, cy: targetY },
  }
}

export function ClusterEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps) {
  const { path, sourceDot, targetDot } = getClusterEdgePath(sourceX, sourceY, targetX, targetY)
  const color = COLORS[(data?.cluster as string) ?? 'default']
  const className = ['fp-cluster-edge', data?.entering ? 'fp-enter' : undefined, data?.revealed ? 'fp-enter-revealed' : undefined].filter(Boolean).join(' ')
  const style = data?.enterDelay ? ({ '--fp-enter-delay': data.enterDelay as string } as CSSProperties) : undefined
  return (
    <g className={className} style={style}>
      <BaseEdge path={path} style={{ stroke: color, strokeWidth: 1.5 }} />
      <circle cx={sourceDot.cx} cy={sourceDot.cy} r={3} fill={color} />
      <circle cx={targetDot.cx} cy={targetDot.cy} r={3} fill={color} />
    </g>
  )
}

export const edgeTypes = { cluster: ClusterEdge }
