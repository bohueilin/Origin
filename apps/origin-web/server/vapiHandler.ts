// ----------------------------------------------------------------------------
// PROTOTYPE Vapi operator adapter — a THIN voice layer over existing server-owned
// endpoints. It ONLY routes to handleRunEpisode (POST /api/run-episode) and
// getEvidenceStatus (GET /api/evidence/status) and formats a spoken summary.
//
// It does NOT: compute verifier results, license, or digest status; call Nebius
// or InsForge directly; or hold any sponsor secret (those live in the handlers it
// calls). Everything authoritative comes from the server-owned functions.
// ----------------------------------------------------------------------------

import { getEvidenceStatus, handleRunEpisode, type RunEpisodeConfig } from './runEpisodeHandler.ts'

interface VapiToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

/** Parse Vapi's tool-call payload (handles both toolCallList and toolCalls shapes). */
function parseToolCalls(body: unknown): VapiToolCall[] {
  const msg = (body as { message?: Record<string, unknown> })?.message ?? {}
  const list =
    (msg.toolCallList as unknown[]) ??
    (msg.toolCalls as unknown[]) ??
    (msg.tool_calls as unknown[]) ??
    []
  const out: VapiToolCall[] = []
  for (const raw of Array.isArray(list) ? list : []) {
    const r = raw as Record<string, unknown>
    const fn = (r.function as Record<string, unknown>) ?? r
    const name = String(fn.name ?? r.name ?? '')
    let args: Record<string, unknown> = {}
    const rawArgs = (fn.arguments ?? r.arguments ?? r.parameters) as unknown
    if (rawArgs && typeof rawArgs === 'object') args = rawArgs as Record<string, unknown>
    else if (typeof rawArgs === 'string') {
      try {
        args = JSON.parse(rawArgs) as Record<string, unknown>
      } catch {
        args = {}
      }
    }
    out.push({ id: String(r.id ?? r.toolCallId ?? ''), name, args })
  }
  return out
}

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`
}

async function runEpisodeTool(
  args: Record<string, unknown>,
  cfg: RunEpisodeConfig,
): Promise<string> {
  const scenarioId = typeof args.scenarioId === 'string' ? args.scenarioId : ''
  const policyMode = args.policyMode === 'nebius' ? 'nebius' : 'mock'
  const res = await handleRunEpisode({ scenarioId, policyMode }, cfg)
  if (!res.ok) {
    return `Could not run that episode (${res.code}). Please try a known scenario id like com-1.`
  }
  const { trace } = res
  const ev = await getEvidenceStatus(cfg)
  const d = trace.decision
  const r = trace.result
  const sourceNote =
    d.source === 'nebius'
      ? `the Nebius model ${d.model ?? ''}`
      : trace.provenance?.requestedPolicyMode === 'nebius'
        ? `the local mock policy (Nebius was requested but fell back: ${trace.provenance.fallbackCode})`
        : 'the local mock policy'
  const verdict = r.passed ? 'PASSED' : `FAILED${r.catastrophic ? ' (catastrophic)' : ''}`
  return [
    `Ran scenario ${trace.scenario.id} — "${trace.scenario.title}" with ${policyMode} policy.`,
    `The decision came from ${sourceNote}. Action chosen: ${d.action.toUpperCase()}.`,
    `The deterministic verifier ${verdict} it with reward ${r.reward.toFixed(2)}.`,
    `Current server license: ${ev.currentLicenseSummary ? `${ev.currentLicenseSummary.level} ${ev.currentLicenseSummary.name}` : 'none yet'}.`,
    `Evidence source: ${ev.historySource}. Trusted evidence ${ev.trustedEvidenceCount} of ${ev.compatibleEvidenceCount} compatible; digest ${ev.digestValidCount} valid, ${ev.digestMismatchedCount} tampered.`,
    ev.currentLicenseSummary && ev.currentLicenseSummary.catastrophicCount > 0
      ? `Autonomy is NOT earned here — a catastrophic action capped the license.`
      : `This reflects the earned autonomy level so far.`,
  ].join(' ')
}

async function evidenceStatusTool(
  args: Record<string, unknown>,
  cfg: RunEpisodeConfig,
): Promise<string> {
  const ev = await getEvidenceStatus(cfg, { refresh: args.refresh === true })
  const lic = ev.currentLicenseSummary
  return [
    `Evidence source: ${ev.historySource}.`,
    `${ev.serverEpisodeCount} server episode(s).`,
    lic
      ? `Current license ${lic.level} ${lic.name} — pass rate ${fmtPct(lic.passRate)}, ${lic.catastrophicCount} catastrophic.`
      : `No license earned yet.`,
    `Trusted evidence ${ev.trustedEvidenceCount} of ${ev.compatibleEvidenceCount} compatible.`,
    `Digest: ${ev.digestValidCount} valid, ${ev.digestMissingCount} legacy, ${ev.digestMismatchedCount} tampered.`,
    ev.latestPersistedRecordId ? `Latest persisted record ${ev.latestPersistedRecordId}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** Handle a Vapi tools webhook. Returns the Vapi tool-result envelope. */
export async function handleVapiTools(
  body: unknown,
  cfg: RunEpisodeConfig,
): Promise<{ results: { toolCallId: string; result: string }[] }> {
  const calls = parseToolCalls(body)
  const results: { toolCallId: string; result: string }[] = []
  for (const call of calls) {
    let result: string
    try {
      if (call.name === 'run_autonomy_episode') {
        result = await runEpisodeTool(call.args, cfg)
      } else if (call.name === 'get_evidence_status') {
        result = await evidenceStatusTool(call.args, cfg)
      } else {
        result = `Unknown tool "${call.name}". Available: run_autonomy_episode, get_evidence_status.`
      }
    } catch {
      result = 'The operator backend hit an error. The environment was left unchanged.'
    }
    results.push({ toolCallId: call.id, result })
  }
  return { results }
}
