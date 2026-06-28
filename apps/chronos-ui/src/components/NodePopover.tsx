import { Activity, GitBranch, RefreshCw, ArrowUpRight, Camera, Sparkles, Play, Eye, PlusCircle, X } from './icons'
import type { ReactNode } from 'react'
import { Chip, IconButton } from './primitives'
import type { BranchRun } from '../domain/types'

const POP_STATUS: Record<string, { label: string; class: string; chip: string }> = {
  witness: { label: 'Confirmed exploit witness', class: 'text-accent-text', chip: 'witness' },
  promising: { label: 'Candidate exploit path', class: 'text-warn-text', chip: 'promising' },
  verifying: { label: 'Verifying candidate', class: 'text-warn-text', chip: 'verifying' },
  qa_review: { label: 'Candidate in QA check', class: 'text-warn-text', chip: 'qa-review' },
  control: { label: 'Legitimate baseline', class: 'text-ink-secondary-strong', chip: 'control' },
  snapshot: { label: 'Durable snapshot', class: 'text-ink-secondary-strong', chip: 'snapshot' },
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="flex items-center gap-2 text-ink-secondary">
        <span className="text-ink-tertiary">{icon}</span>
        {label}
      </span>
      <span className="font-medium text-ink-primary">{children}</span>
    </div>
  )
}

export function NodePopover({
  branch,
  onClose,
  onAddToProofSet,
  onReplay,
  onViewPreAttackState,
}: {
  branch: BranchRun
  onClose: () => void
  onAddToProofSet?: () => void
  onReplay?: () => void
  onViewPreAttackState?: () => void
}) {
  const sd = POP_STATUS[branch.status] ?? POP_STATUS.promising
  // Positioning is owned by the parent <NodeToolbar>, which anchors this card to
  // the node inside React Flow's transformed pane so it tracks pan/zoom/recenter.
  return (
    <div className="animate-dropdown-show w-72 origin-top rounded-lg border border-hairline bg-surface-raised p-4 shadow-lg">
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-semibold text-ink-primary">{branch.title}</span>
        <Chip status={sd.chip}>{branch.status === 'witness' ? 'CONFIRMED' : branch.status === 'verifying' ? 'VERIFYING' : branch.status === 'control' ? 'BASELINE' : 'CANDIDATE'}</Chip>
        <IconButton label="Close node details" onClick={onClose} className="ml-auto h-7 w-7">
          <X size={15} />
        </IconButton>
      </div>
      <div className="mt-2 divide-y divide-hairline">
        <Row icon={<Activity size={13} />} label="Status">
          <span className={sd.class}>{sd.label}</span>
        </Row>
        <Row icon={<GitBranch size={13} />} label="Cluster">
          {branch.clusterLabel ?? '—'}
        </Row>
        <Row icon={<RefreshCw size={13} />} label="Replay">
          {branch.status === 'witness' ? 'Deterministic pass' : branch.status === 'verifying' ? 'Checking QA + replay' : 'Not confirmed yet'}
        </Row>
        <Row icon={<ArrowUpRight size={13} />} label="Steps from fork">
          +{branch.stepsFromFork}
        </Row>
        <Row icon={<Camera size={13} />} label="Parent snapshot">
          {branch.parentSnapshot ?? 'S0'}
        </Row>
        <Row icon={<Sparkles size={13} />} label="Novelty">
          <span className="inline-flex items-center gap-1">
            {branch.novelty === 'new' ? 'new cluster' : 'existing cluster'} {branch.novelty === 'new' && <Chip status="witness">NEW</Chip>}
          </span>
        </Row>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3 text-sm">
        <button onClick={onReplay} className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-medium text-ink-primary transition-[color,background-color,transform] duration-150 ease-out hover:bg-surface hover:text-accent-text active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Play size={13} /> {branch.status === 'witness' ? 'Replay witness' : branch.status === 'verifying' ? 'Verifying' : 'Replay path'}
        </button>
        <button onClick={onViewPreAttackState} className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-medium text-ink-secondary transition-[color,background-color,transform] duration-150 ease-out hover:bg-surface hover:text-ink-primary active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Eye size={13} /> View state
        </button>
        {branch.status === 'witness' ? (
          <button onClick={onAddToProofSet} className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-medium text-accent-text transition-[background-color,transform] duration-150 ease-out hover:bg-green-50 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <PlusCircle size={13} /> Add witness
          </button>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1.5 font-medium text-ink-tertiary">
            <PlusCircle size={13} /> Await QA
          </span>
        )}
      </div>
    </div>
  )
}
