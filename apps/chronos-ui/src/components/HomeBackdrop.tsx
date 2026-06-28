/*
 * HomeBackdrop — a static, decorative "proof tree" rendered behind the Home
 * runbook. It reuses the node/edge visual language from the live graph
 * (RunCanvas / ClusterEdge) but renders NO legible text: node cards carry only
 * skeleton bars. A ForkPoint apex sits near top-center and branches fan down
 * and outward, widening per level. The whole SVG is softened (blur + reduced
 * opacity) and a radial mask carves out the central reading zone so foreground
 * copy stays calm and legible.
 *
 * Pure presentation: no React Flow, no state, no timers, no props. Positions
 * are deterministic (seeded hash, never Math.random) so the composition is
 * stable across renders and builds.
 */

type Cluster = 'witness' | 'promising' | 'control' | 'default'

const EDGE_COLOR: Record<Cluster, string> = {
  witness: 'var(--fp-edge-witness)',
  promising: 'var(--fp-edge-promising)',
  control: 'var(--fp-edge-control)',
  default: 'var(--fp-edge-default)',
}

const VIEW_W = 1600
const VIEW_H = 1000
const CENTER_X = VIEW_W / 2
const CARD_W = 142
const CARD_H = 42

/* Apex sits below the headline; each level drops down and fans wider to both
 * sides, with the densest canopy weighted toward the lower edge of the panel. */
const LEVELS: ReadonlyArray<{ y: number; count: number; half: number }> = [
  { y: 360, count: 1, half: 0 },
  { y: 524, count: 4, half: 470 },
  { y: 676, count: 7, half: 700 },
  { y: 822, count: 11, half: 890 },
  { y: 962, count: 15, half: 1040 },
]

/* Deterministic pseudo-random in [0, 1) — keeps left/right balanced but not mirrored. */
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function jitter(seed: number, amp: number): number {
  return (rand(seed) - 0.5) * 2 * amp
}

function clusterFor(level: number, t: number): Cluster {
  if (level === 0) return 'default'
  if (t < 0.36) return 'witness'
  if (t > 0.64) return 'control'
  return 'promising'
}

type FanNode = {
  id: string
  x: number
  y: number
  cluster: Cluster
  root: boolean
  barW: number
  twoBars: boolean
}

type FanEdge = { id: string; d: string; sx: number; sy: number; tx: number; ty: number; cluster: Cluster }

function buildFan(): { nodes: FanNode[]; edges: FanEdge[] } {
  const grid: FanNode[][] = LEVELS.map((lvl, level) =>
    Array.from({ length: lvl.count }, (_, i) => {
      const t = lvl.count === 1 ? 0.5 : i / (lvl.count - 1)
      const cluster = clusterFor(level, t)
      return {
        id: `${level}-${i}`,
        x: CENTER_X + (t - 0.5) * 2 * lvl.half + jitter(level * 31 + i, 30) - CARD_W / 2,
        y: lvl.y + jitter(level * 17 + i + 7, 16),
        cluster,
        root: level === 0,
        barW: 0.52 + rand(level * 13 + i) * 0.26,
        twoBars: rand(level * 7 + i + 3) > 0.45,
      }
    }),
  )

  const edges: FanEdge[] = []
  for (let level = 1; level < LEVELS.length; level += 1) {
    const parents = grid[level - 1]
    const children = grid[level]
    children.forEach((child, i) => {
      const parentIndex = Math.min(parents.length - 1, Math.floor((i * parents.length) / children.length))
      const parent = parents[parentIndex]
      const sx = parent.x + CARD_W / 2
      const sy = parent.y + CARD_H
      const tx = child.x + CARD_W / 2
      const ty = child.y
      const midY = sy + (ty - sy) / 2
      const d =
        Math.abs(sx - tx) < 28
          ? `M ${sx} ${sy} L ${sx} ${ty}`
          : `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`
      edges.push({ id: `e-${parent.id}-${child.id}`, d, sx, sy, tx, ty, cluster: child.cluster })
    })
  }

  return { nodes: grid.flat(), edges }
}

const { nodes: FAN_NODES, edges: FAN_EDGES } = buildFan()

/* Calm clearing over the runbook; nodes resolve toward the lower edge and sides. */
const MASK =
  'radial-gradient(112% 82% at 50% 44%, transparent 0%, transparent 30%, rgba(0,0,0,0.5) 52%, rgba(0,0,0,0.94) 100%)'

export function HomeBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 select-none"
      style={{ maskImage: MASK, WebkitMaskImage: MASK }}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full opacity-[0.82] blur-[0.7px]"
        role="presentation"
      >
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {FAN_EDGES.map((edge) => (
            <g key={edge.id}>
              <path d={edge.d} stroke={EDGE_COLOR[edge.cluster]} strokeWidth={2} />
              <circle cx={edge.sx} cy={edge.sy} r={3.5} fill={EDGE_COLOR[edge.cluster]} />
              <circle cx={edge.tx} cy={edge.ty} r={3.5} fill={EDGE_COLOR[edge.cluster]} />
            </g>
          ))}
        </g>
        {FAN_NODES.map((node) => (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={CARD_W}
              height={CARD_H}
              rx={8}
              fill="var(--ds-surface-raised)"
              stroke={node.root ? 'var(--ds-accent-strong)' : 'var(--ds-stroke)'}
              strokeWidth={node.root ? 1.5 : 1}
            />
            <rect x={node.x + 13} y={node.y + 13} width={(CARD_W - 26) * node.barW} height={6} rx={3} fill="var(--ds-neutral-300)" />
            {node.twoBars && (
              <rect x={node.x + 13} y={node.y + 25} width={(CARD_W - 26) * 0.42} height={5} rx={2.5} fill="var(--ds-neutral-200)" />
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}
