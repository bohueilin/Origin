// Type surface for overGrant.mjs — the deterministic over-grant / authorization-risk analyzer.

export type Classification = 'low' | 'medium' | 'high' | 'forbidden'
export type Capability = 'read' | 'write' | 'execute' | 'export' | 'delete'
export type Decision = 'allow' | 'deny' | 'escalate'

export interface OverGrantResource {
  id: string
  classification: Classification
  /** can move bytes OUT of the trust boundary — the third leg of the lethal trifecta */
  egress: boolean
}

export interface OverGrantIdentity {
  id: string
  parent: string | null
  owner: string
  /** processed untrusted content in the window; tracked outside the model's context */
  tainted: boolean
  /** scope strings, `${resource}:${capability}` */
  granted: string[]
  granted_day: number
  ttl_days: number
}

export interface OverGrantEvent {
  day: number
  identity: string
  scope: string
  decision: Decision
}

export interface PlantedGroundTruth {
  /** identity ids on the child side of a deliberately widened delegation edge */
  violationEdges: string[]
  /** `${identityId}|${scope}` granted and, by construction, never exercised */
  dormantScopes: string[]
}

export interface OverGrantCorpus {
  seed: number
  windowDays: number
  resources: OverGrantResource[]
  identities: OverGrantIdentity[]
  events: OverGrantEvent[]
  planted: PlantedGroundTruth
}

export interface GurMetric {
  scopesGranted: number
  scopesExercised: number
  /** Σexercised ÷ Σgranted — deliberately NOT the mean of per-identity ratios */
  fleetGur: number
  overGrantSurface: number
  perIdentity: { id: string; granted: number; used: number; gur: number }[]
}

export interface BriMetric {
  sensitiveResources: number
  meanBri: number
  p95Bri: number
  maxBri: number
  perIdentity: { id: string; reachable: number; bri: number }[]
}

export interface AmvMetric {
  delegationEdges: number
  violatingEdges: { child: string; parent: string; widened: string[] }[]
  violatingEdgeCount: number
  violatingScopes: number
  violationRate: number
}

export interface TrpMetric {
  taintedIdentities: number
  exposedIdentities: number
  exposureRate: number
  /** Σ (sensitive readable × egress writable) over exposed identities — the surface, not the headcount */
  paths: number
  exposed: { id: string; sensitiveReads: string[]; egressWrites: string[]; paths: number }[]
}

export interface SahMetric {
  scopes: number
  exercisedScopes: number
  medianStalenessRatio: number
  medianSpanToTtl: number
  /** cross-reference only — equals GUR's complement by construction */
  dormantScopes: number
}

export interface OverGrantReport {
  version: string
  versions: { analyzer_version: string; corpus_version: string }
  corpusDigest: string
  metrics: { gur: GurMetric; bri: BriMetric; amv: AmvMetric; trp: TrpMetric; sah: SahMetric }
}

export interface GroundTruthScore {
  amv: { planted: number; caught: number; catchRate: number; falsePositives: number; falsePositiveRate: number }
  dormant: { planted: number; measured: number; exact: boolean }
}

export interface OverGrantBenchReport {
  analyzer: string
  corpus: string
  scope: string
  seed: number
  windowDays: number
  fleet: {
    identities: number
    delegationEdges: number
    events: number
    resources: number
    sensitiveResources: number
    egressResources: number
  }
  metrics: {
    gur: Pick<GurMetric, 'scopesGranted' | 'scopesExercised' | 'fleetGur' | 'overGrantSurface'>
    bri: Pick<BriMetric, 'sensitiveResources' | 'meanBri' | 'p95Bri' | 'maxBri'>
    amv: Pick<AmvMetric, 'delegationEdges' | 'violatingEdgeCount' | 'violatingScopes' | 'violationRate'>
    trp: Pick<TrpMetric, 'taintedIdentities' | 'exposedIdentities' | 'exposureRate' | 'paths'>
    sah: SahMetric
  }
  groundTruth: GroundTruthScore
  corpusDigest: string
  digest: string
}

export interface CorpusOptions {
  seed?: number
  roots?: number
  depth?: number
  windowDays?: number
  violationRate?: number
}

export const OVER_GRANT_VERSION: string
export const OVER_GRANT_VERSIONS: { analyzer_version: string; corpus_version: string }
export const CAPABILITIES: readonly Capability[]
export const resources: OverGrantResource[]

export function isSensitive(resource: OverGrantResource): boolean
export function scopeOf(resourceId: string, capability: string): string
export function parseScope(scope: string): { resource: string; capability: string }

export function generateCorpus(options?: CorpusOptions): OverGrantCorpus
export function effectiveScopes(corpus: OverGrantCorpus): Map<string, Set<string>>
export function grantUtilization(corpus: OverGrantCorpus): GurMetric
export function blastRadius(corpus: OverGrantCorpus, eff?: Map<string, Set<string>>): BriMetric
export function attenuationViolations(corpus: OverGrantCorpus): AmvMetric
export function taintReachability(corpus: OverGrantCorpus, eff?: Map<string, Set<string>>): TrpMetric
export function standingAuthority(corpus: OverGrantCorpus): SahMetric
export function corpusDigest(corpus: OverGrantCorpus): string
export function analyzeOverGrant(corpus: OverGrantCorpus): OverGrantReport
export function scoreAgainstGroundTruth(report: OverGrantReport, planted: PlantedGroundTruth): GroundTruthScore
export function runOverGrantBench(options?: CorpusOptions): OverGrantBenchReport
