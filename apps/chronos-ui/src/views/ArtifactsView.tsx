import { useNavigate } from 'react-router-dom'
import { Database, FileCheck2, FileDiff, FolderOpen, GitFork, ShieldCheck } from '../components/icons'
import { RunHeader } from '../components/RunHeader'
import { RunSummaryFooter } from '../components/RunSummaryFooter'
import { MiniThumb } from '../components/MiniThumb'
import { Chip } from '../components/primitives'
import { getRunTreeCounts } from '../lib/runFooter'
import { useRun } from '../store/RunProvider'

const KIND_ICON = {
  witness: GitFork,
  proofset: FileCheck2,
  release: ShieldCheck,
  evidence: FileDiff,
}

function ArtifactRow({
  kind,
  title,
  detail,
  status,
  onOpen,
}: {
  kind: keyof typeof KIND_ICON
  title: string
  detail: string
  status: string
  onOpen: () => void
}) {
  const Icon = KIND_ICON[kind]
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-hairline px-4 py-3 text-left transition-[background-color,transform] duration-150 ease-out last:border-b-0 hover:bg-tint-green active:scale-[0.995] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-sunken text-ink-tertiary">
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-ink-primary">{title}</div>
        <div className="break-all font-mono text-xs text-ink-secondary">{detail}</div>
      </div>
      <Chip className="min-w-16 justify-center" status={status === 'committed' || status === 'witness' ? 'witness' : status === 'pending' ? 'qa-review' : 'plain'}>
        {status}
      </Chip>
    </button>
  )
}

export function ArtifactsView() {
  const navigate = useNavigate()
  const run = useRun()
  const counts = getRunTreeCounts(run)

  const rows = [
    ...run.branches.map((branch) => ({
      kind: 'witness' as const,
      title: branch.title,
      detail: `${branch.branchId} · reward ${branch.reward.toFixed(2)} · ${branch.environmentVersion}`,
      status: branch.status.replace('_', ' '),
      route: `/witness`,
    })),
    ...(run.proofSet
      ? [
          {
            kind: 'proofset' as const,
            title: 'Proof set manifest',
            detail: `${run.proofSet.exploitWitnessIds.length} witnesses · ${run.proofSet.legitimateControlIds.length} controls · ${run.proofSet.exploitFamilyVariantIds.length} variants`,
            status: 'ready',
            route: '/proofset',
          },
        ]
      : []),
    {
      kind: 'release' as const,
      title: 'Release proof',
      detail: run.releaseProof?.commitId ?? 'No committed release proof yet',
      status: run.releaseProof?.status ?? 'pending',
      route: '/releaseproof',
    },
    {
      kind: 'evidence' as const,
      title: 'Trace and replay evidence',
      detail: run.forkPoint ? `${run.forkPoint.hudTraceId} · ${run.forkPoint.snapshotId}` : 'Loading evidence',
      status: run.forkPoint ? 'ready' : 'pending',
      route: '/runs',
    },
  ]

  return (
    <>
      <RunHeader title="Artifacts" version="v3.2" primaryLabel="Back to run" onPrimary={() => navigate('/runs')} />
      <div className="flex min-h-0 flex-1">
        <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto px-8 py-8">
          <div className="mx-auto max-w-4xl">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-sunken text-ink-secondary">
                <FolderOpen size={20} />
              </span>
              <div>
                <h2 className="font-display text-2xl tracking-tight text-ink-primary">Evidence artifacts</h2>
                <p className="text-sm text-ink-secondary">Run outputs, proof set material, and release evidence.</p>
              </div>
            </div>

            <div className="mt-6 rounded-lg border border-hairline bg-surface-raised">
              {rows.map((row) => (
                <ArtifactRow key={`${row.kind}-${row.title}`} {...row} onOpen={() => navigate(row.route)} />
              ))}
            </div>
          </div>
        </div>
        <aside className="hidden w-80 shrink-0 border-l border-hairline bg-background px-5 py-5 xl:block">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-ink-tertiary" />
            <h2 className="font-display text-xl tracking-tight text-ink-primary">Inventory</h2>
          </div>
          <div className="mt-4 divide-y divide-hairline text-sm">
            <div className="flex justify-between py-2"><span className="text-ink-secondary">Branches</span><span className="font-medium text-ink-primary">{counts.branches}</span></div>
            <div className="flex justify-between py-2"><span className="text-ink-secondary">Proof set members</span><span className="font-medium text-ink-primary">{counts.proofSetMembers}</span></div>
            <div className="flex justify-between py-2"><span className="text-ink-secondary">Release proofs</span><span className="font-medium text-ink-primary">{counts.releaseProofs}</span></div>
            <div className="flex justify-between py-2"><span className="text-ink-secondary">Total artifacts</span><span className="font-medium text-ink-primary">{rows.length}</span></div>
          </div>
        </aside>
      </div>
      <RunSummaryFooter
        stats={[
          { label: 'Confirmed', value: counts.witnesses, tone: 'green' },
          { label: 'Candidates', value: counts.candidates, tone: 'warn' },
          { label: 'Baselines', value: counts.controls, tone: 'gray' },
        ]}
        total={counts.branches}
        cards={[
          { icon: 'witness', label: 'Confirmed witnesses', value: counts.witnesses, onClick: () => navigate('/witness') },
          { icon: 'proofset', label: 'Proof set', value: counts.proofSetMembers, onClick: () => navigate('/proofset') },
          { icon: 'releaseproof', label: 'Release proof', value: counts.releaseProofs, onClick: () => navigate('/releaseproof') },
          { icon: 'artifacts', label: 'View all artifacts', value: rows.length, onClick: () => navigate('/artifacts') },
        ]}
        minimap={<MiniThumb variant="tree" branches={run.branches} selectedId={run.selectedBranchId} />}
      />
    </>
  )
}
