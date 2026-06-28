import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { ShieldX, ShieldAlert, Check, ChevronDown, GitFork, ChevronRight, RotateCcw } from '../components/icons'
import { RunHeader } from '../components/RunHeader'
import { RunSummaryFooter } from '../components/RunSummaryFooter'
import { MiniThumb } from '../components/MiniThumb'
import { getGateCounts, getRunTreeCounts } from '../lib/runFooter'
import { useRun } from '../store/RunProvider'
import { Button } from '../components/primitives'
import type { GateMemberResult } from '../domain/types'

function WitnessRow({ name, state, reward, onOpen }: { name: string; state: 'KILLED' | 'SURVIVED'; reward: string; onOpen: () => void }) {
  const survived = state === 'SURVIVED'
  return (
    <button type="button" onClick={onOpen} className={clsx('flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-[background-color,border-color,transform] duration-150 ease-out hover:bg-surface active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring', survived ? 'border-red-200 bg-state-red-soft' : 'border-hairline bg-surface-raised')}>
      <GitFork size={15} className="text-ink-tertiary" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-primary">{name}</span>
      <span className={clsx('flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-2xs font-semibold', survived ? 'bg-fill-danger text-ink-inverse' : 'bg-green-50 text-accent-text')}>
        {survived ? <ShieldAlert size={11} /> : <Check size={11} strokeWidth={3} />}
        {state}
      </span>
      <span className="w-20 text-right text-sm text-ink-secondary">reward {reward}</span>
      <ChevronRight size={15} className="text-ink-tertiary" />
    </button>
  )
}

function Donut({ killed, total }: { killed: number; total: number }) {
  const r = 34
  const c = 2 * Math.PI * r
  const ratio = total > 0 ? killed / total : 0
  const killedArc = ratio * c
  return (
    <div className="relative h-28 w-28">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--ds-neutral-200)" strokeWidth="9" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--ds-green-500)" strokeWidth="9" strokeDasharray={`${killedArc} ${c}`} strokeLinecap="round" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--ds-red-300)" strokeWidth="9" strokeDasharray={`${c - killedArc} ${c}`} strokeDashoffset={-killedArc} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold text-ink-primary">{killed} / {total}</span>
        <span className="text-2xs text-ink-tertiary">killed</span>
      </div>
    </div>
  )
}

export function GateWitnessFailed() {
  const navigate = useNavigate()
  const run = useRun()
  const returnToFixer = () => run.returnToFixer().then(() => navigate('/patch'))
  const counts = getRunTreeCounts(run)
  const total = (run.proofSet?.exploitWitnessIds.length ?? 0) + (run.proofSet?.legitimateControlIds.length ?? 0)
  const results = run.releaseProof?.results ?? run.gate.results
  const gateCounts = getGateCounts(results, total)

  const witnessResults = results.filter((r): r is GateMemberResult => r.kind === 'witness')
  const controlResults = results.filter((r): r is GateMemberResult => r.kind === 'control')
  const witnessTotal = witnessResults.length
  const killed = witnessResults.filter((r) => r.v2 === 0).length
  const survived = witnessResults.filter((r) => r.v2 === 1).length
  const controlTotal = controlResults.length
  const controlsPreserved = controlResults.filter((r) => r.v2 === 1).length
  const blocked = run.releaseProof?.blocked === true
  const killedPct = witnessTotal > 0 ? Math.round((killed / witnessTotal) * 100) : 0
  const survivedPct = witnessTotal > 0 ? Math.round((survived / witnessTotal) * 100) : 0

  return (
    <>
      <RunHeader title="Exploit Witness" version="v3.2" primaryLabel="Resume run" onClose={() => navigate('/witness')} />
      <div className="flex min-h-0 flex-1">
        <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto px-8 py-6">
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center gap-2 text-ink-danger">
              <ShieldX size={20} />
              <h2 className="font-display text-2xl tracking-tight">
                {blocked ? 'Release Gate BLOCKED' : 'Release Gate FAILED'}
              </h2>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-danger">
              <ShieldAlert size={14} />{' '}
              {blocked
                ? `harden-v0 ${run.releaseProof?.hardenStatus ?? ''} — diagnostic-only patch, no validated v1/v2 results`
                : 'Exploit survived — gate blocked'}
            </p>
            {blocked && run.releaseProof?.blockReason && (
              <p className="mt-2 max-w-xl text-xs text-ink-secondary">{run.releaseProof.blockReason}</p>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div>
              <div className="text-xs text-ink-secondary">Witnesses killed</div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="flex gap-1">
                  {Array.from({ length: witnessTotal }).map((_, i) => (
                    <span key={i} className={clsx('h-4 w-8 rounded-sm', i < killed ? 'bg-fill-accent' : 'bg-fill-danger')} />
                  ))}
                </div>
                <span className="text-sm font-medium text-ink-primary">{killed} / {witnessTotal}</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-ink-secondary">Controls preserved</div>
              <div className="mt-1.5 flex items-center gap-2">
                {Array.from({ length: controlTotal }).map((_, i) => (
                  <span key={i} className={clsx('flex h-5 w-5 items-center justify-center rounded-full text-ink-inverse', i < controlsPreserved ? 'bg-fill-accent' : 'bg-fill-danger')}>
                    <Check size={12} strokeWidth={3} />
                  </span>
                ))}
                <span className="ml-1 text-sm font-medium text-ink-primary">{controlsPreserved} / {controlTotal}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-stroke bg-surface-raised px-3 py-1.5 text-sm text-ink-secondary-strong">
              View by witness <ChevronDown size={14} className="text-ink-tertiary" />
            </div>
            <div className="flex items-center gap-4 text-xs text-ink-secondary">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-fill-accent" /> Killed</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-fill-danger" /> Survived</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warn" /> Promising</span>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {witnessResults.map((w) => (
              <WitnessRow key={w.memberId} name={w.name} state={w.v2 === 0 ? 'KILLED' : 'SURVIVED'} reward={w.reward.toFixed(1)} onOpen={() => navigate('/artifacts')} />
            ))}
          </div>

          <div className="mt-6">
            <div className="mb-2 text-sm font-medium text-ink-primary">Controls (must be preserved)</div>
            <div className="space-y-2">
              {controlResults.map((c) => {
                const broken = c.v2 === 0
                return (
                  <button key={c.memberId} type="button" onClick={() => navigate('/artifacts')} className={clsx('flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-[background-color,border-color,transform] duration-150 ease-out hover:bg-surface active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring', broken ? 'border-red-200 bg-state-red-soft' : 'border-hairline bg-surface-raised')}>
                    <span className={clsx('flex h-5 w-5 items-center justify-center rounded-full text-ink-inverse', broken ? 'bg-fill-danger' : 'bg-fill-accent')}>
                      {broken ? <ShieldAlert size={11} /> : <Check size={12} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-primary">{c.name}</span>
                    <span className={clsx('rounded-sm px-1.5 py-0.5 text-2xs font-semibold', broken ? 'bg-fill-danger text-ink-inverse' : 'bg-green-50 text-accent-text')}>{broken ? 'BROKEN' : 'PRESERVED'}</span>
                    <ChevronRight size={15} className="text-ink-tertiary" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* right panel */}
        <aside className="scrollbar-thin flex w-80 shrink-0 flex-col overflow-y-auto border-l border-hairline bg-background px-5 py-5">
          <div className="rounded-lg border border-red-200 bg-state-red-soft p-4">
            <div className="flex items-center gap-2 text-ink-danger">
              <ShieldX size={16} />
              <span className="font-display text-base tracking-tight">{blocked ? 'Gate blocked · return to fixer' : 'Gate failed · widen patch'}</span>
            </div>
            <p className="mt-1 text-sm text-ink-secondary-strong">{blocked ? 'harden-v0 produced a diagnostic-only patch' : `${survived} exploit${survived === 1 ? '' : 's'} survived`}</p>
            <p className="mt-0.5 text-xs text-ink-secondary">
              {blocked ? 'No validated v1/v2 results were produced, so the release cannot be proven.' : 'The release is blocked until all witnesses are killed.'}
            </p>
            {blocked && run.releaseProof?.missingEvidence?.length ? (
              <p className="mt-1.5 text-2xs text-ink-tertiary">Missing: {run.releaseProof.missingEvidence.join(', ')}</p>
            ) : null}
            <Button variant="danger" size="md" className="mt-3 w-full" icon={<RotateCcw size={14} />} onClick={returnToFixer}>Return to fixer</Button>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-sm font-medium text-ink-primary">Run comparison <span className="ml-1 text-ink-tertiary">v1 → v2</span></div>
            <div className="divide-y divide-hairline rounded-lg border border-hairline bg-surface-raised px-4">
              {[
                ['Witnesses killed', '0', `${killed}`, killed > 0 ? `↑ ${killed}` : '—', killed > 0 ? 'text-accent-text' : 'text-ink-tertiary'],
                ['Witnesses survived', `${witnessTotal}`, `${survived}`, survived > 0 ? `↑ ${survived}` : '—', survived > 0 ? 'text-ink-danger' : 'text-ink-tertiary'],
                ['Controls preserved', `${controlTotal}`, `${controlsPreserved}`, controlsPreserved < controlTotal ? `↓ ${controlTotal - controlsPreserved}` : '—', controlsPreserved < controlTotal ? 'text-ink-danger' : 'text-ink-tertiary'],
                ['Total witnesses', `${witnessTotal}`, `${witnessTotal}`, '—', 'text-ink-tertiary'],
              ].map(([l, a, b, d, c]) => (
                <div key={l} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink-secondary">{l}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-ink-tertiary">{a}</span>
                    <span className="font-medium text-ink-primary">{b}</span>
                    <span className={clsx('w-8 text-right text-xs', c)}>{d}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-sm font-medium text-ink-primary">Witness outcome</div>
            <div className="flex items-center gap-4 rounded-lg border border-hairline bg-surface-raised p-4">
              <Donut killed={killed} total={witnessTotal} />
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-fill-accent" /> Killed <span className="ml-auto font-medium text-ink-primary">{killed} ({killedPct}%)</span></div>
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-fill-danger" /> Survived <span className="ml-auto font-medium text-ink-primary">{survived} ({survivedPct}%)</span></div>
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-warn" /> Promising <span className="ml-auto font-medium text-ink-primary">0 (0%)</span></div>
              </div>
            </div>
          </div>
        </aside>
      </div>
      <RunSummaryFooter
        stats={[
          { label: 'Witness', value: killed, tone: 'green' },
          { label: 'Survived', value: survived, tone: 'red' },
          { label: 'Controls', value: controlsPreserved, tone: 'gray' },
        ]}
        total={gateCounts.total}
        cards={[
          { icon: 'witness', label: 'Witness', value: counts.witnesses, onClick: () => navigate('/witness') },
          { icon: 'proofset', label: 'Proof set', value: counts.proofSetMembers, onClick: () => navigate('/proofset') },
          {
            icon: 'releaseproof',
            label: 'Release proof',
            value: counts.releaseProofs,
            onClick: () => navigate('/releaseproof'),
          },
          { icon: 'artifacts', label: 'Survived', value: survived, onClick: () => navigate('/artifacts') },
        ]}
        minimap={<MiniThumb variant="tree" />}
      />
    </>
  )
}
