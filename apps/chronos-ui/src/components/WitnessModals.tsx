import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { X, Loader2, Play, Eye, ShieldCheck, CheckCircle2, GitFork, Clock, FolderClosed } from './icons'
import { Button, Chip, Divider } from './primitives'
import { KV } from './panels'
import type { PreAttackState, ReplayResult } from '../domain/types'

/* ------------------------------------------------------------------ */
/* Modal shell                                                         */
/* ------------------------------------------------------------------ */

function ModalShell({
  icon,
  title,
  tag,
  tagStatus,
  onClose,
  children,
  footer,
}: {
  icon: ReactNode
  title: string
  tag?: string
  tagStatus?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-hairline bg-background shadow-2xl">
        <div className="flex items-center gap-2 border-b border-hairline px-5 py-4">
          <span className="text-ink-tertiary">{icon}</span>
          <h2 className="font-display text-lg tracking-tight text-ink-primary">{title}</h2>
          {tag && <Chip status={tagStatus}>{tag}</Chip>}
          <button onClick={onClose} className="ml-auto text-ink-tertiary hover:text-ink-primary">
            <X size={18} />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-hairline px-5 py-4">{footer}</div>}
      </div>
    </div>
  )
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-sm text-ink-secondary-strong">
      <Loader2 size={16} className="animate-spin text-accent-text" />
      {label}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Replay witness modal                                                */
/* ------------------------------------------------------------------ */

export function ReplayWitnessModal({
  branchId,
  title,
  replay,
  tree,
  onClose,
}: {
  branchId: string
  title: string
  replay: (id: string) => Promise<ReplayResult>
  tree?: ReactNode
  onClose: () => void
}) {
  const [result, setResult] = useState<ReplayResult | null>(null)

  useEffect(() => {
    let alive = true
    setResult(null)
    replay(branchId).then((r) => alive && setResult(r))
    return () => {
      alive = false
    }
  }, [branchId, replay])

  return (
    <ModalShell
      icon={<Play size={16} />}
      title="Replay witness"
      tag={result ? (result.illustrative ? 'ILLUSTRATIVE · no committed record' : result.ok ? 'DETERMINISTIC PASS' : 'DIVERGED') : undefined}
      tagStatus={result?.illustrative ? 'root' : result?.ok ? 'witness' : 'dead-end'}
      onClose={onClose}
      footer={
        <Button variant="primary" size="md" className="w-full" onClick={onClose}>
          Done
        </Button>
      }
    >
      {!result ? (
        <Loading label={`Replaying ${title} against grader ${'v1'}…`} />
      ) : (
        <>
          {tree && (
            <div className="mb-4 rounded-xl border border-hairline bg-surface-raised p-3">
              <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-tertiary">Replay path</div>
              {tree}
            </div>
          )}
          <p className="mb-3 text-sm text-ink-secondary-strong">{result.detail}</p>
          <div className="divide-y divide-hairline">
            <KV label="Grader version" valueClass="font-mono text-xs">{result.graderVersion}</KV>
            <KV label="Grader digest" valueClass="font-mono text-xs">{result.graderDigest.slice(0, 12)}…</KV>
            <KV label="Steps replayed">{result.steps}</KV>
            <KV label="Reward (H2F)" valueClass="text-accent-text">{result.reward.toFixed(2)}</KV>
            <KV label="Output digest" valueClass={result.digestMatch ? 'text-accent-text' : 'text-ink-danger'}>
              {result.digestMatch ? 'Match' : 'Mismatch'}
            </KV>
          </div>
          <div className="mt-4">
            <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-tertiary">Deterministic checks</div>
            <div className="space-y-1.5">
              {result.checks.map((c) => (
                <div key={c.label} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 size={14} className={c.status === 'pass' ? 'text-accent-text' : 'text-ink-danger'} />
                  <span className="text-ink-primary">{c.label}</span>
                  {c.detail && <span className="ml-auto font-mono text-xs text-ink-secondary">{c.detail}</span>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </ModalShell>
  )
}

/* ------------------------------------------------------------------ */
/* Pre-attack state modal                                              */
/* ------------------------------------------------------------------ */

export function PreAttackStateModal({
  branchId,
  title,
  load,
  tree,
  onClose,
}: {
  branchId: string
  title: string
  load: (id: string) => Promise<PreAttackState>
  tree?: ReactNode
  onClose: () => void
}) {
  const [state, setState] = useState<PreAttackState | null>(null)

  useEffect(() => {
    let alive = true
    setState(null)
    load(branchId).then((s) => alive && setState(s))
    return () => {
      alive = false
    }
  }, [branchId, load])

  return (
    <ModalShell
      icon={<Eye size={16} />}
      title="Pre-attack state"
      tag="FORKPOINT"
      tagStatus="snapshot"
      onClose={onClose}
      footer={
        <Button variant="secondary" size="md" className="w-full" onClick={onClose}>
          Close
        </Button>
      }
    >
      {!state ? (
        <Loading label={`Restoring pre-attack snapshot for ${title}…`} />
      ) : (
        <>
          {tree && (
            <div className="mb-4 rounded-xl border border-hairline bg-surface-raised p-3">
              <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-tertiary">
                Fork lineage · captured state highlighted
              </div>
              {tree}
            </div>
          )}
          <p className="mb-3 flex items-start gap-2 text-sm text-ink-secondary-strong">
            <GitFork size={14} className="mt-0.5 shrink-0 text-ink-tertiary" />
            {state.summary}
          </p>
          <Divider />
          <div className="divide-y divide-hairline py-1">
            <KV label="Snapshot ref" valueClass="font-mono text-xs">{state.snapshotRef}</KV>
            <KV label="Snapshot mode">{cap(state.snapshotMode)}</KV>
            <KV label="Environment">{state.environmentVersion}</KV>
            <KV label="Captured at" valueClass="text-xs">{new Date(state.capturedAt).toLocaleString()}</KV>
          </div>
          <div className="mt-3 flex items-center gap-4 rounded-lg border border-hairline bg-surface-raised px-3 py-2.5 text-sm">
            <span className="inline-flex items-center gap-1.5 text-ink-secondary-strong">
              <Clock size={13} className="text-ink-tertiary" /> Up to step <b className="text-ink-primary">{state.upToStep}</b>
            </span>
            <span className="inline-flex items-center gap-1.5 text-ink-secondary-strong">
              <ShieldCheck size={13} className="text-ink-tertiary" /> Cumulative reward{' '}
              <b className="text-ink-primary">{state.cumulativeReward.toFixed(2)}</b>
            </span>
          </div>
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2 text-2xs font-semibold uppercase tracking-wide text-ink-tertiary">
              <FolderClosed size={12} /> Snapshot contents
            </div>
            <div className="space-y-1.5">
              {state.files.map((f) => (
                <div key={f.path} className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-raised px-3 py-2">
                  <span className="font-mono text-xs text-ink-primary">{f.path}</span>
                  <span
                    className={clsx(
                      'ml-auto rounded-sm px-1.5 py-0.5 text-2xs font-semibold uppercase',
                      f.status === 'diverged' ? 'bg-state-red-soft text-ink-danger' : 'bg-state-gray-soft text-ink-secondary-strong',
                    )}
                  >
                    {f.status}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-2xs text-ink-tertiary">
              <span className="font-semibold uppercase text-ink-danger">Diverged</span> files changed only after the fork — the
              snapshot above is the clean state the exploit was launched from.
            </p>
          </div>
        </>
      )}
    </ModalShell>
  )
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
