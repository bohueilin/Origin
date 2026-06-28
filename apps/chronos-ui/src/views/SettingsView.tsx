import { useNavigate } from 'react-router-dom'
import { Database, ShieldCheck, GitFork, FileCheck2 } from '../components/icons'
import { RunHeader } from '../components/RunHeader'
import { RunSummaryFooter } from '../components/RunSummaryFooter'
import { MiniThumb } from '../components/MiniThumb'
import { Chip } from '../components/primitives'
import { getRunTreeCounts } from '../lib/runFooter'
import { useRun } from '../store/RunProvider'

function SettingRow({ icon, title, detail, status }: { icon: React.ReactNode; title: string; detail: string; status: string }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-sunken text-ink-tertiary">{icon}</span>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-ink-primary">{title}</div>
        <div className="truncate text-xs text-ink-secondary">{detail}</div>
      </div>
      <Chip status="plain" className="min-w-16 justify-center">{status}</Chip>
    </div>
  )
}

export function SettingsView() {
  const navigate = useNavigate()
  const run = useRun()
  const counts = getRunTreeCounts(run)

  return (
    <>
      <RunHeader title="Settings" version="v3.2" primaryLabel="Back to run" onPrimary={() => navigate('/runs')} />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-sunken text-ink-secondary">
              <Database size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-2xl tracking-tight text-ink-primary">Run settings</h2>
              <p className="text-sm text-ink-secondary">Read-only configuration for the current Traceback run.</p>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-lg border border-hairline bg-surface-raised">
            <SettingRow icon={<Database size={15} />} title="Environment" detail="mongodb-sales-aggregation-engine" status="locked" />
            <SettingRow icon={<GitFork size={15} />} title="ForkPoint mode" detail="Deterministic replay from confirmed trace boundary" status="locked" />
            <SettingRow icon={<FileCheck2 size={15} />} title="Proof set policy" detail="Witnesses must fail; legitimate controls must pass" status="locked" />
            <SettingRow icon={<ShieldCheck size={15} />} title="Release gate" detail="Publish only after committed release proof" status="locked" />
          </div>
        </div>
      </div>
      <RunSummaryFooter
        stats={[
          { label: 'Confirmed', value: counts.witnesses, tone: 'green' },
          { label: 'Candidates', value: counts.candidates, tone: 'warn' },
          { label: 'Baselines', value: counts.controls, tone: 'gray' },
        ]}
        total={counts.branches}
        cards={[
          { icon: 'witness', label: 'Confirmed witnesses', value: counts.witnesses, onClick: () => navigate('/witness?focus=confirmed') },
          { icon: 'proofset', label: 'Proof set', value: counts.proofSetMembers, onClick: () => navigate('/proofset') },
          { icon: 'releaseproof', label: 'Release proof', value: counts.releaseProofs, onClick: () => navigate('/releaseproof') },
          { icon: 'artifacts', label: 'View all artifacts', value: counts.branches, onClick: () => navigate('/artifacts') },
        ]}
        minimap={<MiniThumb variant="tree" branches={run.branches} selectedId={run.selectedBranchId} />}
      />
    </>
  )
}
