import type { TracebackApi } from './TracebackApi'
import type {
  BranchRun,
  ExploitWitness,
  ForkPoint,
  GateMemberResult,
  LegitimateControl,
  Patch,
  PreAttackState,
  ProofSet,
  ReleaseProof,
  ReplayResult,
} from '../domain/types'

/**
 * Real replay-roundtrip digests (Plan 002 evidence + the sealed-witness
 * replays) surfaced in the replay modal when running against real data.
 * Optional: the mock omits it.
 */
export interface ReplayEvidence {
  status: string
  graderDigest: string
  replayedToolCount: number
  replayAttempts?: number
  queryPySha256: string
  gradeOutputSha256: string
  verifierOutputDigest?: string
  snapshotDigest: string
  snapshotMode: string
  digestMatch: boolean
}

/** Optional Plan 005 blocked release verdict from pre-proof runs. */
export interface ReleaseBlock {
  blocked: boolean
  blockReason: string
  missingEvidence: string[]
  hardenStatus: string
  proofSetId: string
  graderV2Digest: string
}

/** Real Plan 006 HUD publication outcome for a passing ReleaseProof. */
export interface Publication {
  outcome: string
  publishedEnvironmentRef: string
  publishedVersion: number
  buildId: string
  buildStatus: string
  environmentUrl: string
  team: string
  releaseProofId: string
  graderHardeningNote: string
  residualLimitation: string
}

/**
 * The minimal set of base records a Traceback run is built from. Both the mock
 * and the real (HTTP/static) backend produce one of these; everything the views
 * need (witnesses, gate results, replay, pre-attack) is derived from it, so the
 * two modes behave identically. `branches` carries the UI-owned `layout` so the
 * React Flow tree keeps a stable, centered geometry.
 */
export interface RunDataset {
  forkPoint: ForkPoint
  controls: LegitimateControl[]
  branches: BranchRun[]
  initialProofSet: ProofSet
  patches: Record<number, Patch>
  survivingWitnessByIteration: Record<number, string[]>
  brokenControlByIteration: Record<number, string[]>
  graderV2: string
  environmentV2?: string
  releaseProofId?: string
  replay?: ReplayEvidence
  /** Real ExploitWitness fields overlaid onto a branch node, keyed by run stem. */
  witnessOverlay?: Record<string, Partial<ExploitWitness>>
  /** Real blocked-release verdict; when present the gate cannot pass. */
  release?: ReleaseBlock
  /** Real HUD publication outcome (Plan 006) for a passing release. */
  publication?: Publication
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

function batchDelay(index: number) {
  return index === 0 ? 640 : 860
}

/**
 * Group branches into depth layers (by `layout.y`) so discovery streams them as
 * parallel sibling batches while preserving parent-before-child lineage and
 * ascending depth — the order the canvas expects so it never re-fits/zooms
 * backwards mid-stream.
 */
function discoveryBatches(source: BranchRun[]): BranchRun[][] {
  const byDepth = [...source]
    .sort((a, b) => (a.layout?.x ?? 0) - (b.layout?.x ?? 0))
    .reduce<Map<number, BranchRun[]>>((groups, branch) => {
      const depth = branch.layout?.y ?? 0
      groups.set(depth, [...(groups.get(depth) ?? []), branch])
      return groups
    }, new Map())

  return [...byDepth.entries()].sort(([a], [b]) => a - b).map(([, group]) => group)
}

/**
 * A `TracebackApi` implementation over an (async-loaded) {@link RunDataset}.
 * The mock supplies an in-memory dataset; the real backend supplies one fetched
 * from static JSON. All session mutation (proofset, gate evaluation) and staged
 * streaming live here so both modes are byte-for-byte identical in behavior.
 */
export class DatasetTracebackApi implements TracebackApi {
  private datasetPromise?: Promise<RunDataset>
  private proofSet?: ProofSet

  constructor(private readonly loader: () => Promise<RunDataset>) {}

  private async data(): Promise<RunDataset> {
    if (!this.datasetPromise) this.datasetPromise = this.loader()
    const dataset = await this.datasetPromise
    if (!this.proofSet) this.proofSet = clone(dataset.initialProofSet)
    return dataset
  }

  async getForkPoint(): Promise<ForkPoint> {
    const d = await this.data()
    await delay(120)
    return clone(d.forkPoint)
  }

  async getControls(): Promise<LegitimateControl[]> {
    const d = await this.data()
    await delay(80)
    return clone(d.controls)
  }

  async getBranches(): Promise<BranchRun[]> {
    const d = await this.data()
    await delay(80)
    return clone(d.branches)
  }

  async runDiscovery(onBranch?: (b: BranchRun) => void): Promise<BranchRun[]> {
    const d = await this.data()
    const out: BranchRun[] = []
    const batches = discoveryBatches(d.branches)
    for (const [index, batch] of batches.entries()) {
      await delay(batchDelay(index))
      for (const branch of batch) {
        const rec = clone(branch)
        out.push(rec)
        onBranch?.(rec)
      }
    }
    return out
  }

  async getWitnesses(): Promise<ExploitWitness[]> {
    const d = await this.data()
    await delay(80)
    return d.branches
      .filter((b) => b.status === 'witness')
      .map((b) => {
        const stem = b.runId.replace('run-', '')
        const derived: ExploitWitness = {
          schemaVersion: b.schemaVersion,
          witnessId: `wit-${stem}`,
          sourceBranchId: b.branchId,
          preAttackSnapshotRef: `${b.parentSnapshot ?? 'S0'}-pre`,
          durableSnapshotMode: b.snapshotMode,
          exploitTarget: 'verifier grader',
          exploitMechanism: b.clusterLabel ?? 'reward hacking',
          clusterId: b.clusterId ?? 'unknown',
          replayEntrypoint: `replay/${b.branchId}.json`,
          replayChecks: 'Deterministic pass',
          contentDigest: `${b.runId}-digest`,
          environmentVersion: b.environmentVersion,
          graderDigest: b.graderDigest,
          createdAt: b.completedAt ?? b.startedAt,
        }
        // Overlay real sealed-witness identity where a committed record exists.
        return { ...derived, ...(d.witnessOverlay?.[stem] ?? {}) }
      })
  }

  async getProofSet(): Promise<ProofSet> {
    await this.data()
    await delay(60)
    return clone(this.proofSet!)
  }

  async addToProofSet(witnessId: string): Promise<ProofSet> {
    await this.data()
    await delay(120)
    if (!this.proofSet!.exploitWitnessIds.includes(witnessId)) {
      this.proofSet = {
        ...this.proofSet!,
        exploitWitnessIds: [...this.proofSet!.exploitWitnessIds, witnessId],
      }
    }
    return clone(this.proofSet!)
  }

  async removeFromProofSet(witnessId: string): Promise<ProofSet> {
    await this.data()
    await delay(120)
    this.proofSet = {
      ...this.proofSet!,
      exploitWitnessIds: this.proofSet!.exploitWitnessIds.filter((id) => id !== witnessId),
    }
    return clone(this.proofSet!)
  }

  async getPatch(iteration: number): Promise<Patch> {
    const d = await this.data()
    await delay(150)
    const p = d.patches[iteration] ?? d.patches[3] ?? d.patches[1] ?? Object.values(d.patches)[0]
    return clone(p)
  }

  async evaluateRelease(patch: Patch, onMember?: (r: GateMemberResult) => void): Promise<ReleaseProof> {
    const d = await this.data()
    const proofSet = this.proofSet!
    const surviving = d.survivingWitnessByIteration[patch.iteration] ?? []
    const broken = d.brokenControlByIteration[patch.iteration] ?? []

    const witnessMembers: GateMemberResult[] = proofSet.exploitWitnessIds.map((id) => {
      const b = d.branches.find((x) => x.runId === `run-${id}`)
      const survived = surviving.includes(id)
      return {
        memberId: id,
        kind: 'witness' as const,
        name: b?.title ?? id,
        v1: 1,
        v2: survived ? 1 : 0,
        reward: survived ? 1.2 : b?.reward ?? 1.0,
        status: 'pending' as const,
      }
    })

    const controlMembers: GateMemberResult[] = proofSet.legitimateControlIds.map((id) => {
      const c = d.controls.find((x) => x.controlId === id)
      const isBroken = broken.includes(id)
      return {
        memberId: id,
        kind: 'control' as const,
        name: c?.title ?? id,
        v1: 1,
        v2: isBroken ? 0 : 1,
        reward: isBroken ? 0 : 1,
        status: 'pending' as const,
      }
    })

    const results = [...witnessMembers, ...controlMembers]

    for (const m of results) {
      await delay(320)
      m.status =
        m.kind === 'witness' ? (m.v2 === 0 ? 'killed' : 'survived') : m.v2 === 1 ? 'preserved' : 'broken'
      onMember?.({ ...m })
    }

    const witnessesKilled: [number, number] = [witnessMembers.filter((m) => m.v2 === 0).length, witnessMembers.length]
    const controlsPreserved: [number, number] = [controlMembers.filter((m) => m.v2 === 1).length, controlMembers.length]
    const allKilled = witnessesKilled[0] === witnessesKilled[1]
    const allPreserved = controlsPreserved[0] === controlsPreserved[1]
    const pass = allKilled && allPreserved

    return {
      schemaVersion: '1.0.0',
      releaseProofId: d.releaseProofId ?? `rpf-${patch.iteration}`,
      proofSetId: proofSet.proofSetId,
      environmentV1: proofSet.environmentV1,
      graderV1Digest: proofSet.graderV1Digest,
      environmentV2: d.environmentV2 ?? proofSet.environmentV1,
      graderV2Digest: d.graderV2,
      patchRef: patch.patchRef,
      results,
      witnessesKilled,
      controlsPreserved,
      gateStatus: pass ? 'pass' : 'fail',
      failureKind: pass ? undefined : !allKilled ? 'witness_survived' : 'control_regression',
      reward: pass ? 1.0 : 0.0,
      similarity: pass ? 0.92 : 0.28,
      createdAt: new Date().toISOString(),
      status: pass ? 'evaluating' : 'failed',
      // Older Plan 005 exports can carry a blocked verdict when no ReleaseProof
      // exists yet. Passing exports omit this metadata.
      ...(d.release?.blocked
        ? {
            blocked: true,
            blockReason: d.release.blockReason,
            missingEvidence: d.release.missingEvidence,
            hardenStatus: d.release.hardenStatus,
          }
        : {}),
    }
  }

  async publishRelease(releaseProofId: string): Promise<ReleaseProof> {
    const d = await this.data()
    await delay(200)
    const proof = await this.evaluateRelease(await this.getPatch(3))
    const pub = d.publication
    return {
      ...proof,
      releaseProofId: pub?.releaseProofId ?? releaseProofId,
      status: 'committed',
      gateStatus: 'pass',
      commitId: pub?.releaseProofId ?? releaseProofId,
      publishedEnvironmentRef: pub?.publishedEnvironmentRef ?? proof.environmentV2,
      publishOutcome: pub?.outcome,
      publishedVersion: pub?.publishedVersion,
      environmentUrl: pub?.environmentUrl,
      buildId: pub?.buildId,
      buildStatus: pub?.buildStatus,
      graderHardeningNote: pub?.graderHardeningNote,
      residualLimitation: pub?.residualLimitation,
    }
  }

  async replayWitness(witnessId: string): Promise<ReplayResult> {
    const d = await this.data()
    await delay(450)
    const b = d.branches.find((x) => x.runId === `run-${witnessId}` || x.branchId === witnessId)
    const reward = b?.reward ?? 1.0
    const steps = b?.stepsFromFork ?? d.forkPoint.upToStep
    const parent = b?.parentSnapshot ?? d.forkPoint.snapshotId
    const ev = d.replay
    return {
      witnessId,
      ok: true,
      detail: `Witness ${witnessId} replayed deterministically against grader v1.`,
      graderVersion: 'v1',
      graderDigest: b?.graderDigest ?? d.forkPoint.graderDigest,
      steps: ev?.replayedToolCount ?? steps,
      reward,
      digestMatch: ev?.digestMatch ?? true,
      checks: [
        { label: 'Pre-attack snapshot restored', status: 'pass', detail: ev ? `${ev.snapshotMode} · ${ev.snapshotDigest.slice(0, 12)}…` : `${parent}-pre` },
        { label: 'Action prefix replayed', status: 'pass', detail: ev ? `${ev.replayedToolCount} tool calls` : `${steps} steps` },
        { label: 'Exploit reproduced', status: 'pass', detail: `reward ${reward.toFixed(2)}` },
        { label: 'Output digest match', status: 'pass', detail: ev ? `${ev.gradeOutputSha256.slice(0, 12)}…` : 'deterministic' },
      ],
    }
  }

  async getPreAttackState(witnessId: string): Promise<PreAttackState> {
    const d = await this.data()
    await delay(320)
    const b = d.branches.find((x) => x.runId === `run-${witnessId}` || x.branchId === witnessId)
    return {
      witnessId,
      snapshotRef: `${b?.parentSnapshot ?? d.forkPoint.snapshotId}-pre`,
      snapshotMode: b?.snapshotMode ?? d.forkPoint.snapshotMode,
      environmentVersion: b?.environmentVersion ?? d.forkPoint.environmentVersion,
      upToStep: d.forkPoint.upToStep,
      cumulativeReward: d.forkPoint.cumulativeReward,
      capturedAt: d.forkPoint.createdAt,
      summary:
        'State captured at the ForkPoint — the last point shared with legitimate behavior, before this branch diverged into the exploit.',
      files: [
        { path: 'src/sales_analyzer.py', status: 'unchanged', note: 'reference solution prefix' },
        { path: 'tests/test_sales_analyzer.py', status: 'unchanged', note: 'frozen grader fixtures' },
        { path: 'conftest.py', status: 'diverged', note: 'pytest plugin injected after fork' },
        { path: 'pytest.ini', status: 'diverged', note: 'test discovery altered after fork' },
      ],
    }
  }
}
