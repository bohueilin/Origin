import { Handle, Position, type NodeProps } from '@xyflow/react'
import { clsx } from 'clsx'
import {
  GripVertical,
  Database,
  Flag,
  GitFork,
  ChevronRight,
  Copy,
  RefreshCw,
  GitBranch,
} from '../components/icons'
import type { ReactNode } from 'react'
import { Chip, VerdictIcon } from '../components/primitives'
import type { BranchNodeData } from '../lib/types'

/* Shared hidden handles so the same node works in both top-down and
 * left-to-right layouts. Edges pick the handle by id. */
function Handles() {
  return (
    <>
      <Handle id="t" type="target" position={Position.Top} />
      <Handle id="l" type="target" position={Position.Left} />
      <Handle id="b" type="source" position={Position.Bottom} />
      <Handle id="r" type="source" position={Position.Right} />
    </>
  )
}

const STATUS_RING: Record<string, string> = {
  root: 'border-fill-accent ring-1 ring-fill-accent/30',
  promising: 'border-hairline',
  witness: 'border-hairline',
  control: 'border-hairline',
}

function Frame({
  children,
  selected,
  status,
  width = 250,
  className,
}: {
  children: ReactNode
  selected?: boolean
  status?: string
  width?: number
  className?: string
}) {
  return (
    <div
      style={{ width }}
      className={clsx(
        'fp-node-frame relative rounded-lg border bg-surface-raised px-3 py-2.5 shadow-sm',
        'transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out',
        selected ? 'border-fill-accent ring-2 ring-fill-accent/25 shadow-md' : status && STATUS_RING[status] ? STATUS_RING[status] : 'border-hairline',
        className,
      )}
    >
      {children}
    </div>
  )
}

function CardHeader({
  title,
  icon,
  tag,
  status,
  chevron,
  verdict,
}: {
  title: string
  icon?: ReactNode
  tag?: string
  status?: string
  chevron?: boolean
  verdict?: BranchNodeData['verdict']
}) {
  return (
    <div className="flex items-start gap-1.5">
      <GripVertical size={13} className="mt-0.5 -ml-1 shrink-0 text-ink-tertiary/70" />
      {icon}
      <div className="min-w-0 flex-1">
        <div className="break-words text-sm font-medium leading-snug text-ink-primary">{title}</div>
        {(tag || (verdict && verdict !== 'none')) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {tag && <Chip status={status} className="shrink-0">{tag}</Chip>}
            {verdict && verdict !== 'none' && <VerdictIcon verdict={verdict} className="h-4 w-4 shrink-0" />}
          </div>
        )}
      </div>
      {chevron && <ChevronRight size={15} className="mt-0.5 shrink-0 text-ink-tertiary" />}
    </div>
  )
}

/* Verdict circle that hangs below a leaf node (matches the tree screenshots) */
function BottomVerdict({ verdict }: { verdict: BranchNodeData['verdict'] }) {
  if (!verdict || verdict === 'none') return null
  return (
    <div className="pointer-events-none absolute left-1/2 top-full flex -translate-x-1/2 flex-col items-center">
      <span className="h-3 w-px bg-stroke" />
      <VerdictIcon verdict={verdict} />
    </div>
  )
}

function RewardRow({ reward, meta }: { reward?: number; meta?: string }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-secondary">
      <Database size={12} className="text-ink-tertiary" />
      <span>{meta ?? `reward ${reward}`}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Generic tree branch node                                            */
/* ------------------------------------------------------------------ */

export function BranchNode({ data, selected }: NodeProps) {
  const d = data as BranchNodeData
  return (
    <Frame selected={selected || d.selected} status={d.status}>
      <Handles />
      <CardHeader title={d.title} tag={d.tag} status={d.status} chevron={d.hasChevron} verdict={d.verdict} />
      {(d.meta || d.reward !== undefined) && <RewardRow reward={d.reward} meta={d.meta} />}
    </Frame>
  )
}

/* Branch node whose verdict hangs below (leaves in the tree views) */
export function LeafNode({ data, selected }: NodeProps) {
  const d = data as BranchNodeData
  return (
    <Frame selected={selected || d.selected} status={d.status}>
      <Handles />
      <CardHeader title={d.title} tag={d.tag} status={d.status} chevron={d.hasChevron} />
      <RewardRow reward={d.reward} meta={d.meta} />
      <BottomVerdict verdict={d.verdict} />
    </Frame>
  )
}

/* ------------------------------------------------------------------ */
/* HUD trace node                                                      */
/* ------------------------------------------------------------------ */

export function TraceNode({ data }: NodeProps) {
  const d = data as BranchNodeData
  return (
    <Frame width={172}>
      <Handles />
      <div className="flex items-center gap-1.5">
        <GripVertical size={13} className="-ml-1 text-ink-tertiary/70" />
        <Database size={13} className="text-ink-tertiary" />
        <span className="text-sm font-medium text-ink-primary">{d.title}</span>
        <span className="ml-auto font-mono text-2xs text-ink-tertiary">{d.tag}</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-secondary">
        <Database size={12} className="text-ink-tertiary" />
        reward {d.reward}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-warn-text">
        <Flag size={12} />
        QA flagged
      </div>
    </Frame>
  )
}

/* ------------------------------------------------------------------ */
/* Reward-hacking QA node                                              */
/* ------------------------------------------------------------------ */

export function QANode({ data }: NodeProps) {
  const d = data as BranchNodeData
  return (
    <Frame width={178}>
      <Handles />
      <div className="flex items-center gap-1.5">
        <GripVertical size={13} className="-ml-1 text-ink-tertiary/70" />
        <Flag size={13} className="text-ink-tertiary" />
        <span className="text-sm font-medium text-ink-primary">{d.title}</span>
        <VerdictIcon verdict="ok" className="ml-auto h-4 w-4" />
      </div>
      <dl className="mt-2 space-y-1 text-xs">
        {d.rows?.map((r) => (
          <div key={r.label} className="flex gap-2">
            <dt className="w-16 shrink-0 text-ink-tertiary">{r.label}</dt>
            <dd className={clsx('min-w-0 flex-1 font-medium', r.label === 'verdict' || r.label === 'severity' ? 'text-warn-text' : 'text-ink-primary')}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </Frame>
  )
}

/* ------------------------------------------------------------------ */
/* ForkPoint (root) node                                               */
/* ------------------------------------------------------------------ */

export function ForkPointNode({ data, selected }: NodeProps) {
  const d = data as BranchNodeData
  return (
    <Frame selected={selected || d.selected} status="root">
      <Handles />
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-green-50 text-accent-text">
          <GitFork size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1">
              <div className="break-words text-sm font-semibold leading-snug text-ink-primary">{d.title}</div>
              <div className="mt-1">
                <Chip status="root">ROOT</Chip>
              </div>
            </div>
            {d.hasChevron && <ChevronRight size={15} className="mt-0.5 shrink-0 text-ink-tertiary" />}
          </div>
          {d.rows ? (
            <ul className="mt-2 space-y-1 text-xs text-ink-secondary">
              {d.rows.map((r) => (
                <li key={r.label} className="flex items-center gap-1.5">
                  {r.label === 'digest' ? <Copy size={11} className="text-ink-tertiary" /> : <span className="h-3 w-3 rounded-sm bg-surface-sunken" />}
                  <span className={clsx(r.mono && 'font-mono')}>{r.value}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-secondary">
              <Database size={12} className="text-ink-tertiary" />
              {d.meta}
            </div>
          )}
        </div>
      </div>
    </Frame>
  )
}

/* ------------------------------------------------------------------ */
/* Snapshot node                                                       */
/* ------------------------------------------------------------------ */

export function SnapshotNode({ data, selected }: NodeProps) {
  const d = data as BranchNodeData
  return (
    <Frame selected={selected} className="fp-snapshot-card">
      <Handles />
      <div className="flex items-start gap-1.5">
        <GripVertical size={13} className="mt-0.5 -ml-1 shrink-0 text-ink-tertiary/70" />
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-secondary-strong">
          <RefreshCw size={11} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="break-words text-sm font-medium leading-snug text-ink-primary">{d.title}</div>
          <div className="mt-1">
            <Chip status="snapshot">{d.tag ?? 'SNAPSHOT'}</Chip>
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-secondary">
        <Database size={12} className="text-ink-tertiary" />
        {d.meta}
      </div>
    </Frame>
  )
}

/* ------------------------------------------------------------------ */
/* "+N branches stopped" node                                          */
/* ------------------------------------------------------------------ */

export function StoppedNode({ data }: NodeProps) {
  const d = data as BranchNodeData
  return (
    <Frame width={210}>
      <Handles />
      <div className="flex items-center gap-2">
        <GitBranch size={14} className="text-ink-tertiary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink-primary">{d.title}</div>
          <div className="text-xs text-ink-tertiary">{d.meta}</div>
        </div>
        <ChevronRight size={15} className="text-ink-tertiary" />
      </div>
    </Frame>
  )
}

export const nodeTypes = {
  branch: BranchNode,
  leaf: LeafNode,
  trace: TraceNode,
  qa: QANode,
  forkpoint: ForkPointNode,
  snapshot: SnapshotNode,
  stopped: StoppedNode,
}
