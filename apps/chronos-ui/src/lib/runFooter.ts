import type { BranchRun, GateMemberResult, LegitimateControl, ProofSet, ReleaseProof } from '../domain/types'

const CANDIDATE_STATUSES = new Set(['rewarded', 'qa_review', 'promising', 'verifying'])
const CONTROL_STATUSES = new Set(['control', 'control_pass'])

export interface RunTreeCounts {
  witnesses: number
  candidates: number
  controlsInTree: number
  branches: number
  controls: number
  proofSetMembers: number
  releaseProofs: number
}

export function getRunTreeCounts({
  branches,
  controls,
  proofSet,
  releaseProof,
}: {
  branches: BranchRun[]
  controls: LegitimateControl[]
  proofSet?: ProofSet
  releaseProof?: ReleaseProof
}): RunTreeCounts {
  const controlsInTree = branches.filter((branch) => CONTROL_STATUSES.has(branch.status)).length

  return {
    witnesses: branches.filter((branch) => branch.status === 'witness').length,
    candidates: branches.filter((branch) => CANDIDATE_STATUSES.has(branch.status)).length,
    controlsInTree,
    branches: branches.length,
    controls: controlsInTree || controls.length,
    proofSetMembers:
      (proofSet?.exploitWitnessIds.length ?? 0) +
      (proofSet?.legitimateControlIds.length ?? 0) +
      (proofSet?.exploitFamilyVariantIds.length ?? 0),
    releaseProofs: releaseProof ? 1 : 0,
  }
}

export function getGateCounts(results: GateMemberResult[], total: number) {
  const passed = results.filter((result) => (result.kind === 'witness' ? result.v2 === 0 : result.v2 === 1)).length
  const failed = results.filter((result) => (result.kind === 'witness' ? result.v2 === 1 : result.v2 === 0)).length

  return {
    passed,
    failed,
    pending: Math.max(total - results.length, 0),
    total,
  }
}
