import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { GitFork, Loader2, Play, PlusCircle } from '../components/icons'
import { NodeToolbar, Position } from '@xyflow/react'
import type { NodeMouseHandler } from '@xyflow/react'
import { RunHeader } from '../components/RunHeader'
import { RunSummaryFooter } from '../components/RunSummaryFooter'
import { RunCanvas } from '../components/RunCanvas'
import { BranchPanel, ForkPointPanel, KV, PanelShell, ProofSetPanel } from '../components/panels'
import { Button, Chip, Divider } from '../components/primitives'
import { ReplayWitnessModal, PreAttackStateModal } from '../components/WitnessModals'
import { WitnessTree } from '../components/WitnessTree'
import { NodePopover } from '../components/NodePopover'
import { MiniThumb } from '../components/MiniThumb'
import { buildRunGraph } from '../data/buildGraph'
import { variantNames } from '../api/mock/fixtures'
import { getRunTreeCounts } from '../lib/runFooter'
import { useRun } from '../store/RunProvider'
import type { BranchRun } from '../domain/types'

const DISCOVERY_TARGET = 10

function ConfirmedWitnessesPanel({
  witnesses,
  selectedId,
  inProofSet,
  onSelect,
  onClose,
  onReplay,
  onAddToProofSet,
}: {
  witnesses: BranchRun[]
  selectedId?: string
  inProofSet?: boolean
  onSelect: (id: string) => void
  onClose: () => void
  onReplay?: () => void
  onAddToProofSet?: () => void
}) {
  const selected = witnesses.find((branch) => branch.runId === `run-${selectedId}`) ?? witnesses[0]

  return (
    <PanelShell title="Confirmed witnesses" tag={String(witnesses.length)} tagStatus="witness" onClose={onClose}>
      <div className="space-y-2">
        {witnesses.map((branch) => {
          const id = branch.runId.replace('run-', '')
          const active = id === selectedId
          return (
            <button
              key={branch.runId}
              type="button"
              onClick={() => onSelect(id)}
              className={[
                'w-full rounded-lg border px-3 py-2 text-left transition-[background-color,border-color,transform] duration-150 ease-out hover:bg-tint-green active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'border-fill-accent bg-green-50/60' : 'border-hairline bg-surface-raised',
              ].join(' ')}
            >
              <div className="flex items-start gap-2">
                <GitFork size={14} className="mt-0.5 shrink-0 text-accent-text" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-primary">{branch.title}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-ink-secondary">
                    <Chip status="witness">CONFIRMED</Chip>
                    <span>reward {branch.reward.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {selected && (
        <>
          <Divider className="my-4" />
          <div className="divide-y divide-hairline">
            <KV label="Selected">{selected.title}</KV>
            <KV label="Confirmation" valueClass="text-accent-text">Deterministic pass</KV>
            <KV label="Cluster">{selected.clusterLabel ?? '-'}</KV>
            <KV label="Branch ID" valueClass="font-mono text-xs">{selected.branchId}</KV>
          </div>
          <div className="mt-5 space-y-2">
            <Button variant="primary" size="md" className="w-full" icon={<Play size={14} />} onClick={onReplay}>
              Replay selected witness
            </Button>
            <Button
              variant="secondary"
              size="md"
              className="w-full"
              icon={<PlusCircle size={14} />}
              onClick={inProofSet ? undefined : onAddToProofSet}
              disabled={inProofSet}
            >
              {inProofSet ? 'Already in proof set' : 'Add selected to proof set'}
            </Button>
          </div>
        </>
      )}
    </PanelShell>
  )
}

export function RunWitness({ mode = 'branch' }: { mode?: 'branch' | 'proofset' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const run = useRun()
  const [pop, setPop] = useState<{ id: string } | null>(null)
  const [modal, setModal] = useState<{ kind: 'replay' | 'preattack'; id: string; title: string } | null>(null)
  const [showForkPoint, setShowForkPoint] = useState(false)
  const wasConfirmedFocus = useRef(false)

  const { nodes, edges } = useMemo(
    () => buildRunGraph(run.forkPoint, run.branches, run.selectedBranchId),
    [run.forkPoint, run.branches, run.selectedBranchId],
  )

  const selected = run.selectedBranch()
  const canShowSidePanel = run.phase !== 'discovering'
  const popBranch = pop ? run.branches.find((b) => b.runId === `run-${pop.id}`) : undefined
  const inProofSet = selected ? run.proofSet?.exploitWitnessIds.includes(run.selectedBranchId ?? '') : false
  const confirmedFocus = new URLSearchParams(location.search).get('focus') === 'confirmed'
  const confirmedWitnesses = run.branches.filter((branch) => branch.status === 'witness')

  const counts = getRunTreeCounts(run)

  useEffect(() => {
    if (!confirmedFocus) {
      wasConfirmedFocus.current = false
      return
    }
    const firstWitness = run.branches.find((branch) => branch.status === 'witness')
    const enteringConfirmedFocus = !wasConfirmedFocus.current
    wasConfirmedFocus.current = true
    if (firstWitness && (enteringConfirmedFocus || selected?.status !== 'witness')) {
      run.select(firstWitness.runId.replace('run-', ''))
    }
  }, [confirmedFocus, run.branches, run.select, selected?.status])

  const onNodeClick: NodeMouseHandler = (_, node) => {
    if (node.id === 'fork') {
      setShowForkPoint(true)
      run.select(undefined)
      setPop(null)
      return
    }
    setShowForkPoint(false)
    run.select(node.id)
    const branch = run.branches.find((b) => b.runId === `run-${node.id}`)
    if (confirmedFocus && branch?.status !== 'witness') navigate('/witness', { replace: true })
    if (branch && node.type === 'branch') setPop({ id: node.id })
    else setPop(null)
  }

  return (
    <>
      <RunHeader
        title="Exploit Paths"
        version="v3.2"
        primaryLabel={run.phase === 'discovering' ? 'Discovering…' : 'Run candidate paths'}
        onPrimary={run.phase !== 'discovering' ? run.startDiscovery : undefined}
      />
      {run.phase === 'discovering' && (
        <div className="flex items-center gap-3 border-b border-hairline bg-surface-raised px-8 py-2.5">
          <Loader2 size={14} className="animate-spin text-accent-text" />
          <span className="text-sm text-ink-secondary-strong">Discovering candidate exploit paths…</span>
          <span className="ml-auto font-mono text-sm text-ink-secondary">
            {run.branches.length} / {DISCOVERY_TARGET}
          </span>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <RunCanvas
            nodes={nodes}
            edges={edges}
            onNodeClick={onNodeClick}
            fitPadding={0.02}
            fitMaxZoom={0.86}
            fitMinZoom={0.86}
          >
            {pop && popBranch && (
              <NodeToolbar nodeId={pop.id} isVisible position={Position.Bottom} offset={14} align="center">
                <NodePopover
                  branch={popBranch}
                  onClose={() => setPop(null)}
                  onReplay={() => {
                    setModal({ kind: 'replay', id: pop.id, title: popBranch.title })
                    setPop(null)
                  }}
                  onViewPreAttackState={() => {
                    setModal({ kind: 'preattack', id: pop.id, title: popBranch.title })
                    setPop(null)
                  }}
                  onAddToProofSet={() => {
                    run.addToProofSet(pop.id)
                    setPop(null)
                    navigate('/proofset')
                  }}
                />
              </NodeToolbar>
            )}
          </RunCanvas>
        </div>
        {canShowSidePanel && showForkPoint ? (
          <ForkPointPanel onStart={run.startDiscovery} onClose={() => setShowForkPoint(false)} />
        ) : canShowSidePanel && confirmedFocus ? (
          <ConfirmedWitnessesPanel
            witnesses={confirmedWitnesses}
            selectedId={run.selectedBranchId}
            inProofSet={inProofSet}
            onSelect={(id) => run.select(id)}
            onClose={() => navigate('/witness')}
            onReplay={() => selected && setModal({ kind: 'replay', id: run.selectedBranchId ?? '', title: selected.title })}
            onAddToProofSet={() => {
              run.addToProofSet(run.selectedBranchId ?? '')
              navigate('/proofset')
            }}
          />
        ) : canShowSidePanel && mode === 'proofset' && run.proofSet ? (
          <ProofSetPanel
            proofSet={run.proofSet}
            branches={run.branches}
            controls={run.controls}
            variantNames={variantNames}
            onRun={async () => {
              await run.loadPatch(run.fixIteration)
              navigate('/patch')
            }}
            onClose={() => navigate('/witness')}
          />
        ) : canShowSidePanel && selected ? (
          <BranchPanel
            branch={selected}
            inProofSet={inProofSet}
            onClose={() => run.select(undefined)}
            onAddToProofSet={() => {
              run.addToProofSet(run.selectedBranchId ?? '')
              navigate('/proofset')
            }}
            onRemoveFromProofSet={() => run.removeFromProofSet(run.selectedBranchId ?? '')}
            onReplay={() => setModal({ kind: 'replay', id: run.selectedBranchId ?? '', title: selected.title })}
            onViewPreAttackState={() => setModal({ kind: 'preattack', id: run.selectedBranchId ?? '', title: selected.title })}
          />
        ) : null}
      </div>
      {modal?.kind === 'replay' && (
        <ReplayWitnessModal
          branchId={modal.id}
          title={modal.title}
          replay={run.replayWitness}
          tree={<WitnessTree forkPoint={run.forkPoint} branches={run.branches} focusId={modal.id} mode="replay" />}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'preattack' && (
        <PreAttackStateModal
          branchId={modal.id}
          title={modal.title}
          load={run.viewPreAttackState}
          tree={<WitnessTree forkPoint={run.forkPoint} branches={run.branches} focusId={modal.id} mode="preattack" />}
          onClose={() => setModal(null)}
        />
      )}
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
          {
            icon: 'releaseproof',
            label: 'Release proof',
            value: counts.releaseProofs,
            onClick: () => navigate('/releaseproof'),
          },
          { icon: 'artifacts', label: 'View all artifacts', value: counts.branches + counts.proofSetMembers, onClick: () => navigate('/artifacts') },
        ]}
        minimap={<MiniThumb variant="tree" branches={run.branches} selectedId={run.selectedBranchId} />}
      />
    </>
  )
}
