import type {
  BranchRun,
  ExploitWitness,
  ForkPoint,
  LegitimateControl,
  Patch,
  PreAttackState,
  ProofSet,
  ReleaseProof,
  ReplayResult,
  GateMemberResult,
} from '../domain/types'

/**
 * The single seam between the UI and a Traceback backend.
 *
 * Methods mirror the "Logical operations" in
 * `docs/plans/specs/03-interfaces.md`. The current implementation
 * (`MockTracebackApi`) is in-memory; a real backend implements this same
 * interface (e.g. an `HttpTracebackApi` calling the Plan 003/005/006 services)
 * and the store + views are unchanged.
 *
 * Streaming operations (discovery, release evaluation) take an `onItem`
 * callback so the UI can render progress incrementally, matching how the real
 * stochastic discovery and deterministic replay phases produce results over
 * time.
 */
export interface TracebackApi {
  /** Select source trace + capture ForkPoint. Returns the immutable ForkPoint. */
  getForkPoint(): Promise<ForkPoint>

  /** Frozen legitimate controls for the task (>= 3, path-diverse). */
  getControls(): Promise<LegitimateControl[]>

  /**
   * Run Branch (stochastic discovery) from the ForkPoint. Streams BranchRuns as
   * they complete; resolves with the full set. Includes classify + dedup so
   * statuses (promising / witness / duplicate / dead_end / control) are final.
   */
  runDiscovery(onBranch?: (branch: BranchRun) => void): Promise<BranchRun[]>

  /** Get already-discovered branches without re-running discovery. */
  getBranches(): Promise<BranchRun[]>

  /** Materialized Exploit Witnesses (branches promoted past all gates). */
  getWitnesses(): Promise<ExploitWitness[]>

  /** Current ProofSet (rerunnable taskset). */
  getProofSet(): Promise<ProofSet>
  addToProofSet(witnessId: string): Promise<ProofSet>
  removeFromProofSet(witnessId: string): Promise<ProofSet>

  /** Fix verifier: harden-v0 produces a patch for the given attempt iteration. */
  getPatch(iteration: number): Promise<Patch>

  /**
   * Evaluate release: replay the ProofSet against the patched grader v2.
   * Streams per-member results; resolves with the ReleaseProof verdict.
   */
  evaluateRelease(patch: Patch, onMember?: (result: GateMemberResult) => void): Promise<ReleaseProof>

  /** Publish/display release for a passing ReleaseProof. */
  publishRelease(releaseProofId: string): Promise<ReleaseProof>

  /** Replay a single Witness deterministically against a target grader version. */
  replayWitness(witnessId: string): Promise<ReplayResult>

  /** Restore and return the captured pre-attack (ForkPoint) state for a Witness. */
  getPreAttackState(witnessId: string): Promise<PreAttackState>
}
