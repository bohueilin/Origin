import type { Edge, Node } from '@xyflow/react'
import type { BranchRun, ForkPoint } from '../domain/types'
import type { BranchNodeData } from '../lib/types'

type N = Node<BranchNodeData>
type EdgeCluster = 'witness' | 'promising' | 'control' | 'default'

function shortId(b: BranchRun): string {
  return b.runId.replace('run-', '')
}

const CLUSTER_COLOR: Record<string, EdgeCluster> = {
  whitespace: 'witness',
  pytest: 'promising',
  control: 'control',
}

function edgeCluster(b: BranchRun): EdgeCluster {
  if (b.status === 'witness') return 'witness'
  if (b.status === 'control' || b.status === 'control_pass') return 'control'
  if (b.status === 'promising' || b.status === 'verifying' || b.status === 'qa_review' || b.status === 'rewarded') return 'promising'
  return CLUSTER_COLOR[b.clusterId ?? ''] ?? 'default'
}

/** Map a domain BranchStatus onto the node's visual display fields. */
function display(b: BranchRun): Partial<BranchNodeData> {
  switch (b.status) {
    case 'witness':
      return { status: 'witness', tag: 'CONFIRMED', verdict: 'ok' }
    case 'promising':
      return { status: 'promising', tag: 'CANDIDATE', verdict: 'none' }
    case 'verifying':
      return { status: 'verifying', tag: 'VERIFYING', verdict: 'running' }
    case 'qa_review':
      return { status: 'qa-review', tag: 'QA CHECK', verdict: 'warn' }
    case 'control':
      return { status: 'control', tag: 'BASELINE', verdict: 'none' }
    case 'control_pass':
      return { status: 'control-pass', tag: 'BASELINE PASS', verdict: 'ok' }
    case 'dead_end':
      return { status: 'dead-end', tag: 'DEAD END', verdict: 'fail' }
    case 'duplicate':
      return { status: 'duplicate', tag: 'DUPLICATE', verdict: 'none' }
    case 'rewarded':
      return { status: 'rewarded', tag: 'REWARDED', verdict: 'ok' }
    case 'snapshot':
      return { status: 'snapshot' }
    default:
      return { status: 'plain' }
  }
}

/**
 * Derive the React Flow graph (forkpoint + branch nodes + cluster-colored
 * edges) from the live domain records. Selection is reflected via node.selected.
 */
export function buildRunGraph(forkPoint: ForkPoint | undefined, branches: BranchRun[], selectedId?: string): { nodes: N[]; edges: Edge[] } {
  if (!forkPoint) return { nodes: [], edges: [] }

  // Fixed position — do not recompute from streaming branches or the node drifts
  // as top-level children appear. Keep the fork centered over the final tree.
  const forkX = 619

  const forkNode: N = {
    id: 'fork',
    type: 'forkpoint',
    position: { x: forkX, y: 0 },
    selected: selectedId === 'fork',
    data: {
      kind: 'forkpoint',
      title: 'QA ForkPoint',
      status: 'root',
      hasChevron: true,
      meta: `step ${forkPoint.upToStep}`,
    },
  }

  const branchNodes: N[] = branches.map((b) => {
    const id = shortId(b)
    const disp = display(b)
    return {
      id,
      type: b.layout?.nodeType ?? 'branch',
      position: { x: b.layout?.x ?? 0, y: b.layout?.y ?? 0 },
      selected: id === selectedId,
      data: {
        kind: (b.layout?.nodeType as BranchNodeData['kind']) ?? 'branch',
        title: b.title,
        reward: b.reward,
        meta: b.status === 'snapshot' ? `reward ${b.reward}` : undefined,
        hasChevron: true,
        selected: id === selectedId,
        ...disp,
      } as BranchNodeData,
    }
  })

  const edges: Edge[] = branches.map((b) => {
    const id = shortId(b)
    const source = b.parentNodeId ?? 'fork'
    const cluster = edgeCluster(b)
    return {
      id: `e-${source}-${id}`,
      source,
      target: id,
      type: 'cluster',
      sourceHandle: 'b',
      targetHandle: 't',
      data: { cluster },
    }
  })

  return { nodes: [forkNode, ...branchNodes], edges }
}
