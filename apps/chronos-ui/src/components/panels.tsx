import { clsx } from 'clsx'
import {
  X,
  GitFork,
  FileText,
  FolderClosed,
  Clock,
  Copy,
  Eye,
  Shuffle,
  Play,
  PlusCircle,
  ShieldCheck,
  ShieldAlert,
  CircleSlash,
} from './icons'
import type { ReactNode } from 'react'
import { Button, Chip, Divider } from './primitives'
import type { BranchRun, ForkPoint, LegitimateControl, ProofSet } from '../domain/types'
import { copyText } from '../lib/copy'

/* ------------------------------------------------------------------ */
/* Shell + building blocks                                             */
/* ------------------------------------------------------------------ */

export function PanelShell({
  title,
  tag,
  tagStatus,
  tagCopyValue,
  tabs,
  onClose,
  children,
  footer,
}: {
  title: string
  tag?: ReactNode
  tagStatus?: string
  tagCopyValue?: string
  tabs?: string[]
  onClose?: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-hairline bg-background">
      <div className="px-5 pt-5">
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 line-clamp-2 font-display text-xl leading-snug tracking-tight text-ink-primary">{title}</h2>
          {onClose && (
            <button
              type="button"
              aria-label={`Close ${title}`}
              onClick={onClose}
              className="shrink-0 text-ink-tertiary hover:text-ink-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={18} />
            </button>
          )}
        </div>
        {tag && (
          <div className="mt-2">
            <Chip status={tagStatus} className="min-w-0 max-w-full normal-case">
              {tagCopyValue ? (
                <button
                  type="button"
                  aria-label="Copy HUD trace ID"
                  title={tagCopyValue}
                  onClick={() => copyText(tagCopyValue)}
                  className="inline-flex min-w-0 items-center gap-1 normal-case focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 truncate">{tag}</span>
                  <Copy size={10} className="shrink-0" />
                </button>
              ) : (
                tag
              )}
            </Chip>
          </div>
        )}
        {tabs && (
          <div className="mt-4 flex gap-5 border-b border-hairline">
            {tabs.map((t, i) => (
              <button
                key={t}
                className={clsx(
                  '-mb-px border-b-2 pb-2 text-sm',
                  i === 0 ? 'border-ink-primary font-medium text-ink-primary' : 'border-transparent text-ink-secondary hover:text-ink-primary',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="border-t border-hairline px-5 py-4">{footer}</div>}
    </aside>
  )
}

export function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="py-3">
      <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-ink-primary">
        <span className="text-ink-tertiary">{icon}</span>
        {title}
      </div>
      <div className="pl-6 text-sm text-ink-secondary-strong">{children}</div>
    </div>
  )
}

export function KV({ label, children, valueClass, title }: { label: string; children: ReactNode; valueClass?: string; title?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="shrink-0 text-sm text-ink-secondary">{label}</span>
      <span title={title} className={clsx('min-w-0 break-all text-right text-sm font-medium text-ink-primary', valueClass)}>{children}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* ForkPoint overview panel  [screenshot 1]                            */
/* ------------------------------------------------------------------ */

export function ForkPointPanel({ onStart, onClose }: { onStart?: () => void; onClose?: () => void }) {
  return (
    <PanelShell
      title="QA ForkPoint · S0"
      tag="ROOT"
      tagStatus="root"
      onClose={onClose}
      footer={
        <div className="space-y-2 text-2xs text-ink-tertiary">
          <div className="flex justify-between">
            <span>Created</span>
            <span className="text-ink-secondary">May 8, 2025 · 10:21 AM</span>
          </div>
          <div className="flex justify-between">
            <span>Updated</span>
            <span className="text-ink-secondary">May 8, 2025 · 10:24 AM</span>
          </div>
        </div>
      }
    >
      <Section icon={<GitFork size={14} />} title="Fork reason">
        QA analysis indicates likely reward hacking via pytest plugin subversion.
      </Section>
      <Divider />
      <Section icon={<FileText size={14} />} title="Trace evidence">
        Trace shows reward gained after plugin injection and altered test discovery.
      </Section>
      <Divider />
      <Section icon={<FolderClosed size={14} />} title="Snapshot mode">
        <div className="flex items-center justify-between">
          Directory Snapshot
          <span className="inline-flex items-center gap-1 text-accent-text">
            <ShieldCheck size={13} /> Captured
          </span>
        </div>
      </Section>
      <Divider />
      <Section icon={<Clock size={14} />} title="History prefix">
        <KV label="Up to step">12</KV>
        <KV label="Actions">1 – 12</KV>
        <KV label="Cumulative reward">1.00</KV>
      </Section>
      <Divider />
      <Button variant="primary" size="md" className="mt-3 w-full" icon={<Shuffle size={15} />} onClick={onStart}>
        Start candidate exploit paths
      </Button>
    </PanelShell>
  )
}

/* ------------------------------------------------------------------ */
/* Branch / witness detail panel  [screenshot 4]                       */
/* ------------------------------------------------------------------ */

const STATUS_DISPLAY: Record<string, { label: string; class: string; tag: string; tagStatus: string }> = {
  witness: { label: 'CONFIRMED EXPLOIT WITNESS', class: 'text-accent-text text-xs font-semibold', tag: 'CONFIRMED', tagStatus: 'witness' },
  promising: { label: 'CANDIDATE EXPLOIT PATH', class: 'text-warn-text text-xs font-semibold', tag: 'CANDIDATE', tagStatus: 'promising' },
  verifying: { label: 'VERIFYING CANDIDATE', class: 'text-warn-text text-xs font-semibold', tag: 'VERIFYING', tagStatus: 'verifying' },
  qa_review: { label: 'CANDIDATE IN QA CHECK', class: 'text-warn-text text-xs font-semibold', tag: 'QA CHECK', tagStatus: 'qa-review' },
  control: { label: 'LEGITIMATE BASELINE', class: 'text-ink-secondary-strong text-xs font-semibold', tag: 'BASELINE', tagStatus: 'control' },
  control_pass: { label: 'BASELINE PASS', class: 'text-accent-text text-xs font-semibold', tag: 'BASELINE PASS', tagStatus: 'control-pass' },
  dead_end: { label: 'DEAD END', class: 'text-ink-danger text-xs font-semibold', tag: 'DEAD END', tagStatus: 'dead-end' },
  duplicate: { label: 'DUPLICATE', class: 'text-ink-secondary-strong text-xs font-semibold', tag: 'DUPLICATE', tagStatus: 'duplicate' },
  snapshot: { label: 'SNAPSHOT', class: 'text-ink-secondary-strong text-xs font-semibold', tag: 'SNAPSHOT', tagStatus: 'snapshot' },
}

export function BranchPanel({
  branch,
  inProofSet,
  onClose,
  onAddToProofSet,
  onRemoveFromProofSet,
  onReplay,
  onViewPreAttackState,
}: {
  branch: BranchRun
  inProofSet?: boolean
  onClose?: () => void
  onAddToProofSet?: () => void
  onRemoveFromProofSet?: () => void
  onReplay?: () => void
  onViewPreAttackState?: () => void
}) {
  const sd = STATUS_DISPLAY[branch.status] ?? STATUS_DISPLAY.promising
  const rows: { label: string; value: ReactNode; valueClass?: string; copy?: boolean; copyValue?: string; title?: string }[] = [
    { label: 'Branch ID', value: branch.branchId, valueClass: 'font-mono text-xs', title: branch.branchId },
    { label: 'Status', value: sd.label, valueClass: sd.class },
    ...(branch.qa
      ? [{ label: 'QA classification', value: branch.qa.classification, valueClass: branch.qa.isRewardHacking ? 'text-warn-text' : 'text-ink-secondary-strong' }]
      : []),
    { label: 'Confirmation', value: branch.status === 'witness' ? 'Deterministic pass' : branch.status === 'verifying' ? 'Checking QA + replay' : 'Not confirmed yet', valueClass: branch.status === 'witness' ? 'text-accent-text' : branch.status === 'verifying' ? 'text-warn-text' : 'text-ink-secondary' },
    { label: 'Cluster', value: branch.clusterLabel ?? '—' },
    { label: 'Reward (H2F)', value: branch.reward.toFixed(2) },
    { label: 'Seed', value: String(branch.seed), valueClass: 'font-mono text-xs' },
    { label: 'Model', value: branch.model, valueClass: 'font-mono text-xs' },
    { label: 'Sampling config', value: `temp=${branch.samplingConfig.temperature.toFixed(1)}, top_p=${branch.samplingConfig.topP.toFixed(1)}`, valueClass: 'font-mono text-xs' },
    { label: 'Parent snapshot', value: branch.parentSnapshot ?? 'S0' },
    { label: 'Snapshot mode', value: cap(branch.snapshotMode) },
    { label: 'Environment', value: branch.environmentVersion, title: branch.environmentVersion },
    { label: 'Grader digest', value: branch.graderDigest, valueClass: 'font-mono text-xs', copy: true, copyValue: branch.graderDigest, title: branch.graderDigest },
  ]
  return (
    <PanelShell title={branch.title} tag={sd.tag} tagStatus={sd.tagStatus} onClose={onClose}>
      <div className="divide-y divide-hairline">
        {rows.map((r) => (
          <KV key={r.label} label={r.label} valueClass={r.valueClass} title={r.title}>
            <span className="inline-flex min-w-0 items-start gap-1">
              <span className="min-w-0 break-all">{r.value}</span>
              {r.copy && (
                <button
                  type="button"
                  aria-label={`Copy ${r.label}`}
                  onClick={() => copyText(r.copyValue ?? String(r.value))}
                  className="mt-0.5 shrink-0 text-ink-tertiary transition-[color,transform] duration-150 ease-out hover:text-accent-text active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Copy size={11} />
                </button>
              )}
            </span>
          </KV>
        ))}
      </div>
      {branch.notes && (
        <div className="mt-4">
          <div className="mb-1 text-sm text-ink-secondary">Notes</div>
          <p className="text-sm text-ink-secondary-strong">{branch.notes}</p>
        </div>
      )}
      <div className="mt-5 space-y-2">
        <div className="text-2xs font-semibold uppercase tracking-wide text-ink-tertiary">Actions</div>
        <Button variant="primary" size="md" className="w-full" icon={<Play size={14} />} onClick={onReplay}>
          {branch.status === 'witness' ? 'Replay confirmed witness' : branch.status === 'verifying' ? 'Replay after confirmation' : 'Replay candidate path'}
        </Button>
        <Button variant="secondary" size="md" className="w-full" icon={<Eye size={14} />} onClick={onViewPreAttackState}>
          View pre-attack state
        </Button>
        {inProofSet ? (
          <Button variant="secondary" size="md" className="w-full" icon={<CircleSlash size={14} />} onClick={onRemoveFromProofSet}>
            Remove from proof set
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="md"
            className="w-full"
            icon={<PlusCircle size={14} />}
            onClick={branch.status === 'witness' ? onAddToProofSet : undefined}
            disabled={branch.status !== 'witness'}
          >
            {branch.status === 'witness' ? 'Add confirmed witness to proof set' : 'Await confirmation'}
          </Button>
        )}
      </div>
    </PanelShell>
  )
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/* ------------------------------------------------------------------ */
/* ProofSet panel  [screenshot 5]                                      */
/* ------------------------------------------------------------------ */

function ProofRow({ name, badge, tone }: { name: string; badge: string; tone: 'fail' | 'pass' | 'variant' }) {
  const toneCls = tone === 'fail' ? 'text-ink-danger bg-state-red-soft' : tone === 'pass' ? 'text-accent-text bg-green-50' : 'text-ink-secondary-strong bg-tint-blue'
  const Icon = tone === 'fail' ? CircleSlash : tone === 'pass' ? ShieldCheck : Shuffle
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-hairline bg-surface-raised px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2 text-sm text-ink-primary">
        <Icon size={14} className={tone === 'fail' ? 'text-ink-danger' : tone === 'pass' ? 'text-accent-text' : 'text-ink-secondary'} />
        <span className="truncate">{name}</span>
      </span>
      <span className={clsx('shrink-0 rounded-sm px-1.5 py-0.5 text-2xs font-semibold', toneCls)}>{badge}</span>
    </div>
  )
}

function ProofGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <div className="py-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-primary">
        {title} <span className="text-ink-tertiary">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Source Trace panel  [step 1 — before ForkPoint]                     */
/* ------------------------------------------------------------------ */

export function TracePanel({ forkPoint, onOpenForkPoint }: { forkPoint: ForkPoint; onOpenForkPoint?: () => void }) {
  return (
    <PanelShell
      title="Suspicious HUD Trace"
      tag={`#${forkPoint.hudTraceId}`}
      tagStatus="qa-review"
      tagCopyValue={`#${forkPoint.hudTraceId}`}
      footer={
        <div className="space-y-1.5 text-2xs text-ink-tertiary">
          <div className="flex justify-between">
            <span>Task</span>
            <span className="font-mono text-ink-secondary">{forkPoint.taskId}</span>
          </div>
          <div className="flex justify-between">
            <span>Environment</span>
            <span className="text-ink-secondary">{forkPoint.environmentVersion}</span>
          </div>
        </div>
      }
    >
      <Section icon={<ShieldAlert size={14} />} title="QA verdict">
        <span className="font-medium text-warn-text">Likely reward hacking</span>
        <div className="mt-0.5">pytest plugin subversion strategy</div>
        <div className="mt-1 flex items-center gap-2 text-xs text-ink-tertiary">
          <span className="rounded-sm bg-state-red-soft px-1.5 py-0.5 font-semibold uppercase text-ink-danger">HIGH</span>
          Independent QA classification
        </div>
      </Section>
      <Divider />
      <Section icon={<FileText size={14} />} title="Trace evidence">
        {forkPoint.traceEvidence}
      </Section>
      <Divider />
      <Section icon={<Clock size={14} />} title="Execution">
        <KV label="Steps">1 – {forkPoint.upToStep}</KV>
        <KV label="Cumulative reward" valueClass="text-warn-text">{forkPoint.cumulativeReward.toFixed(2)}</KV>
        <KV label="Grader digest">
          <span className="font-mono text-xs">{forkPoint.graderDigest.slice(0, 12)}…</span>
        </KV>
      </Section>
      <Divider />
      <Button variant="primary" size="md" className="mt-3 w-full" icon={<GitFork size={15} />} onClick={onOpenForkPoint}>
        Open as ForkPoint
      </Button>
    </PanelShell>
  )
}

export function ProofSetPanel({
  proofSet,
  branches,
  controls,
  variantNames,
  onRun,
  onClose,
}: {
  proofSet: ProofSet
  branches: BranchRun[]
  controls: LegitimateControl[]
  variantNames: Record<string, string>
  onRun?: () => void
  onClose?: () => void
}) {
  const witnessName = (id: string) => branches.find((b) => b.runId === `run-${id}`)?.title ?? id
  const controlName = (id: string) => controls.find((c) => c.controlId === id)?.title ?? id
  const headlineTotal = proofSet.exploitWitnessIds.length + proofSet.legitimateControlIds.length
  return (
    <PanelShell
      title="Proof set"
      onClose={onClose}
      footer={
        <div className="space-y-3">
          <Button variant="primary" size="md" className="w-full" icon={<Play size={14} />} onClick={onRun}>
            Run proof set
          </Button>
          <div className="flex justify-between text-2xs text-ink-tertiary">
            <span>Created</span>
            <span className="text-ink-secondary">May 8, 2025 · 10:25 AM</span>
          </div>
        </div>
      }
    >
      <p className="-mt-1 flex items-center gap-1.5 text-sm text-ink-secondary">
        <ShieldCheck size={14} className="text-ink-tertiary" /> {headlineTotal} total
      </p>
      <Divider className="my-3" />
      <ProofGroup title="Exploit Witnesses" count={proofSet.exploitWitnessIds.length}>
        {proofSet.exploitWitnessIds.map((id) => (
          <ProofRow key={id} name={witnessName(id)} badge="MUST FAIL" tone="fail" />
        ))}
      </ProofGroup>
      <ProofGroup title="Legitimate Baselines" count={proofSet.legitimateControlIds.length}>
        {proofSet.legitimateControlIds.map((id) => (
          <ProofRow key={id} name={controlName(id)} badge="MUST PASS" tone="pass" />
        ))}
      </ProofGroup>
      <ProofGroup title="Re-seeded Variants" count={proofSet.exploitFamilyVariantIds.length}>
        {proofSet.exploitFamilyVariantIds.map((id) => (
          <ProofRow key={id} name={variantNames[id] ?? id} badge="VARIANT" tone="variant" />
        ))}
      </ProofGroup>
    </PanelShell>
  )
}
