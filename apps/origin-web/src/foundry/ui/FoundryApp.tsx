// Origin Foundry — a trust-layer demo. The public build offers a deterministic,
// browser-local sample and simulated evaluation. Separately enabled local/backend
// development can exercise provider-backed proposals after informed consent.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './foundry.css'
import { FloorGrid } from './FloorGrid'
import { parseFloor, quorumRun, speedRace, fileToDataUri, foundryCapabilities } from '../foundryClient'
import type { ParseFloorResponse, QuorumRunResponse, SpeedRaceResponse, FoundrySource, QuorumMode } from '../types'
import { gateParsedFloor, type ParseGateResult } from '../parseGate'
import { analyzeFloorMargin } from '../../floorMargin'
import type { GridPos } from '../../warehouse'
import { evaluateDrawnSite, type DrawnSiteEval } from '../../siteEval'
import type { ZoneScope } from '../../credentials/types'
import type { DescriptiveSiteMap } from '../../workflowDraft'

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function SourceBadge({ source, model }: { source: FoundrySource; model?: string }) {
  const label = source === 'cerebras' ? 'gemma-4-31b · Cerebras' : source === 'gemini' ? model || 'GPU baseline' : 'deterministic mock'
  return <span className={`fdy-badge fdy-badge--${source}`}>{label}</span>
}

/**
 * The parse gate's verdict card. VOID lists the failing checks by name — nothing
 * was repaired into existence. ESCALATE/VALID show the verdict + the receipt,
 * and the receipt digest is RECOMPUTED IN THIS BROWSER before it is displayed:
 * the server's capability to emit a verdict is not this page's permission to
 * trust it.
 */
function GateCard({ gate, evidence }: { gate: ParseGateResult; evidence?: ParseFloorResponse }) {
  const reverified = useMemo(() => {
    const { receipt_digest, ...body } = gate.receipt
    return gateParsedFloor.recomputeReceiptDigest(body) === receipt_digest
  }, [gate])
  const failing = gate.checks.filter((c) => !c.pass)
  const cls = gate.verdict === 'VOID' ? 'refuse' : gate.verdict === 'ESCALATE' ? 'escalate' : 'finish'
  const download = useCallback(() => {
    if (!evidence) return
    // The reviewer artifact: receipt + the raw proposal it binds + everything
    // needed to re-check it offline with tools/floor-verify (zero install).
    const file = {
      kind: 'floor-parse-evidence',
      verify_with: 'tools/floor-verify/floor-verify.mjs in the Origin repo — node floor-verify.mjs <this file>',
      verdict: gate.verdict,
      code: gate.code,
      receipt: gate.receipt,
      checks: gate.checks,
      repairs: gate.repairs,
      raw_proposal: evidence.rawProposal,
      site_map: evidence.siteMap,
      oracle: evidence.oracle ?? null,
      source: evidence.source,
      model: evidence.model,
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `floor-parse-evidence-${gate.receipt.receipt_digest.slice(0, 12)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [gate, evidence])
  return (
    <div className={`fdy-verdictbox fdy-verdictbox--${cls}`}>
      <strong>
        {gate.verdict === 'VOID'
          ? 'Parse VOIDED — the model\'s proposal could not be supported'
          : gate.verdict === 'ESCALATE'
            ? 'Parse ESCALATED — usable after cleanup, but a human should review it'
            : `Parse gate: VALID · ${gate.checks.length}/${gate.checks.length} checks`}
      </strong>
      {gate.verdict === 'VOID' && (
        <span>No floor is shown because none was supported — a voided parse is refused, not repaired into something plausible.</span>
      )}
      {failing.map((c) => (
        <span key={c.name}>
          <code>{c.name}</code> — {c.detail}
        </span>
      ))}
      <span className="fdy-gate-receipt">
        receipt {gate.receipt.receipt_digest.slice(0, 16)}…{' '}
        {reverified ? '· recomputed and matched in this browser' : '· DIGEST MISMATCH — do not trust this verdict'}
      </span>
      {evidence?.rawProposal !== undefined && (
        <button className="fdy-btn fdy-btn--ghost" onClick={download}>
          Download parse evidence (re-verify offline)
        </button>
      )}
    </div>
  )
}

/** The measured Perceiver result — the CORRECTED attribution (arm A1: grid
 *  references alone), never the conflated 94.4% headline the provenance
 *  companion retracts. Numbers are read from the published artifact at render
 *  time, not hardcoded, so this strip cannot drift from what /trust serves. */
function PerceiverResultStrip() {
  const [ab, setAb] = useState<{
    arms: Record<string, { grouped: { overall: { anchorAccuracy: number; scored: number; n: number } } }>
  } | null>(null)
  useEffect(() => {
    let alive = true
    void fetch('/trust/perceiver-gridrefs-ab-2026-08-01.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j?.arms?.A0 && j?.arms?.A1) setAb(j as never)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  if (!ab) return null
  const a0 = ab.arms.A0.grouped.overall
  const a1 = ab.arms.A1.grouped.overall
  return (
    <div className="fdy-benchstrip">
      <span>
        Perceiver, measured: printing grid-reference numbers on the plan took exact anchor placement from{' '}
        {Math.round(a0.anchorAccuracy * 1000) / 10}% to {Math.round(a1.anchorAccuracy * 1000) / 10}% ({a1.scored} of {a1.n}{' '}
        parses scored; one was voided by the gate). Pre-registered paired A/B on synthetic rendered plans — numbers hold
        under our deterministic scorer on that dataset only.
      </span>
      <a href="/trust/perceiver-gridrefs-ab-2026-08-01.json" target="_blank" rel="noreferrer">
        full A/B report
      </a>
      <a href="/trust/perceiver-gridrefs-ab-2026-08-01-provenance.json" target="_blank" rel="noreferrer">
        provenance + corrections
      </a>
      <a href="/trust/perceiver-baseline-2026-08-01.json" target="_blank" rel="noreferrer">
        baseline
      </a>
    </div>
  )
}

/** The published gate-bench numbers (public/trust/floor-gate-bench.json) —
 *  fetched from the same origin, scoped copy, link to the raw artifact. */
interface BenchJson {
  trialsPerClass: number
  classes: Record<string, { expected: string; catchRate: number }>
  falseVoidRate: number
  digest: string
}

function GateBenchStrip() {
  const [bench, setBench] = useState<BenchJson | null>(null)
  const [fleet, setFleet] = useState<BenchJson | null>(null)
  useEffect(() => {
    let alive = true
    const load = (url: string, set: (v: BenchJson) => void): void => {
      void fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: BenchJson | null) => {
          if (alive && j?.classes) set(j)
        })
        .catch(() => undefined)
    }
    load('/trust/floor-gate-bench.json', setBench)
    load('/trust/fleet-verify-bench.json', setFleet)
    return () => {
      alive = false
    }
  }, [])
  if (!bench) return null
  // floor, not round: 99.6% must never display as 100%
  const pct = (b: BenchJson): number => {
    const voidClasses = Object.values(b.classes).filter((c) => c.expected === 'VOID')
    const rate = voidClasses.length ? voidClasses.reduce((s, c) => s + c.catchRate, 0) / voidClasses.length : 0
    return Math.floor(rate * 1000) / 10
  }
  return (
    <div className="fdy-benchstrip">
      <span>
        Gate discrimination, measured: {Object.keys(bench.classes).length} corruption classes × {bench.trialsPerClass} trials —{' '}
        VOID-class catch {pct(bench)}%, false-VOID rate {bench.falseVoidRate}. Synthetic floors, deterministic, reproducible from seed.
      </span>
      <a href="/trust/floor-gate-bench.json" target="_blank" rel="noreferrer">
        raw report · {bench.digest.slice(0, 12)}…
      </a>
      {fleet && (
        <>
          <span>
            Fleet-schedule verifier, measured: {Object.keys(fleet.classes).length} violation classes × {fleet.trialsPerClass} trials on the
            planner's schedules over synthetic floors (simulated, deterministic, reproducible from seed) — catch {pct(fleet)}%, false-VOID
            rate {fleet.falseVoidRate}.
          </span>
          <a href="/trust/fleet-verify-bench.json" target="_blank" rel="noreferrer">
            raw report · {fleet.digest.slice(0, 12)}…
          </a>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, unit, tone }: { label: string; value: string | number; unit?: string; tone?: 'pos' | 'neg' | 'warn' }) {
  return (
    <div className={`fdy-stat${tone ? ` fdy-stat--${tone}` : ''}`}>
      <div className="fdy-stat__val">
        {value}
        {unit && <span className="fdy-stat__unit">{unit}</span>}
      </div>
      <div className="fdy-stat__label">{label}</div>
    </div>
  )
}

// ---- Passport-gated spatial authority --------------------------------------

const PASSPORT_ZONE_SCOPE: ZoneScope = { kind: 'enter_zone', zoneId: 'ward-3-isolation' }

const PASSPORT_GYM_MAP: DescriptiveSiteMap = {
  width: 5,
  height: 1,
  start: { x: 0, y: 0 },
  item: { x: 4, y: 0 },
  drop: { x: 4, y: 0 },
  obstacles: [],
  hazards: [],
  humanOnly: [{ x: 2, y: 0 }],
  restrictedZoneId: PASSPORT_ZONE_SCOPE.zoneId,
  robots: [{ x: 0, y: 0 }],
}

function PassportGymCard() {
  const noGrant = evaluateDrawnSite(PASSPORT_GYM_MAP, 'humanoid')
  const matchingGrant = evaluateDrawnSite(PASSPORT_GYM_MAP, 'humanoid', new Set([PASSPORT_ZONE_SCOPE.zoneId]))
  const unrelatedGrant = evaluateDrawnSite(PASSPORT_GYM_MAP, 'humanoid', new Set(['pharmacy-vault']))
  const hazardWithGrant = evaluateDrawnSite(
    { ...PASSPORT_GYM_MAP, hazards: [{ x: 2, y: 0 }] },
    'humanoid',
    new Set([PASSPORT_ZONE_SCOPE.zoneId]),
  )
  const rows: Array<{ label: string; eval: DrawnSiteEval; note: string }> = [
    { label: 'No Passport grant', eval: noGrant, note: 'restricted zone is an absolute policy wall' },
    { label: `Simulated ${PASSPORT_ZONE_SCOPE.kind}:${PASSPORT_ZONE_SCOPE.zoneId}`, eval: matchingGrant, note: 'only this modeled zone becomes passable' },
    { label: 'Unrelated grant', eval: unrelatedGrant, note: 'wrong zoneId is not authority' },
    { label: 'Hazard with grant', eval: hazardWithGrant, note: 'authorization never overrides physics' },
  ]

  return (
    <section className="fdy-card fdy-passport-gym">
      <div className="fdy-card__head">
        <h2>Simulated scoped-authority task</h2>
        <p>
          Identity → authority → evaluated action. A restricted human-only zone refuses in this deterministic model until the
          simulated agent receives a scoped <code>enter_zone</code> grant for that exact zoneId.
        </p>
      </div>
      <div className="fdy-passport-gym__grid">
        <div>
          <FloorGrid map={PASSPORT_GYM_MAP} trail={matchingGrant.pathCells} cursor={PASSPORT_GYM_MAP.start} />
          <p className="fdy-passport-gym__caption">
            Zone <code>{PASSPORT_ZONE_SCOPE.zoneId}</code> is the purple gate. Passport can unlock policy access; the oracle still scores the path.
          </p>
        </div>
        <div className="fdy-passport-gym__rail" aria-label="Passport authority outcomes">
          {rows.map((row) => (
            <div key={row.label} className={`fdy-passport-gym__row is-${row.eval.verdict}`}>
              <span className="fdy-passport-gym__state">{row.label}</span>
              <strong>{row.eval.verdict.toUpperCase()}</strong>
              <em>{row.note}</em>
            </div>
          ))}
        </div>
      </div>
      <p className="fdy-passport-gym__proof">
        Capability is not permission: the modeled grant is a deterministic input, not a physics override. Matching authority flips REFUSE → FINISH;
        an unrelated grant still refuses, and a modeled hazard still refuses even with the grant. This is simulation evidence, not a production-autonomy result.
      </p>
    </section>
  )
}

function RsiVerifierCard() {
  // No run numbers here on purpose: an earlier version of this card quoted a
  // "recorded run" (40 scenarios / 120 samples / ~869 tok/s) that its own
  // linked dashboard — badged source:mock — did not contain. A number this
  // page cannot back with a linked artifact does not get printed on it.
  return (
    <section className="fdy-card fdy-rsi-card">
      <div className="fdy-card__head">
        <h2>Gemma proposes. Origin verifies.</h2>
        <p>
          The checked-in demo turns a building map into deterministic simulated scenario tests. A model may propose
          variants in a separately configured backend; the oracle — never an LLM judge — recomputes every verdict
          from the declared geometry.
        </p>
      </div>
      <p className="fdy-rsi-card__note">
        The dashboard labels each source. The public build does not trigger a provider run; checked-in or locally
        produced results must retain their source and simulation labels.
      </p>
      <a className="fdy-btn fdy-btn--primary fdy-rsi-card__link" href="/rsi/rsi_dashboard.html">
        Open the RSI verifier dashboard
      </a>
    </section>
  )
}

// ---- Speed race -------------------------------------------------------------

function SpeedRacePanel({ enabled }: { enabled: boolean }) {
  const [data, setData] = useState<SpeedRaceResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = useCallback(async () => {
    if (!enabled) return
    setBusy(true)
    setErr(null)
    try {
      setData(await speedRace())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Speed race failed.')
    } finally {
      setBusy(false)
    }
  }, [enabled])

  const cTok = data?.cerebras.tokS ?? 0
  const bTok = data?.baseline.tokS ?? 0
  const max = Math.max(cTok, bTok, 1)

  return (
    <section className="fdy-card fdy-race">
      <div className="fdy-card__head">
        <h2>Provider speed comparison</h2>
        <p>A separately configured local backend can compare provider timing. The public Pages build has no browser authority for this operation.</p>
      </div>
      <button className="fdy-btn fdy-btn--primary" onClick={enabled ? run : undefined} disabled={busy || !enabled}>
        {busy ? 'Racing…' : data ? 'Race again' : 'Run the speed race'}
      </button>
      {!enabled && <p className="fdy-lane__note">Speed comparison: local/backend demo only.</p>}
      {err && <p className="fdy-lane__note" style={{ marginTop: 10 }}>{err}</p>}
      {data && (
        <div className="fdy-race__lanes">
          {[data.cerebras, data.baseline].map((lane) => (
            <div key={lane.provider} className={`fdy-lane fdy-lane--${lane.provider}`}>
              <div className="fdy-lane__top">
                <SourceBadge source={lane.provider} model={lane.model} />
                <div className="fdy-lane__tok">
                  {lane.tokS ?? '—'} <span>tok/s</span>
                </div>
              </div>
              <div className="fdy-lane__bar">
                <div className="fdy-lane__fill" style={{ width: `${Math.round(((lane.tokS ?? 0) / max) * 100)}%` }} />
              </div>
              <div className="fdy-lane__meta">
                {lane.ttftMs != null && <span>TTFT {lane.ttftMs}ms</span>}
                {lane.totalMs != null && <span>{lane.totalMs}ms total</span>}
                {lane.note && <span className="fdy-lane__note">{lane.note}</span>}
              </div>
              <p className="fdy-lane__preview">{lane.preview}</p>
            </div>
          ))}
          {data.speedup && <div className="fdy-race__verdict">Observed local-demo result: Cerebras reported ~{data.speedup}× the baseline throughput for this request.</div>}
        </div>
      )}
    </section>
  )
}

// ---- Illustrative learning curve (pure local replay) -------------------------

const MOCK_CURVE = [
  { step: 0, reward: 0.18, far: 0.42 },
  { step: 1, reward: 0.31, far: 0.3 },
  { step: 2, reward: 0.49, far: 0.19 },
  { step: 3, reward: 0.63, far: 0.11 },
  { step: 4, reward: 0.74, far: 0.06 },
  { step: 5, reward: 0.82, far: 0.03 },
]

function TrainingPanel() {
  const [run, setRun] = useState(false)
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!run) return
    if (prefersReducedMotion()) {
      const t = setTimeout(() => setShown(MOCK_CURVE.length), 0)
      return () => clearTimeout(t)
    }
    const t = setInterval(() => setShown((s) => (s >= MOCK_CURVE.length ? s : s + 1)), 420)
    return () => clearInterval(t)
  }, [run])
  const start = () => {
    setShown(0)
    setRun(true)
  }

  const pts = MOCK_CURVE.slice(0, shown)
  const W = 320
  const H = 120
  const xOf = (i: number) => (i / (MOCK_CURVE.length - 1)) * W
  const line = (sel: (p: { reward: number; far: number }) => number) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${H - sel(p) * H}`).join(' ')

  return (
    <section className="fdy-card fdy-train">
      <div className="fdy-card__head">
        <h2>Inspect an illustrative learning curve</h2>
        <p>
          This checked-in series illustrates how deterministic verifier scores could be tracked during experimentation.
          The button replays fixed local points; it starts no training run and is not evidence of a trained or deployed robot policy.
        </p>
      </div>
      <button className="fdy-btn fdy-btn--primary" onClick={start}>
        {run ? 'Showing the trend…' : 'Show the training trend'}
      </button>
      <span className="fdy-flag">illustrative replay · no training job</span>
      <svg viewBox={`0 0 ${W} ${H}`} className="fdy-curve" role="img" aria-label="Reward and false-accept-rate over training steps">
        <line x1={0} y1={H} x2={W} y2={H} stroke="var(--fg-grid)" />
        <path d={line((p) => p.reward)} fill="none" stroke="var(--fg-pos)" strokeWidth={2.5} />
        <path d={line((p) => p.far)} fill="none" stroke="var(--fg-neg)" strokeWidth={2.5} strokeDasharray="4 3" />
      </svg>
      <div className="fdy-train__legend">
        <span><i style={{ background: 'var(--fg-pos)' }} /> reward ↑</span>
        <span><i style={{ background: 'var(--fg-neg)' }} /> false-accept rate ↓</span>
      </div>
      <p className="fdy-train__caption">Illustrative fixed data — not a live run, trained policy, or production validation.</p>
    </section>
  )
}

// ---- Quorum trace -----------------------------------------------------------

function QuorumTrace({ result, revealed }: { result: QuorumRunResponse; revealed: number }) {
  return (
    <ol className="fdy-trace" aria-live="polite">
      {result.steps.slice(0, revealed).map((s, i) => (
        <li key={i} className={`fdy-step fdy-step--${s.verdict}`}>
          <div className="fdy-step__loop">#{s.loop}</div>
          <div className="fdy-step__body">
            <div className="fdy-step__plan">
              <strong>Planner</strong> → <code>{s.proposed}</code> {s.rationale && <em>{s.rationale}</em>}
            </div>
            <div className="fdy-step__guard">
              <strong>Guardian</strong> → <span className={`fdy-verdict fdy-verdict--${s.verdict}`}>{s.verdict === 'ratify' ? 'RATIFY' : 'VETO'}</span> {s.guardianReason}
            </div>
          </div>
          <div className="fdy-step__tok">{s.tokS ? `${s.tokS} tok/s` : s.source === 'mock' ? 'no measurement · mock source' : ''}</div>
        </li>
      ))}
    </ol>
  )
}

// ---- The page ---------------------------------------------------------------

export default function FoundryApp() {
  const [parse, setParse] = useState<ParseFloorResponse | null>(null)
  const [parsing, setParsing] = useState(false)
  const [showChokepoints, setShowChokepoints] = useState(true)
  const [mode, setMode] = useState<QuorumMode>('verified')
  const [quorum, setQuorum] = useState<QuorumRunResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [revealed, setRevealed] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [uploadConsent, setUploadConsent] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadUxEnabled = import.meta.env.VITE_FOUNDRY_UPLOADS_ENABLED === 'true'
  const uploadAvailable = uploadUxEnabled && foundryCapabilities.browserExternalParse && uploadConsent

  const doParse = useCallback(async (imageDataUri?: string, hint?: string) => {
    setParsing(true)
    setQuorum(null)
    setRevealed(0)
    setApiError(null)
    try {
      setParse(await parseFloor({ imageDataUri, hint, uploadConsent }))
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Parse failed.')
    } finally {
      setParsing(false)
    }
  }, [uploadConsent])

  const onUpload = useCallback(
    async (file: File) => {
      setUploadError(null)
      try {
        if (!uploadUxEnabled || !foundryCapabilities.browserExternalParse || !uploadConsent) throw new Error('External parsing is local/backend demo only and requires consent.')
        const uri = await fileToDataUri(file)
        await doParse(uri, file.name)
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : 'Could not read that image.')
      }
    },
    [doParse, uploadConsent, uploadUxEnabled],
  )

  const openUploadChooser = useCallback(() => {
    if (!uploadAvailable) return
    fileRef.current?.click()
  }, [uploadAvailable])

  const runLoop = useCallback(async () => {
    if (!parse?.siteMap || !foundryCapabilities.browserQuorum) return
    setRunning(true)
    setRevealed(0)
    setApiError(null)
    try {
      const res = await quorumRun({ siteMap: parse.siteMap, mode })
      setQuorum(res)
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Quorum run failed.')
    } finally {
      setRunning(false)
    }
  }, [parse, mode])

  // Reveal the trace step-by-step so the loop reads as live.
  useEffect(() => {
    if (!quorum) return
    if (prefersReducedMotion()) {
      const t = setTimeout(() => setRevealed(quorum.steps.length), 0)
      return () => clearTimeout(t)
    }
    const t = setInterval(() => setRevealed((r) => (r >= quorum.steps.length ? r : r + 1)), 360)
    return () => clearInterval(t)
  }, [quorum])

  const trail = useMemo<GridPos[]>(() => {
    if (!quorum) return []
    const pts = quorum.steps.slice(0, revealed).map((s) => s.position)
    return pts
  }, [quorum, revealed])
  const cursor = trail.length ? trail[trail.length - 1] : parse?.siteMap?.start ?? null
  // Margin analysis runs IN THIS BROWSER on the parsed floor — chokepoints are
  // client-computed from open-source code, not server-asserted.
  const margin = useMemo(() => (parse?.siteMap ? analyzeFloorMargin(parse.siteMap) : null), [parse])
  const lastStep = quorum && revealed > 0 ? quorum.steps[Math.min(revealed, quorum.steps.length) - 1] : null
  const vetoCell =
    lastStep && lastStep.verdict === 'veto' && lastStep.proposed.startsWith('move:')
      ? nextCell(lastStep.position, lastStep.proposed)
      : null
  const fullyRevealed = quorum && revealed >= quorum.steps.length

  return (
    <div className="fdy">
      <header className="fdy-hero">
        <div className="fdy-hero__eyebrow">Origin Foundry · deterministic simulated evaluation</div>
        <h1>
          Inspect a proposed floor map.<br />
          Let a deterministic verifier <span className="fdy-hero__mark">decide what counts</span>.
        </h1>
        <p className="fdy-hero__sub">
          The public page uses a labeled browser-local sample. In a separately enabled local/backend demo, Cerebras may propose a floor map
          after affirmative consent. A deterministic oracle then evaluates simulated paths under the declared model—never an LLM grading an LLM.
          This is not robot training, deployment, execution, certification, or real-world safety validation.
        </p>
      </header>

      {apiError && (
        <div className="fdy-apierror" role="alert">
          {apiError}
        </div>
      )}

      <SpeedRacePanel enabled={foundryCapabilities.browserSpeed} />
      <PassportGymCard />
      <RsiVerifierCard />

      {/* Step 1 — upload + parse */}
      <section className="fdy-card">
        <div className="fdy-card__head">
          <h2>1 · Read the floor</h2>
          <p>
            Use the local sample, or—only in a separately enabled local/backend demo—consent to external image processing.
            A model-proposed grid is judged by a deterministic gate before the simulation uses it; unsupported proposals are <em>voided</em>.
          </p>
          <PerceiverResultStrip />
          <GateBenchStrip />
        </div>
        <label className="fdy-consent">
          <input type="checkbox" checked={uploadConsent} onChange={(e) => setUploadConsent(e.target.checked)} />
          I understand a selected image would leave this browser for Cerebras. Origin handler code does not intentionally persist it; do not upload personal, confidential, regulated, or customer data. <a href="/legal/privacy-policy.html">Privacy</a>
        </label>
        <div className="fdy-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            disabled={!uploadAvailable}
            onChange={uploadAvailable ? (e) => {
              const f = e.target.files?.[0]
              if (f) void onUpload(f)
            } : undefined}
          />
          <button className="fdy-btn fdy-btn--primary" onClick={uploadAvailable ? openUploadChooser : undefined} disabled={parsing || !uploadAvailable} aria-label="Upload a floor image (PNG or JPEG, under 7MB)">
            {parsing ? 'Reading…' : 'Upload a floor image'}
          </button>
          <button className="fdy-btn" onClick={() => void doParse(undefined, 'sample')} disabled={parsing}>
            Use the sample floor
          </button>
        </div>
        {(!uploadUxEnabled || !foundryCapabilities.browserExternalParse) && <p className="fdy-upload-error">External parse, quorum, and speed are local/backend demo only.</p>}
        {uploadError && <p className="fdy-upload-error" role="alert">{uploadError}</p>}

        {/* An upload that could not be parsed is REFUSED with the reason — the
            sample floor never stands in for a parse of the user's image. */}
        {parse && !parse.ok && (
          <div className="fdy-verdictbox fdy-verdictbox--refuse" role="alert">
            <strong>No parse ran</strong>
            <span>{parse.error}</span>
            <span>Nothing is shown because nothing was parsed. "Use the sample floor" explores the loop on a floor that is labeled as a sample.</span>
          </div>
        )}

        {/* A real parse the gate VOIDED: the named checks, no invented floor. */}
        {parse?.ok && parse.gate?.verdict === 'VOID' && <GateCard gate={parse.gate} evidence={parse} />}

        {parse?.siteMap && (
          <div className="fdy-parse">
            <FloorGrid map={parse.siteMap} trail={trail} cursor={cursor} veto={vetoCell} critical={showChokepoints && margin ? margin.criticalCells : []} />
            <div className="fdy-parse__side">
              <div className="fdy-parse__row">
                <SourceBadge source={parse.source} />
                {parse.fallback === 'no_image'
                  ? <span className="fdy-chip fdy-chip--sample">sample floor — not parsed from an upload</span>
                  : <span className="fdy-chip">vision</span>}
                {parse.timing?.tokS && <span className="fdy-chip">{parse.timing.tokS} tok/s</span>}
              </div>
              {parse.gate && parse.gate.verdict !== 'VOID' && <GateCard gate={parse.gate} evidence={parse} />}
              {margin && margin.verdict === 'finish' && (
                <div className={`fdy-verdictbox fdy-verdictbox--${margin.singleFailureSafe ? 'finish' : 'escalate'}`}>
                  <strong>
                    {margin.singleFailureSafe
                      ? `Single-failure analysis: no chokepoints in ${margin.sweptCells} swept cells`
                      : `Single-failure analysis: ${margin.criticalCells.length} chokepoint${margin.criticalCells.length === 1 ? '' : 's'}`}
                  </strong>
                  <span>
                    {margin.singleFailureSafe
                      ? 'No single blocked free cell (dock/pick/drop excluded) flips this floor\'s finish verdict — exact within this model, budget-aware, computed in this browser.'
                      : 'Blocking any marked free cell flips the verdict away from finish — exact within this model, budget-aware, computed in this browser.'}
                  </span>
                  <span>
                    {margin.disconnectionMargin === null
                      ? 'Disconnection margin: no set of free cells can sever the route (anchors adjoin) — budget effects can still flip it.'
                      : `Disconnection margin: ${margin.disconnectionMargin} free cell${margin.disconnectionMargin === 1 ? '' : 's'} (exact min cut, budget-blind — an upper bound, not the margin itself).`}{' '}
                    Model: static 4-connected grid with declared budgets — not a claim about any physical site.
                  </span>
                  {!margin.singleFailureSafe && (
                    <button className="fdy-btn fdy-btn--ghost" onClick={() => setShowChokepoints((s) => !s)}>
                      {showChokepoints ? 'Hide' : 'Show'} chokepoints on the grid
                    </button>
                  )}
                </div>
              )}
              {parse.oracle && (
                <div className={`fdy-verdictbox fdy-verdictbox--${parse.oracle.verdict}`}>
                  <strong>Oracle reads this floor: {parse.oracle.verdict.toUpperCase()}</strong>
                  <span>{parse.oracle.reason}</span>
                </div>
              )}
              {parse.repairs.length > 0 && (
                <details className="fdy-repairs" open>
                  <summary>{parse.repairs.length} deterministic repair{parse.repairs.length === 1 ? '' : 's'}</summary>
                  <ul>
                    {parse.repairs.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                  <p className="fdy-repairs__why">The model proposes; deterministic code disposes. Capability is not permission.</p>
                </details>
              )}
              <div className="fdy-legend">
                <span><i className="fg-start" />Dock</span>
                <span><i className="fg-item" />Pick</span>
                <span><i className="fg-drop" />Drop</span>
                <span><i className="fg-haz" />Hazard</span>
                <span><i className="fg-human" />Human-only</span>
                <span><i className="fg-wall" />Wall</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Step 2 — quorum loop */}
      {parse?.siteMap && (
        <section className="fdy-card">
          <div className="fdy-card__head">
            <h2>2 · Inspect a simulated proposal-and-check loop</h2>
            <p>A local backend can ask a Planner and Guardian to propose simulated actions; the deterministic oracle remains the label authority. The public build does not run this provider loop.</p>
          </div>
          <div className="fdy-modes">
            <button className={`fdy-pill${mode === 'verified' ? ' is-on' : ''}`} aria-pressed={mode === 'verified'} onClick={() => setMode('verified')}>
              Verified policy
            </button>
            <button className={`fdy-pill${mode === 'reckless' ? ' is-on' : ''}`} aria-pressed={mode === 'reckless'} onClick={() => setMode('reckless')}>
              Reckless (reward-hacker)
            </button>
            <button className="fdy-btn fdy-btn--primary" onClick={foundryCapabilities.browserQuorum ? runLoop : undefined} disabled={running || !foundryCapabilities.browserQuorum}>
              {running ? 'Running the loop…' : 'Run the Quorum loop'}
            </button>
            {!foundryCapabilities.browserQuorum && <span className="fdy-lane__note">Quorum: local/backend demo only.</span>}
          </div>

          {quorum && (
            <>
              <div className="fdy-stats">
                <Stat label="cycles" value={quorum.steps.length} />
                <Stat label="avg speed" value={quorum.avgTokS ?? '—'} unit=" tok/s" />
                <Stat label="model calls" value={quorum.totalCalls} />
                <Stat label="guardian vetoes" value={quorum.guardianVetoes} tone={quorum.guardianVetoes ? 'warn' : undefined} />
                <Stat label="wall clock" value={quorum.wallMs} unit="ms" />
              </div>
              <QuorumTrace result={quorum} revealed={revealed} />

              {fullyRevealed && (
                <div className="fdy-license">
                  <div className={`fdy-license__verdict fdy-license__verdict--${quorum.passed ? 'pass' : 'fail'}`}>
                    Oracle verdict: {quorum.passed ? 'PASS' : 'NOT READY'} · reward {quorum.reward.toFixed(2)}
                  </div>
                  <ul className="fdy-license__checks">
                    {quorum.checks.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                  {quorum.mode === 'reckless' && (
                    <div className="fdy-counter">
                      <strong>Without the Guardian</strong>, this same reward-hacker → <code>{quorum.counterfactual.category}</code>, reward{' '}
                      {quorum.counterfactual.reward.toFixed(2)}
                      {quorum.counterfactual.unsafeEntered && ' — it drove straight into a hazard.'} That's exactly what verifying every step prevented above.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}

      <TrainingPanel />

      <header className="fdy-hero" style={{ paddingBottom: 0 }}>
        <div className="fdy-hero__eyebrow">Evidence boundary</div>
        <p className="fdy-hero__sub">
          Model capability can propose; it cannot authorize. The environment executes only within its lane, the deterministic verifier evaluates,
          the gate decides, and the trace records the result. Simulation evidence does not establish physical-system safety or deployment readiness.
        </p>
      </header>

      <p className="fdy-brainline">
        The checked-in demo uses route-summary and map-derived features, not raw end-to-end perception. Its deterministic simulated evaluation is
        not robot training, deployment, or execution, and must not be used as a production-autonomy or robot-certification claim.
      </p>

      <footer className="fdy-foot">
        <span>Origin Physical AI · the oracle is the only judge</span>
        <a href="/app">Open the Origin console →</a>
      </footer>
    </div>
  )
}

// Compute the destination cell of a move from a position (for the veto X overlay).
function nextCell(p: GridPos, move: string): GridPos {
  if (move === 'move:north') return { x: p.x, y: p.y - 1 }
  if (move === 'move:south') return { x: p.x, y: p.y + 1 }
  if (move === 'move:east') return { x: p.x + 1, y: p.y }
  if (move === 'move:west') return { x: p.x - 1, y: p.y }
  return p
}
