import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { NodeMouseHandler } from '@xyflow/react'
import { RunHeader } from '../components/RunHeader'
import { RunSummaryFooter } from '../components/RunSummaryFooter'
import { RunCanvas } from '../components/RunCanvas'
import { ForkPointPanel, TracePanel } from '../components/panels'
import { MiniThumb } from '../components/MiniThumb'
import { rootGraph } from '../data/graphs'
import { getRunTreeCounts } from '../lib/runFooter'
import { useRun } from '../store/RunProvider'

type Step = 'trace' | 'forkpoint'

export function RunRoot() {
  const navigate = useNavigate()
  const run = useRun()
  const [step, setStep] = useState<Step>('trace')

  const onStart = () => {
    run.startDiscovery()
    navigate('/witness')
  }

  const onNodeClick: NodeMouseHandler = (_, node) => {
    if (node.id === 'forkpoint') setStep('forkpoint')
  }

  const counts = getRunTreeCounts(run)

  return (
    <>
      <RunHeader
        title="Traceback Run"
        version="v3.2"
        subtitle="mongodb-sales-aggregation-engine"
        primaryLabel={step === 'trace' ? 'Open as ForkPoint' : 'Start candidate paths'}
        onPrimary={step === 'trace' ? () => setStep('forkpoint') : onStart}
      />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <RunCanvas nodes={rootGraph.nodes} edges={rootGraph.edges} onNodeClick={onNodeClick} fitPadding={0.12} fitMaxZoom={0.85} />
        </div>
        {run.loading ? null : step === 'trace' && run.forkPoint ? (
          <TracePanel forkPoint={run.forkPoint} onOpenForkPoint={() => setStep('forkpoint')} />
        ) : (
          <ForkPointPanel onStart={onStart} />
        )}
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
          { icon: 'artifacts', label: 'View all artifacts', value: counts.branches + counts.proofSetMembers, onClick: () => navigate('/artifacts') },
        ]}
        minimap={<MiniThumb variant="row" />}
      />
    </>
  )
}
