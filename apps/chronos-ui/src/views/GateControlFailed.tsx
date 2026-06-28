import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { ShieldX, RefreshCw, Check, X, RotateCcw, FileText, Eye } from '../components/icons'
import { RunHeader } from '../components/RunHeader'
import { RunSummaryFooter } from '../components/RunSummaryFooter'
import { MiniThumb } from '../components/MiniThumb'
import { KV } from '../components/panels'
import { Button } from '../components/primitives'
import { getGateCounts, getRunTreeCounts } from '../lib/runFooter'
import { useRun } from '../store/RunProvider'

const CONTROLS = [
  { name: 'Whitespace normalization bypass', status: 'PRESERVED', result: 'PASS', reward: '1.00', broken: false },
  { name: 'Legitimate control replay', status: 'PRESERVED', result: 'PASS', reward: '1.00', broken: false },
  { name: 'Reference solver baseline', status: 'BROKEN', result: 'FAIL', reward: '0.00', broken: true, tag: 'CONTROL' },
]

const WITNESSES = ['Trim + collapse variant', 'Company alias escalation', 'conftest.py hook', 'Case-fold variant', 'Pytest plugin subversion', 'Pytest11 entry-point']

function StatBlock({ label, big, sub, pct, tone }: { label: string; big: string; sub: string; pct: number; tone: 'green' | 'warn' | 'red' }) {
  const bar = tone === 'green' ? 'bg-fill-accent' : tone === 'warn' ? 'bg-warn' : 'bg-fill-danger'
  return (
    <div className="rounded-lg border border-hairline bg-surface-raised p-4">
      <div className="text-xs text-ink-secondary">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-2xl tracking-tight text-ink-primary">{big}</span>
        <span className="text-sm text-ink-secondary">{sub}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
          <div className={clsx('h-full rounded-full', bar)} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-medium text-ink-secondary-strong">{pct}%</span>
      </div>
    </div>
  )
}

export function GateControlFailed() {
  const navigate = useNavigate()
  const run = useRun()
  const returnToFixer = () => run.returnToFixer().then(() => navigate('/patch'))
  const counts = getRunTreeCounts(run)
  const total = (run.proofSet?.exploitWitnessIds.length ?? 0) + (run.proofSet?.legitimateControlIds.length ?? 0)
  const gateCounts = getGateCounts(run.releaseProof?.results ?? run.gate.results, total)
  const preserved = (run.releaseProof?.results ?? run.gate.results).filter((result) => result.kind === 'control' && result.v2 === 1).length
  return (
    <>
      <RunHeader title="Release Gate" version="v3.2" status={{ tone: 'red', label: 'Failed' }} primaryLabel="Resume run" onClose={() => navigate('/witness')} />
      <div className="flex min-h-0 flex-1">
        <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto px-8 py-6">
          {/* banner */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-red-200 bg-state-red-soft p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-fill-danger text-ink-inverse"><ShieldX size={18} /></span>
            <div className="min-w-64 flex-1">
              <div className="font-display text-lg tracking-tight text-ink-danger">Gate failed · relax patch</div>
              <div className="text-sm text-ink-secondary-strong">A control rejected. The release gate is not satisfied.</div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-center">
              <div>
                <div className="text-2xs uppercase tracking-wide text-ink-tertiary">Evaluated</div>
                <div className="font-display text-xl text-ink-primary">8</div>
              </div>
              <div>
                <div className="text-2xs uppercase tracking-wide text-ink-tertiary">Failed</div>
                <div className="font-display text-xl text-ink-danger">1</div>
              </div>
              <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={returnToFixer}>Apply relaxation</Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <StatBlock label="Witnesses" big="6 / 6" sub="killed" pct={100} tone="green" />
            <StatBlock label="Controls" big="2 / 3" sub="preserved" pct={67} tone="warn" />
            <div className="flex flex-col justify-center rounded-lg border border-hairline bg-surface-raised p-4">
              <div className="text-xs text-ink-secondary">Release gate</div>
              <div className="mt-1 flex items-center gap-2 font-display text-2xl tracking-tight text-ink-danger">
                <ShieldX size={20} /> FAILED
              </div>
            </div>
          </div>

          {/* controls table */}
          <div className="mt-6">
            <div className="mb-2 text-sm font-medium text-ink-primary">Controls (3)</div>
            <div className="overflow-x-auto rounded-lg border border-hairline">
              <div className="grid min-w-[680px] grid-cols-[minmax(0,1fr)_120px_120px_100px] bg-surface px-4 py-2 text-2xs font-semibold uppercase tracking-wide text-ink-tertiary">
                <span>Control</span>
                <span>Status</span>
                <span>Result</span>
                <span className="text-right">Reward (H2F)</span>
              </div>
              {CONTROLS.map((c) => (
                <div key={c.name} className={clsx('grid min-w-[680px] grid-cols-[minmax(0,1fr)_120px_120px_100px] items-center border-t border-hairline px-4 py-3 text-sm', c.broken ? 'bg-state-red-soft' : 'bg-surface-raised')}>
                  <span className="flex min-w-0 items-center gap-2 font-medium text-ink-primary">
                    {c.broken ? <ShieldX size={14} className="text-ink-danger" /> : <Check size={14} className="text-accent-text" />}
                    <span className="truncate">{c.name}</span>
                    {c.tag && <span className="rounded-sm bg-state-gray-soft px-1.5 py-0.5 text-2xs font-semibold text-ink-secondary-strong">{c.tag}</span>}
                  </span>
                  <span className={clsx('font-semibold', c.broken ? 'text-ink-danger' : 'text-accent-text')}>{c.status}</span>
                  <span className={clsx('flex items-center gap-1 font-medium', c.broken ? 'text-ink-danger' : 'text-accent-text')}>
                    {c.broken ? <X size={13} /> : <Check size={13} />} {c.result}
                  </span>
                  <span className="text-right font-medium text-ink-primary">{c.reward}</span>
                </div>
              ))}
            </div>
          </div>

          {/* witnesses grid */}
          <div className="mt-6">
            <div className="mb-2 text-sm font-medium text-ink-primary">Witnesses (6)</div>
            <div className="grid grid-cols-3 gap-2">
              {WITNESSES.map((w) => (
                <div key={w} className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-raised px-3 py-2.5 text-sm">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fill-accent text-ink-inverse"><Check size={11} strokeWidth={3} /></span>
                  <span className="flex-1 truncate text-ink-primary">{w}</span>
                  <span className="text-2xs font-semibold text-accent-text">KILLED</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* right panel */}
        <aside className="scrollbar-thin flex w-80 shrink-0 flex-col overflow-y-auto border-l border-hairline bg-background">
          <div className="px-5 pt-5">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl tracking-tight text-ink-primary">Reference solver baseline</h2>
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span className="rounded-sm bg-state-gray-soft px-1.5 py-0.5 text-2xs font-semibold text-ink-secondary-strong">CONTROL</span>
              <span className="flex items-center gap-1 text-ink-danger"><X size={13} /> Failed</span>
            </div>
            <div className="mt-4 flex gap-5 border-b border-hairline">
              {['Overview', 'Evidence', 'State Diff'].map((t, i) => (
                <button key={t} type="button" className={clsx('-mb-px border-b-2 pb-2 text-sm transition-[border-color,color,transform] duration-150 ease-out active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring', i === 0 ? 'border-ink-primary font-medium text-ink-primary' : 'border-transparent text-ink-secondary hover:text-ink-primary')}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 px-5 py-4">
            <div className="divide-y divide-hairline">
              <KV label="Branch ID" valueClass="font-mono text-xs">control-baseline-01</KV>
              <KV label="Status" valueClass="text-ink-danger text-xs font-semibold">REJECTED</KV>
              <KV label="Reward (H2F)">0.00</KV>
              <KV label="Similarity">0.28</KV>
            </div>
            <div className="mt-4">
              <div className="mb-1 text-sm text-ink-secondary">Notes</div>
              <p className="text-sm text-ink-secondary-strong">Reference solver deviates from expected output on patched verifier.</p>
            </div>
            <div className="mt-5 space-y-2">
              <div className="text-2xs font-semibold uppercase tracking-wide text-ink-tertiary">Actions</div>
              <Button variant="danger" size="md" className="w-full" icon={<RotateCcw size={14} />} onClick={returnToFixer}>Return to fixer</Button>
              <Button variant="secondary" size="md" className="w-full" icon={<FileText size={14} />} onClick={() => navigate('/artifacts')}>View failed control</Button>
              <Button variant="secondary" size="md" className="w-full" icon={<Eye size={14} />} onClick={() => navigate('/artifacts')}>View baseline state</Button>
            </div>
          </div>
        </aside>
      </div>
      <RunSummaryFooter
        stats={[
          { label: 'Killed', value: gateCounts.passed - preserved, tone: 'green' },
          { label: 'Failed', value: gateCounts.failed, tone: 'red' },
          { label: 'Preserved', value: preserved, tone: 'warn' },
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
          { icon: 'artifacts', label: 'Failed controls', value: gateCounts.failed, onClick: () => navigate('/artifacts') },
        ]}
        minimap={<MiniThumb variant="tree" />}
      />
    </>
  )
}
