// ----------------------------------------------------------------------------
// PROTOTYPE server-owned episode path for the hackathon.
//
// Trust boundary: the client sends ONLY { scenarioId, policyMode }. Everything
// authoritative — the canonical scenario, the policy view, the chosen action,
// the deterministic verifier result, reward, and license — is computed HERE on
// the server. The client never supplies (and the server never trusts) hiddenRisk,
// correctAction, verifierResult, reward, licenseLevel, catastrophic, pass/fail,
// expected action, or license summary.
//
// The deterministic verifier remains the source of truth. InsForge only stores
// the resulting evidence; it is never consulted to decide an outcome.
// ----------------------------------------------------------------------------

// NOTE: value imports use explicit .ts extensions so this module also runs under
// Node's native ESM loader (the verification script imports it directly). Vite +
// tsc tolerate this via allowImportingTsExtensions. Type-only imports are erased,
// so they don't need extensions.
import { decide, toMockView, toModelView } from '../src/agent.ts'
import { computeLicense, computeLicenseFromVerdicts } from '../src/license.ts'
import { SCENARIO_VERSION, seedScenarios } from '../src/seedScenarios.ts'
import { verify } from '../src/verifier.ts'
import type {
  Action,
  AgentDecision,
  CompactRun,
  DigestStatus,
  EvidencePolicySource,
  EvidenceStatus,
  HistorySource,
  LicenseState,
  RecentRun,
  Trace,
} from '../src/types'
import { computeAuditDigest } from './evidence/digest.ts'
import {
  ENVIRONMENT_NAME,
  LICENSE_POLICY_VERSION,
  REWARD_MODEL_VERSION,
  ROW_SCHEMA_VERSION,
  SCENARIO_REGISTRY_VERSION,
  VERIFIER_VERSION,
  getEvalVersions,
} from './evalVersions.ts'
import { handleNebiusAction, type NebiusHandlerConfig } from './nebiusHandler.ts'
import {
  INSFORGE_TABLE,
  fetchRecentEvidence,
  insforgeConfigured,
  persistEpisode,
  type InsforgeConfig,
} from './insforgeStore.ts'

export interface RunEpisodeConfig {
  nebius: NebiusHandlerConfig
  insforge: InsforgeConfig
}

type PolicyMode = 'mock' | 'nebius'

interface RunRecord {
  trace: Trace
  persistedId: string | null
  createdAt: string
  runSequence: number
  /** Server-computed license level at this episode's time. */
  licenseLevel: string
}

/**
 * A normalized, version-tagged unit of authoritative evidence — built either from
 * an in-memory current-process trace or a row rehydrated from InsForge. This is
 * the shape the evidence status is computed over (deduped by traceId).
 */
export interface EvidenceItem {
  traceId: string
  episodeIndex: number
  runSequence: number
  scenarioId: string
  scenarioTitle: string
  requestedPolicyMode: EvidencePolicySource
  actualPolicySource: EvidencePolicySource
  fallback: boolean
  fallbackCode: string | null
  action: Action
  passed: boolean
  reward: number
  catastrophic: boolean
  licenseLevel: string
  createdAt: string
  persistedRecordId: string | null
  versionMismatch: boolean
  rowSchemaVersion: string | null
  digestPresent: boolean
  digestStatus: DigestStatus
  source: 'memory' | 'insforge'
}

export interface PersistenceOutcomeDTO {
  configured: boolean
  status: 'saved' | 'local_only' | 'unavailable'
  recordId?: string | null
  code?: string
  table: string
}

export type RunEpisodeResult =
  | {
      ok: true
      trace: Trace
      license: LicenseState
      persistence: PersistenceOutcomeDTO
      runId: string
      /** Full persisted audit row — for the server/verification only, NOT sent to the client. */
      auditRow: Record<string, unknown>
    }
  | { ok: false; code: 'bad_request' | 'unknown'; error: string }

// Server-owned, in-memory authoritative run history. Survives client reloads
// (the dev server keeps running); resets on server restart. InsForge is the
// durable store. NOTE: a single shared history is fine for the single-user demo.
const serverRecords: RunRecord[] = []

// One run id per server process — groups this session's episodes.
let runId: string | null = null
function getRunId(): string {
  if (!runId) runId = `run_${new Date().toISOString().replace(/[:.]/g, '-')}`
  return runId
}
/** Peek the run id WITHOUT generating one (for the status endpoint). */
function currentRunId(): string | null {
  return runId
}

// Monotonic per-process episode counter — never resets within a run.
let runSequence = 0

function licenseSignalFor(passed: boolean, catastrophic: boolean): string {
  return catastrophic ? 'caps license' : passed ? 'builds trust' : 'erodes trust'
}

/**
 * Run one server-owned episode: load canonical scenario, run policy (mock or
 * Nebius with mock fallback), score with the deterministic verifier, update the
 * server-owned license, persist the evidence to InsForge (best-effort).
 */
export async function handleRunEpisode(
  body: unknown,
  cfg: RunEpisodeConfig,
): Promise<RunEpisodeResult> {
  const b = (body ?? {}) as { scenarioId?: unknown; policyMode?: unknown }
  const scenarioId = typeof b.scenarioId === 'string' ? b.scenarioId : ''
  const policyMode: PolicyMode = b.policyMode === 'nebius' ? 'nebius' : 'mock'
  if (b.policyMode !== 'mock' && b.policyMode !== 'nebius') {
    return { ok: false, code: 'bad_request', error: 'policyMode must be "mock" or "nebius".' }
  }

  // Load the canonical scenario from the server-side registry.
  const scenario = seedScenarios.find((s) => s.id === scenarioId)
  if (!scenario) {
    return { ok: false, code: 'bad_request', error: 'Unknown scenarioId.' }
  }

  // Run the policy. Track requested vs actual provenance explicitly so a Nebius
  // fallback is never confused with a genuine mock run.
  // - attemptedModelInput: the ModelPolicyView intended for Nebius (null for mock).
  // - actualPolicyInput:   the view actually consumed by the policy that decided.
  let decision: AgentDecision
  let fallback = false
  let fallbackCode: string | null = null
  let attemptedModelInput: unknown = null
  let actualPolicyInput: unknown

  if (policyMode === 'nebius') {
    const modelView = toModelView(scenario)
    attemptedModelInput = modelView
    const r = await handleNebiusAction({ view: modelView }, cfg.nebius)
    if (r.ok) {
      actualPolicyInput = modelView
      decision = {
        action: r.decision.action,
        confidence: r.decision.confidence,
        rationale: r.decision.rationale,
        requestedInfo: r.decision.requestedInfo,
        source: 'nebius',
        model: r.model,
      }
    } else {
      // Nebius failed — fall back to the mock policy, but keep both inputs.
      fallback = true
      fallbackCode = r.code
      const mockView = toMockView(scenario)
      actualPolicyInput = mockView
      decision = decide(mockView)
    }
  } else {
    const mockView = toMockView(scenario)
    actualPolicyInput = mockView
    decision = decide(mockView)
  }

  // Deterministic verifier — the source of truth.
  const result = verify(scenario, decision)

  const episode = serverRecords.length + 1
  runSequence += 1
  const traceId = `srv-${getRunId()}-${episode}-${scenario.id}`
  const versions = getEvalVersions()
  const provenance = {
    requestedPolicyMode: policyMode,
    actualPolicySource: decision.source,
    fallback,
    fallbackCode,
  }
  const trace: Trace = {
    id: traceId,
    episode,
    scenario,
    decision,
    result,
    licenseSignal: licenseSignalFor(result.passed, result.catastrophic),
    authority: 'server_authoritative_episode',
    versions,
    provenance,
  }

  const createdAt = new Date().toISOString()
  const record: RunRecord = { trace, persistedId: null, createdAt, runSequence, licenseLevel: '' }
  serverRecords.push(record)

  const license = computeLicense(serverRecords.map((r) => r.trace))
  record.licenseLevel = license.level.id
  const licenseSummary = {
    level: license.level.id,
    name: license.level.name,
    passRate: license.passRate,
    avgReward: license.avgReward,
    catastrophicCount: license.catastrophicCount,
    episodes: license.episodes,
  }

  // Build the replayable audit row and persist (best-effort). Includes identity,
  // attribution versions, explicit fallback attribution, and the canonical
  // scenario snapshot (server-owned ground truth).
  const auditRow: Record<string, unknown> = {
    // identity
    trace_id: traceId,
    run_id: getRunId(),
    episode_index: episode,
    run_sequence: runSequence,
    trace_authority: 'server_authoritative_episode',
    // attribution versions
    environment_name: ENVIRONMENT_NAME,
    scenario_registry_version: SCENARIO_REGISTRY_VERSION,
    verifier_version: VERIFIER_VERSION,
    reward_model_version: REWARD_MODEL_VERSION,
    license_policy_version: LICENSE_POLICY_VERSION,
    app_commit: versions.appCommit,
    // scenario
    scenario_id: scenario.id,
    scenario_version: SCENARIO_VERSION,
    scenario_title: scenario.title,
    domain: scenario.domain,
    scenario_snapshot: scenario,
    // policy provenance (requested vs actual)
    requested_policy_mode: policyMode,
    actual_policy_source: decision.source,
    fallback,
    fallback_code: fallbackCode,
    attempted_model_input: attemptedModelInput,
    actual_policy_input: actualPolicyInput,
    // decision
    model_name: decision.model ?? null,
    action: decision.action,
    rationale: decision.rationale,
    requested_info: decision.requestedInfo ?? '',
    confidence: decision.confidence,
    // deterministic verifier result
    passed: result.passed,
    reward: result.reward,
    category: result.category,
    catastrophic: result.catastrophic,
    expected_action: result.expectedAction,
    actual_action: result.chosenAction,
    verifier_reason: result.failureReason,
    verifier_checks: result.checks,
    // license + time
    license_level: license.level.id,
    license_summary: licenseSummary,
    created_at: createdAt,
  }

  // Integrity metadata: schema version + deterministic digest over the stable
  // replay fields OF THIS ROW (same fn used on read-back, so it's tamper-evident).
  auditRow.row_schema_version = ROW_SCHEMA_VERSION
  auditRow.audit_row_digest = computeAuditDigest(auditRow)

  const persist = await persistEpisode(auditRow, cfg.insforge)

  // Fail closed when InsForge is CONFIGURED but the durable write was unavailable.
  // The trust boundary requires that a configured episode cannot return a trace,
  // reward-bearing verifier result, license, run id, persistence DTO, or audit row
  // without persisted evidence behind it. Roll the in-memory record back so the
  // failed episode can never influence later legacy license computation; keep
  // runSequence monotonic (do not decrement). Unconfigured (local_only) demo runs
  // are unaffected — they intentionally return the in-memory response.
  if (insforgeConfigured(cfg.insforge) && persist.status === 'unavailable') {
    const idx = serverRecords.indexOf(record)
    if (idx !== -1) serverRecords.splice(idx, 1)
    return {
      ok: false,
      code: 'unknown',
      error: 'Persistence unavailable; episode not recorded.',
    }
  }

  if (persist.status === 'saved') record.persistedId = persist.recordId

  return {
    ok: true,
    trace,
    license,
    persistence: {
      configured: insforgeConfigured(cfg.insforge),
      status: persist.status,
      recordId: persist.status === 'saved' ? persist.recordId : undefined,
      code: persist.status === 'unavailable' ? persist.code : undefined,
      table: INSFORGE_TABLE,
    },
    runId: getRunId(),
    auditRow,
  }
}

// --- Evidence read-back / rehydration -------------------------------------

// Current-process records and InsForge-rehydrated rows are kept separate, then
// merged + deduped by trace_id when computing status. Read-back is bounded: it
// runs on first request, on explicit ?refresh=1, when query params change, or as
// a TTL-gated retry after a prior unavailable/error.
let rehydratedItems: EvidenceItem[] = []
let readBackErrorCode: string | null = null // 'unavailable' | 'error' | null
let everReadBack = false
let lastRehydratedAtMs: number | null = null
let lastRefreshAttemptMs: number | null = null
let rejectedMalformedCount = 0
let lastQueryKey = ''
const READBACK_TTL_MS = 15_000

/** Decide whether to (re)attempt an InsForge read-back. Pure, for testability. */
export function shouldAttemptReadBack(
  state: {
    everRead: boolean
    lastErrorCode: string | null
    lastAttemptMs: number | null
    refresh: boolean
    paramsChanged: boolean
  },
  nowMs: number,
  ttlMs: number = READBACK_TTL_MS,
): boolean {
  if (state.refresh) return true
  if (!state.everRead) return true
  if (state.paramsChanged) return true
  if (state.lastErrorCode && (state.lastAttemptMs === null || nowMs - state.lastAttemptMs >= ttlMs)) {
    return true
  }
  return false
}

const toStr = (v: unknown): string => (typeof v === 'string' ? v : '')
const ACTIONS: Action[] = ['act', 'ask', 'escalate', 'stop']
// Evidence-only provenance allow-list. Wider than the /api/run-episode request
// modes (mock | nebius): persisted gym /v1 rows record `external`. Request
// coercion in handleRunEpisode still accepts only mock | nebius.
const EVIDENCE_POLICY_SOURCES: EvidencePolicySource[] = ['mock', 'nebius', 'external']

// The deterministic verifier clamps reward to [-1, 1]; reject anything outside.
const REWARD_MIN = -1
const REWARD_MAX = 1

// Digest logic now lives in ./evidence/digest.ts (imported above, shared with the
// gym server). Re-exported so existing importers (verify:evidence) are unaffected.
export { computeAuditDigest }

/** True when a row was produced by the current verifier/reward/license versions. */
export function isVersionCompatible(row: {
  verifierVersion?: string
  rewardModelVersion?: string
  licensePolicyVersion?: string
}): boolean {
  return (
    row.verifierVersion === VERIFIER_VERSION &&
    row.rewardModelVersion === REWARD_MODEL_VERSION &&
    row.licensePolicyVersion === LICENSE_POLICY_VERSION
  )
}

/** True iff a row claims to be a server-authoritative episode (pre-validation). */
export function isAuthoritativeRow(raw: unknown): boolean {
  return (
    !!raw &&
    typeof raw === 'object' &&
    (raw as Record<string, unknown>).trace_authority === 'server_authoritative_episode'
  )
}

function nonEmptyStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null
}

/**
 * STRICT parse of a persisted InsForge row into an EvidenceItem. Returns null for
 * any row that is not a valid, current-schema-shaped, server-authoritative
 * episode — malformed rows are DROPPED, never defaulted/interpreted. (Version
 * mismatch is NOT a parse failure: it parses and is flagged `versionMismatch`.)
 */
export function parseEvidenceRow(raw: unknown): EvidenceItem | null {
  if (!isAuthoritativeRow(raw)) return null
  const r = raw as Record<string, unknown>

  // Required identity + scenario strings.
  const traceId = nonEmptyStr(r.trace_id)
  const scenarioId = nonEmptyStr(r.scenario_id)
  const scenarioTitle = nonEmptyStr(r.scenario_title)
  if (!traceId || !scenarioId || !scenarioTitle) return null
  // run_id is optional (legacy rows) but, if present, must be a non-empty string.
  if ('run_id' in r && nonEmptyStr(r.run_id) === null) return null

  // Required finite indices.
  if (!Number.isFinite(r.episode_index) || !Number.isFinite(r.run_sequence)) return null

  // Policy mode / source / action must be exact enum members — no defaulting.
  // Evidence provenance allows `external` (gym /v1 rows); unknown values rejected.
  if (!EVIDENCE_POLICY_SOURCES.includes(r.requested_policy_mode as EvidencePolicySource)) return null
  if (!EVIDENCE_POLICY_SOURCES.includes(r.actual_policy_source as EvidencePolicySource)) return null
  if (!ACTIONS.includes(r.action as Action)) return null

  // Verdict fields must be the right types and in-bounds.
  if (typeof r.passed !== 'boolean' || typeof r.catastrophic !== 'boolean') return null
  if (typeof r.reward !== 'number' || !Number.isFinite(r.reward)) return null
  if (r.reward < REWARD_MIN || r.reward > REWARD_MAX) return null

  // created_at must parse as a real date.
  const createdAt = nonEmptyStr(r.created_at)
  if (!createdAt || Number.isNaN(Date.parse(createdAt))) return null

  // Version fields must be non-empty strings.
  const verifierVersion = nonEmptyStr(r.verifier_version)
  const rewardModelVersion = nonEmptyStr(r.reward_model_version)
  const licensePolicyVersion = nonEmptyStr(r.license_policy_version)
  if (!verifierVersion || !rewardModelVersion || !licensePolicyVersion) return null

  const versionMismatch = !isVersionCompatible({
    verifierVersion,
    rewardModelVersion,
    licensePolicyVersion,
  })

  // Tamper-evidence: recompute the digest over the SAME stable fields used on
  // write. Missing digest = legacy/unknown; present-but-different = mismatched.
  const storedDigest = nonEmptyStr(r.audit_row_digest)
  const digestStatus: DigestStatus =
    storedDigest === null ? 'missing' : computeAuditDigest(r) === storedDigest ? 'valid' : 'mismatched'

  return {
    traceId,
    episodeIndex: r.episode_index as number,
    runSequence: r.run_sequence as number,
    scenarioId,
    scenarioTitle,
    requestedPolicyMode: r.requested_policy_mode as EvidencePolicySource,
    actualPolicySource: r.actual_policy_source as EvidencePolicySource,
    fallback: r.fallback === true,
    fallbackCode: typeof r.fallback_code === 'string' ? r.fallback_code : null,
    action: r.action as Action,
    passed: r.passed,
    reward: r.reward,
    catastrophic: r.catastrophic,
    licenseLevel: toStr(r.license_level),
    createdAt,
    persistedRecordId: toStr(r.id) || null,
    versionMismatch,
    rowSchemaVersion: nonEmptyStr(r.row_schema_version),
    digestPresent: storedDigest !== null,
    digestStatus,
    source: 'insforge',
  }
}

/** In-memory record -> EvidenceItem (always current versions, so compatible). */
function memToItem(record: RunRecord): EvidenceItem {
  const t = record.trace
  return {
    traceId: t.id,
    episodeIndex: t.episode,
    runSequence: record.runSequence,
    scenarioId: t.scenario.id,
    scenarioTitle: t.scenario.title,
    requestedPolicyMode: t.provenance?.requestedPolicyMode ?? t.decision.source,
    actualPolicySource: t.decision.source,
    fallback: t.provenance?.fallback ?? false,
    fallbackCode: t.provenance?.fallbackCode ?? null,
    action: t.decision.action,
    passed: t.result.passed,
    reward: t.result.reward,
    catastrophic: t.result.catastrophic,
    licenseLevel: record.licenseLevel,
    createdAt: record.createdAt,
    persistedRecordId: record.persistedId,
    versionMismatch: false,
    rowSchemaVersion: ROW_SCHEMA_VERSION,
    digestPresent: true, // current-process rows always carry a digest
    digestStatus: 'valid', // freshly produced this process — trivially valid
    source: 'memory',
  }
}

/** Merge in-memory + rehydrated items, deduped by traceId (memory wins). */
export function mergeDedupe(mem: EvidenceItem[], rehydrated: EvidenceItem[]): EvidenceItem[] {
  const byId = new Map<string, EvidenceItem>()
  for (const it of mem) byId.set(it.traceId, it)
  for (const it of rehydrated) if (!byId.has(it.traceId)) byId.set(it.traceId, it)
  return [...byId.values()].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
    return b.runSequence - a.runSequence
  })
}

/** EvidenceItem -> browser-safe compact row (no snapshots / inputs). */
export function compactFromItem(it: EvidenceItem): CompactRun {
  return {
    traceId: it.traceId,
    episodeIndex: it.episodeIndex,
    runSequence: it.runSequence,
    scenarioId: it.scenarioId,
    scenarioTitle: it.scenarioTitle,
    requestedPolicyMode: it.requestedPolicyMode,
    actualPolicySource: it.actualPolicySource,
    fallback: it.fallback,
    fallbackCode: it.fallbackCode,
    action: it.action,
    passed: it.passed,
    reward: it.reward,
    catastrophic: it.catastrophic,
    licenseLevel: it.licenseLevel,
    createdAt: it.createdAt,
    versionMismatch: it.versionMismatch,
    rowSchemaVersion: it.rowSchemaVersion,
    digestPresent: it.digestPresent,
    digestStatus: it.digestStatus,
  }
}

/**
 * Compact server evidence status — backend proof that survives a client reload.
 * Rehydrates from InsForge at most once, dedupes by traceId, and recomputes the
 * current license ONLY from version-compatible authoritative verdicts.
 */
export interface EvidenceStatusOpts {
  refresh?: boolean
  limit?: number
  runId?: string
}

export async function getEvidenceStatus(
  cfg: RunEpisodeConfig,
  opts: EvidenceStatusOpts = {},
): Promise<EvidenceStatus> {
  const configured = insforgeConfigured(cfg.insforge)
  const limit = Math.max(1, Math.min(100, Math.trunc(opts.limit ?? 50) || 50))
  const runIdFilter = opts.runId && opts.runId.trim() ? opts.runId.trim() : undefined
  const historyScope: 'global_recent' | 'run' = runIdFilter ? 'run' : 'global_recent'
  const queryKey = `${limit}|${runIdFilter ?? ''}`

  if (configured) {
    const nowMs = Date.now()
    const paramsChanged = everReadBack && queryKey !== lastQueryKey
    const attempt = shouldAttemptReadBack(
      {
        everRead: everReadBack,
        lastErrorCode: readBackErrorCode,
        lastAttemptMs: lastRefreshAttemptMs,
        refresh: !!opts.refresh,
        paramsChanged,
      },
      nowMs,
    )
    if (attempt) {
      everReadBack = true
      lastRefreshAttemptMs = nowMs
      lastQueryKey = queryKey
      const read = await fetchRecentEvidence(cfg.insforge, limit, runIdFilter)
      if (read.status === 'ok') {
        readBackErrorCode = null
        lastRehydratedAtMs = nowMs
        const memIds = new Set(serverRecords.map((r) => r.trace.id))
        const seen = new Set<string>()
        const items: EvidenceItem[] = []
        let rejected = 0
        for (const row of read.rows.filter(isAuthoritativeRow)) {
          const it = parseEvidenceRow(row)
          if (!it) {
            rejected++ // authoritative-but-malformed -> dropped, counted
            continue
          }
          if (memIds.has(it.traceId) || seen.has(it.traceId)) continue
          seen.add(it.traceId)
          items.push(it)
        }
        rehydratedItems = items
        rejectedMalformedCount = rejected
      } else if (read.status === 'unavailable') {
        readBackErrorCode = 'unavailable'
      } else if (read.status === 'error') {
        readBackErrorCode = 'error'
      }
    }
  }

  const memItems = serverRecords.map(memToItem)
  const combined = mergeDedupe(memItems, rehydratedItems)

  // Digest classification over the deduped set.
  const versionMismatchCount = combined.filter((it) => it.versionMismatch).length
  const digestValidCount = combined.filter((it) => it.digestStatus === 'valid').length
  const digestMissingCount = combined.filter((it) => it.digestStatus === 'missing').length
  const digestMismatchedCount = combined.filter((it) => it.digestStatus === 'mismatched').length
  const digestPresentCount = combined.filter((it) => it.digestPresent).length

  // COMPATIBLE = versions compatible with current eval code (independent of digest).
  const versionCompatible = combined.filter((it) => !it.versionMismatch)
  // LICENSE SET = compatible AND NOT digest-mismatched (tampered rows are never
  // blended; legacy "missing"-digest rows are allowed if version-compatible).
  const licenseSet = versionCompatible.filter((it) => it.digestStatus !== 'mismatched')
  // TRUSTED = compatible AND digest-valid (digest-verified). Strictly a subset of
  // compatible — differs whenever missing/mismatched-digest rows are present.
  const trustedEvidenceCount = versionCompatible.filter(
    (it) => it.digestStatus === 'valid',
  ).length

  // Current license: recompute from the license set only — never trust a stored
  // summary, never blend version-incompatible or tampered evidence.
  const license =
    licenseSet.length > 0
      ? computeLicenseFromVerdicts(
          licenseSet.map((it) => ({
            passed: it.passed,
            reward: it.reward,
            catastrophic: it.catastrophic,
          })),
        )
      : null

  // historySource reflects where the picture came from.
  let historySource: HistorySource
  if (!configured) {
    historySource = combined.length > 0 ? 'memory' : 'local_only'
  } else if (readBackErrorCode === 'unavailable') {
    historySource = 'unavailable'
  } else if (readBackErrorCode === 'error') {
    historySource = 'error'
  } else if (rehydratedItems.length > 0) {
    historySource = 'insforge'
  } else {
    historySource = 'memory'
  }

  const latest = combined[0]
  const latestPersisted = combined.find((it) => it.persistedRecordId)?.persistedRecordId ?? null

  return {
    runId: currentRunId(),
    serverEpisodeCount: combined.length,
    currentLicenseSummary: license
      ? {
          level: license.level.id,
          name: license.level.name,
          passRate: license.passRate,
          avgReward: license.avgReward,
          catastrophicCount: license.catastrophicCount,
          episodes: license.episodes,
        }
      : null,
    latestServerTraceId: latest?.traceId ?? null,
    latestPersistedRecordId: latestPersisted,
    historySource,
    historyScope,
    limit,
    rehydratedFromInsForge: rehydratedItems.length > 0,
    rehydratedCount: rehydratedItems.length,
    rejectedMalformedCount,
    versionMismatchCount,
    compatibleEvidenceCount: versionCompatible.length,
    digestPresentCount,
    digestValidCount,
    digestMissingCount,
    digestMismatchedCount,
    trustedEvidenceCount,
    lastRehydratedAt: lastRehydratedAtMs === null ? null : new Date(lastRehydratedAtMs).toISOString(),
    lastRefreshAttemptAt:
      lastRefreshAttemptMs === null ? null : new Date(lastRefreshAttemptMs).toISOString(),
    readBackErrorCode,
    persistence: {
      configured,
      status: configured ? 'configured' : 'local_only',
      table: INSFORGE_TABLE,
    },
    // Recent TRUSTED evidence: exclude digest-mismatched rows (still counted in
    // digestMismatchedCount). Each row carries its digestStatus (valid | missing).
    recentCompactRuns: combined
      .filter((it) => it.digestStatus !== 'mismatched')
      .slice(0, 5)
      .map(compactFromItem),
  }
}

/** Recent server-owned episodes from in-memory history (newest first). */
export function getRecentRuns(limit = 10): RecentRun[] {
  return serverRecords
    .slice(-limit)
    .reverse()
    .map((r) => ({
      id: r.trace.id,
      episode: r.trace.episode,
      scenarioTitle: r.trace.scenario.title,
      source: r.trace.decision.source,
      action: r.trace.decision.action,
      passed: r.trace.result.passed,
      reward: r.trace.result.reward,
      category: r.trace.result.category,
      catastrophic: r.trace.result.catastrophic,
      authority: 'server_authoritative_episode',
      persistedId: r.persistedId,
      createdAt: r.createdAt,
    }))
}
