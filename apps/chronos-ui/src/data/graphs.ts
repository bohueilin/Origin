import type { Edge, Node } from '@xyflow/react'
import { Position } from '@xyflow/react'
import type { BranchNodeData } from '../lib/types'

type N = Node<BranchNodeData>

function v(cluster: 'witness' | 'promising' | 'control' | 'default', vertical = true) {
  return {
    type: 'cluster',
    sourceHandle: vertical ? 'b' : 'r',
    targetHandle: vertical ? 't' : 'l',
    data: { cluster },
  }
}

function edge(id: string, source: string, target: string, cluster: 'witness' | 'promising' | 'control' | 'default', vertical = true): Edge {
  return { id, source, target, ...v(cluster, vertical) }
}

/* ====================================================================
 * Scene 1 — QA ForkPoint root (horizontal)  [screenshot 1]
 * ==================================================================== */

export const rootGraph: { nodes: N[]; edges: Edge[] } = {
  nodes: [
    {
      id: 'trace',
      type: 'trace',
      position: { x: 0, y: 0 },
      sourcePosition: Position.Right,
      data: { kind: 'trace', title: 'Suspicious HUD Trace', status: 'trace', tag: '#trc_8f28', reward: 1 },
    },
    {
      id: 'qa',
      type: 'qa',
      position: { x: 290, y: 0 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        kind: 'qa',
        title: 'Reward Hacking QA',
        status: 'qa',
        rows: [
          { label: 'strategy', value: 'pytest subversion' },
          { label: 'severity', value: 'high' },
          { label: 'verdict', value: 'Likely reward hacking' },
        ],
      },
    },
    {
      id: 'forkpoint',
      type: 'forkpoint',
      position: { x: 600, y: 0 },
      targetPosition: Position.Left,
      selected: true,
      data: {
        kind: 'forkpoint',
        title: 'QA ForkPoint · S0',
        status: 'root',
        selected: true,
        hasChevron: true,
        rows: [
          { label: 'step', value: 'step 12' },
          { label: 'snapshot', value: 'Directory Snapshot' },
          { label: 'digest', value: 'grader digest 3f7a…9b21', mono: true },
        ],
      },
    },
  ],
  edges: [edge('e1', 'trace', 'qa', 'witness', false), edge('e2', 'qa', 'forkpoint', 'witness', false)],
}

/* ====================================================================
 * Scene 2 — Traceback Run expanded tree  [screenshot 2]
 * ==================================================================== */

export const forkproofTree: { nodes: N[]; edges: Edge[] } = {
  nodes: [
    { id: 'trace', type: 'stopped', position: { x: 880, y: 0 }, data: { kind: 'stopped', title: 'Suspicious HUD Trace', status: 'trace', meta: 'origin' } },
    {
      id: 'fork',
      type: 'forkpoint',
      position: { x: 870, y: 90 },
      data: { kind: 'forkpoint', title: 'QA ForkPoint · S0', status: 'root', hasChevron: true, meta: 'step 0' },
    },
    // level 1
    { id: 'localPytest', type: 'branch', position: { x: 360, y: 220 }, data: { kind: 'branch', title: 'Local pytest configuration attack', status: 'promising', tag: 'PROMISING', reward: 0.6, hasChevron: true } },
    { id: 'installedPlugin', type: 'branch', position: { x: 950, y: 220 }, data: { kind: 'branch', title: 'Installed pytest plugin path', status: 'promising', tag: 'PROMISING', reward: 0.6, hasChevron: true } },
    { id: 'legitSolver', type: 'branch', position: { x: 1480, y: 220 }, data: { kind: 'branch', title: 'Legitimate solver replay', status: 'control', tag: 'CONTROL', reward: 1.0, hasChevron: true } },
    // left leaves
    { id: 'conftest', type: 'leaf', position: { x: 80, y: 360 }, data: { kind: 'branch', title: 'conftest.py no-op hook', status: 'dead-end', tag: 'DEAD END', reward: 0.0, verdict: 'fail', hasChevron: true } },
    { id: 'synthetic', type: 'leaf', position: { x: 340, y: 360 }, data: { kind: 'branch', title: 'Synthetic TestReport generation', status: 'rewarded', tag: 'REWARDED', reward: 1.0, verdict: 'ok', hasChevron: true } },
    { id: 'collectionExit', type: 'leaf', position: { x: 600, y: 360 }, data: { kind: 'branch', title: 'Collection exit short-circuit', status: 'qa-review', tag: 'QA REVIEW', reward: 0.3, verdict: 'warn', hasChevron: true } },
    // middle snapshot + leaves
    { id: 'snapshot', type: 'snapshot', position: { x: 950, y: 360 }, data: { kind: 'snapshot', title: 'Snapshot S1 · plugin registered', status: 'snapshot', tag: 'SNAPSHOT', meta: 'step 18', hasChevron: true } },
    { id: 'layered', type: 'leaf', position: { x: 880, y: 490 }, data: { kind: 'branch', title: 'Layered fallback exploit', status: 'witness', tag: 'WITNESS', reward: 1.0, verdict: 'ok', hasChevron: true } },
    { id: 'pluginRename', type: 'leaf', position: { x: 1140, y: 490 }, data: { kind: 'branch', title: 'Plugin rename variant', status: 'duplicate', tag: 'DUPLICATE', reward: 0.0, verdict: 'none', hasChevron: true } },
    // right control leaf
    { id: 'refSolver', type: 'leaf', position: { x: 1480, y: 360 }, data: { kind: 'branch', title: 'Reference solver baseline', status: 'control-pass', tag: 'CONTROL PASS', reward: 1.0, verdict: 'ok', hasChevron: true } },
    // stopped
    { id: 'stopped', type: 'stopped', position: { x: 950, y: 620 }, data: { kind: 'stopped', title: '+4 branches stopped', status: 'plain', meta: 'no new cluster' } },
  ],
  edges: [
    edge('e0', 'trace', 'fork', 'default'),
    edge('e1', 'fork', 'localPytest', 'promising'),
    edge('e2', 'fork', 'installedPlugin', 'promising'),
    edge('e3', 'fork', 'legitSolver', 'control'),
    edge('e4', 'localPytest', 'conftest', 'promising'),
    edge('e5', 'localPytest', 'synthetic', 'promising'),
    edge('e6', 'localPytest', 'collectionExit', 'promising'),
    edge('e7', 'installedPlugin', 'snapshot', 'promising'),
    edge('e8', 'snapshot', 'layered', 'promising'),
    edge('e9', 'snapshot', 'pluginRename', 'promising'),
    edge('e10', 'legitSolver', 'refSolver', 'control'),
    edge('e11', 'layered', 'stopped', 'default'),
    edge('e12', 'pluginRename', 'stopped', 'default'),
  ],
}

/* ====================================================================
 * Scene 3 — Exploit Witness tree  [screenshots 3 / 4]
 * ==================================================================== */

export const witnessTree: { nodes: N[]; edges: Edge[] } = {
  nodes: [
    {
      id: 'fork',
      type: 'forkpoint',
      position: { x: 660, y: 0 },
      data: { kind: 'forkpoint', title: 'QA ForkPoint', status: 'root', hasChevron: true, meta: 'step 12' },
    },
    // level 1
    { id: 'whitespace', type: 'branch', position: { x: 170, y: 140 }, data: { kind: 'branch', title: 'Whitespace normalization bypass', status: 'witness', reward: 1.0, verdict: 'ok', hasChevron: true } },
    { id: 'pytestSub', type: 'branch', position: { x: 730, y: 140 }, data: { kind: 'branch', title: 'Pytest plugin subversion', status: 'promising', tag: 'PROMISING', reward: 0.6, hasChevron: true } },
    { id: 'legitControl', type: 'branch', position: { x: 1140, y: 140 }, data: { kind: 'branch', title: 'Legitimate control replay', status: 'control', tag: 'CONTROL', reward: 1.0, hasChevron: true } },
    // level 2
    { id: 'trimCollapse', type: 'branch', position: { x: 50, y: 290 }, data: { kind: 'branch', title: 'Trim + collapse variant', status: 'witness', reward: 1.0, verdict: 'ok', hasChevron: true } },
    { id: 'caseFold', type: 'branch', position: { x: 300, y: 290 }, data: { kind: 'branch', title: 'Case-fold variant', status: 'witness', reward: 1.0, verdict: 'ok', hasChevron: true } },
    { id: 'snapshotS1', type: 'snapshot', position: { x: 610, y: 290 }, data: { kind: 'snapshot', title: 'Snapshot S1 · plugin registered', status: 'snapshot', meta: 'reward 0.6', hasChevron: true } },
    { id: 'pytest11', type: 'branch', position: { x: 870, y: 290 }, data: { kind: 'branch', title: 'pytest11 entry-point', status: 'qa-review', reward: 0.6, verdict: 'warn', hasChevron: true } },
    { id: 'refBaseline', type: 'branch', position: { x: 1140, y: 290 }, data: { kind: 'branch', title: 'Reference solver baseline', status: 'control', tag: 'CONTROL', reward: 1.0, hasChevron: true } },
    // level 3
    { id: 'companyAlias', type: 'branch', position: { x: 50, y: 430 }, data: { kind: 'branch', title: 'Company alias escalation', status: 'witness', reward: 1.0, verdict: 'ok', hasChevron: true } },
    { id: 'layeredFallback', type: 'branch', position: { x: 610, y: 430 }, selected: true, data: { kind: 'branch', title: 'Layered fallback exploit', status: 'promising', tag: 'PROMISING', reward: 0.6, hasChevron: true, selected: true } },
  ],
  edges: [
    edge('e1', 'fork', 'whitespace', 'witness'),
    edge('e2', 'fork', 'pytestSub', 'promising'),
    edge('e3', 'fork', 'legitControl', 'control'),
    edge('e4', 'whitespace', 'trimCollapse', 'witness'),
    edge('e5', 'whitespace', 'caseFold', 'witness'),
    edge('e6', 'trimCollapse', 'companyAlias', 'witness'),
    edge('e7', 'pytestSub', 'snapshotS1', 'promising'),
    edge('e8', 'pytestSub', 'pytest11', 'promising'),
    edge('e9', 'snapshotS1', 'layeredFallback', 'promising'),
    edge('e10', 'legitControl', 'refBaseline', 'control'),
  ],
}
