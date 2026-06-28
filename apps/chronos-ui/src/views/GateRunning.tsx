import { useEffect, useRef } from 'react'
import { clsx } from 'clsx'
import { useNavigate } from 'react-router-dom'
import { Layers, ShieldCheck, RotateCw, Ban, Loader2, Check, Circle, X, ChevronRight, FileText } from '../components/icons'
import { RunHeader } from '../components/RunHeader'
import { RunSummaryFooter } from '../components/RunSummaryFooter'
import { MiniThumb } from '../components/MiniThumb'
import { Chip } from '../components/primitives'
import { getGateCounts } from '../lib/runFooter'
import { useRun } from '../store/RunProvider'
import type { GateMemberResult } from '../domain/types'

type RowStatus = 'pending' | 'running' | 'good' | 'bad'

function StatusIcon({ status }: { status: RowStatus }) {
  if (status === 'running') return <Loader2 size={16} className="animate-spin text-warn-text" />
  if (status === 'pending') return <Circle size={15} className="text-ink-tertiary" />
  if (status === 'bad')
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fill-danger text-ink-inverse">
        <X size={12} strokeWidth={3} />
      </span>
    )
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fill-accent text-ink-inverse">
      <Check size={12} strokeWidth={3} />
    </span>
  )
}

function GateRow({ status, name, sub, right, rightTone }: { status: RowStatus; name: string; sub: string; right: string; rightTone: 'green' | 'warn' | 'red' | 'gray' }) {
  const tone =
    rightTone === 'green' ? 'text-accent-text' : rightTone === 'warn' ? 'text-warn-text' : rightTone === 'red' ? 'text-ink-danger' : 'text-ink-tertiary'
  return (
    <div className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
      <StatusIcon status={status} />
      <div className="min-w-0 flex-1">
        <div className={clsx('truncate text-sm font-medium', status === 'pending' ? 'text-ink-secondary' : 'text-ink-primary')}>{name}</div>
        <div className="truncate text-xs text-ink-tertiary">{sub}</div>
      </div>
      <span className={clsx('flex shrink-0 items-center gap-1 text-sm font-medium', tone)}>
        {right}
      </span>
    </div>
  )
}

function GateColumn({
  title,
  badge,
  progress,
  progressText,
  icon,
  children,
  footerLabel,
  onFooterClick,
}: {
  title: string
  badge: string
  progress: number
  progressText: string
  icon: React.ReactNode
  children: React.ReactNode
  footerLabel: string
  onFooterClick: () => void
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-hairline bg-surface-raised">
      <div className="flex items-start gap-3 border-b border-hairline p-4">
        <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-state-red-soft text-ink-danger">{icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-medium text-ink-primary">{title}</h3>
            <span className="rounded-sm bg-state-red-soft px-1.5 py-0.5 text-2xs font-semibold uppercase text-ink-danger">{badge}</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
              <div className="h-full origin-left rounded-full bg-fill-accent transition-transform duration-200 ease-out" style={{ transform: `scaleX(${progress / 100})` }} />
            </div>
            <span className="text-xs text-ink-secondary">{progressText}</span>
          </div>
        </div>
      </div>
      <div>{children}</div>
      <button type="button" onClick={onFooterClick} className="flex items-center gap-1.5 border-t border-hairline px-4 py-2.5 text-sm text-ink-secondary transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface hover:text-ink-primary active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <FileText size={13} /> {footerLabel} <ChevronRight size={13} className="ml-auto" />
      </button>
    </section>
  )
}

function InfoCard({ icon, label, title, sub, tone }: { icon: React.ReactNode; label: string; title: React.ReactNode; sub: string; tone?: 'green' }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-raised p-4">
      <span className={clsx('flex h-9 w-9 items-center justify-center rounded-lg', tone === 'green' ? 'bg-green-50 text-accent-text' : 'bg-surface-sunken text-ink-secondary')}>{icon}</span>
      <div className="min-w-0">
        <div className="text-2xs uppercase tracking-wide text-ink-tertiary">{label}</div>
        <div className="min-w-0 text-sm font-medium text-ink-primary">{title}</div>
        <div className="truncate text-xs text-ink-tertiary">{sub}</div>
      </div>
    </div>
  )
}

function witnessRow(result?: GateMemberResult): { status: RowStatus; sub: string; right: string; rightTone: 'green' | 'warn' | 'red' | 'gray' } {
  if (!result) return { status: 'pending', sub: 'Waiting to start', right: 'Pending', rightTone: 'gray' }
  if (result.v2 === 0) return { status: 'good', sub: 'Replay completed · killed', right: 'Killed', rightTone: 'green' }
  return { status: 'bad', sub: 'Replay completed · survived', right: 'Survived', rightTone: 'red' }
}

function controlRow(result?: GateMemberResult): { status: RowStatus; sub: string; right: string; rightTone: 'green' | 'warn' | 'red' | 'gray' } {
  if (!result) return { status: 'pending', sub: 'Waiting to start', right: 'Pending', rightTone: 'gray' }
  if (result.v2 === 1) return { status: 'good', sub: 'Replay completed', right: 'Passed', rightTone: 'green' }
  return { status: 'bad', sub: 'Replay completed · regressed', right: 'Broken', rightTone: 'red' }
}

export function GateRunning() {
  const navigate = useNavigate()
  const run = useRun()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    run.runGate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (run.gate.status !== 'done' || !run.releaseProof) return
    const rp = run.releaseProof
    const t = setTimeout(() => {
      if (rp.gateStatus === 'pass') {
        run.publish().then(() => navigate('/releaseproof'))
      } else if (rp.failureKind === 'witness_survived') {
        navigate('/gate/witness-failed')
      } else {
        navigate('/gate/control-failed')
      }
    }, 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.gate.status, run.releaseProof])

  const witnessIds = run.proofSet?.exploitWitnessIds ?? []
  const controlIds = run.proofSet?.legitimateControlIds ?? []
  const resultFor = (id: string) => run.gate.results.find((r) => r.memberId === id)
  const branchTitle = (id: string) => run.branches.find((b) => b.runId === `run-${id}`)?.title ?? id
  const controlTitle = (id: string) => run.controls.find((c) => c.controlId === id)?.title ?? id

  const witnessDone = witnessIds.filter((id) => resultFor(id)).length
  const controlDone = controlIds.filter((id) => resultFor(id)).length

  const done = run.gate.results.length
  const total = witnessIds.length + controlIds.length
  const gateCounts = getGateCounts(run.gate.results, total)
  const patchLabel = run.patch?.label ?? `Patch v${run.fixIteration + 1}`

  return (
    <>
      <RunHeader title="Release Gate" version="v2.3" primaryLabel="Resume gate" />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="grid grid-cols-3 gap-4">
          <InfoCard icon={<Layers size={18} />} label="Patch under test" title={<span className="flex items-center gap-2">{patchLabel} <Chip status="qa-review">UNDER TEST</Chip></span>} sub="Deterministic release gate" />
          <InfoCard icon={<ShieldCheck size={18} />} label="Gate mode" title="Deterministic replays" sub="All replays are deterministic and reproducible" />
          <InfoCard
            icon={<RotateCw size={18} />}
            label="Gate status"
            title={<span className={run.gate.status === 'done' ? 'text-accent-text' : 'text-warn-text'}>{run.gate.status === 'done' ? 'Complete' : 'Running'}</span>}
            sub={`${done} of ${total} replays complete`}
            tone="green"
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <GateColumn
            title="KILL · Witnesses must fail"
            badge="Kill on pass"
            progress={witnessIds.length ? (witnessDone / witnessIds.length) * 100 : 0}
            progressText={`${witnessDone} / ${witnessIds.length} complete`}
            icon={<Ban size={15} />}
            footerLabel="View all witnesses"
            onFooterClick={() => navigate('/witness')}
          >
            {witnessIds.map((id) => {
              const r = witnessRow(resultFor(id))
              return <GateRow key={id} status={r.status} name={branchTitle(id)} sub={r.sub} right={r.right} rightTone={r.rightTone} />
            })}
          </GateColumn>

          <GateColumn
            title="PRESERVE · Controls must pass"
            badge="Kill on fail"
            progress={controlIds.length ? (controlDone / controlIds.length) * 100 : 0}
            progressText={`${controlDone} / ${controlIds.length} complete`}
            icon={<ShieldCheck size={15} />}
            footerLabel="View all controls"
            onFooterClick={() => navigate('/proofset')}
          >
            {controlIds.map((id) => {
              const r = controlRow(resultFor(id))
              return <GateRow key={id} status={r.status} name={controlTitle(id)} sub={r.sub} right={r.right} rightTone={r.rightTone} />
            })}
          </GateColumn>
        </div>
      </div>
      <RunSummaryFooter
        stats={[
          { label: 'Passed', value: gateCounts.passed, tone: 'green' },
          { label: 'Failed', value: gateCounts.failed, tone: 'red' },
          { label: 'Pending', value: gateCounts.pending, tone: 'gray' },
        ]}
        total={gateCounts.total}
        cards={[
          { icon: 'witness', label: 'Witnesses', value: witnessIds.length, onClick: () => navigate('/witness') },
          { icon: 'releaseproof', label: 'Controls', value: controlIds.length, onClick: () => navigate('/proofset') },
          { icon: 'proofset', label: 'Deterministic' },
          { icon: 'artifacts', label: 'View gate log', onClick: () => navigate('/artifacts') },
        ]}
        minimap={<MiniThumb variant="tree" />}
      />
    </>
  )
}
