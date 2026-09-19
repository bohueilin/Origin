// The /proving-ground surface — the resurrected unified robot flow, re-chained
// from the original console components: paint a floor + a MIXED fleet
// (ReflectAlign) → watch the SAME floor in 2D (MultiRobotSim) and 3D
// (ProvingGround3D) → the deterministic oracle scores one episode per robot
// type → the fleet earns a Verified Readiness Level (L0–L4) sealed as a signed
// credential that re-verifies on /verify. Placements are DESCRIPTIVE — they
// drive the animation, never the verdict (the oracle scores geometry + policy).
import { useMemo, useRef, useState } from 'react'
import '../shared/product-workspace.css'
import { ReflectAlign } from '../components/ReflectAlign'
import { MultiRobotSim } from '../components/MultiRobotSim'
import { ProvingGround3D } from '../components/ProvingGround3D'
import { starterUnderstanding } from './starterFloor'
import { fleetReadiness } from './fleetReadiness'
import { LICENSE_LEVELS, levelRank } from '../license'
import { EMBODIMENT_CODE } from '../environmentPlan'
import type { FloorPlanSnapshot } from '../floorPlanStore'
import type { FrozenWorkflow } from '../workflowDraft'
import { signSigil, generateSigningKey, keyThumbprint } from '@origin/verifier-core/sigil'
import { canonical, sha256 } from '@origin/evidence/env-evidence'

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

const LEVEL_ORDER = ['L0', 'L1', 'L2', 'L3', 'L4'] as const
const VERDICT_DOT: Record<string, string> = { finish: '#0f9d6e', escalate: '#b97400', refuse: '#e5484d' }

export function ProvingGroundPage() {
  const [draft] = useState(starterUnderstanding)
  const [snapshot, setSnapshot] = useState<FloorPlanSnapshot | null>(null)
  const [frozen, setFrozen] = useState<FrozenWorkflow | null>(null)
  const [view, setView] = useState<'2d' | '3d'>('2d')
  const [signedEvidence, setSigil] = useState<{ thumb: string; obj: unknown; inputDigest: string } | null>(null)
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const resultsRef = useRef<HTMLDivElement | null>(null)

  const siteMap = snapshot?.siteMap ?? draft.siteMap
  const embodiment = snapshot?.embodiment ?? draft.embodiment
  const domain = snapshot?.domain ?? draft.domain

  const { episodes, readiness, unverifiedFalseAccepts, digestInput } = useMemo(
    () => fleetReadiness(siteMap, embodiment),
    [siteMap, embodiment],
  )
  const level = readiness.level
  const inputDigest = sha256(canonical(digestInput))
  // A signature is displayed only beside the exact evaluated input it seals,
  // including when the visitor edits the floor while Web Crypto is still busy.
  const sigil = signedEvidence?.inputDigest === inputDigest ? signedEvidence : null
  const uniformVerdict = episodes.every((e) => e.evaluation.verdict === episodes[0]?.evaluation.verdict)

  const approve = (f: FrozenWorkflow) => {
    setFrozen(f)
    setSigil(null)
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }))
  }

  const signCredential = async () => {
    setSigning(true)
    setSignError(null)
    try {
      const payload = { ...digestInput, receipt_digest: sha256(canonical(digestInput)) }
      const kp = await generateSigningKey()
      const s = await signSigil(payload, kp, { issuer: 'origin-proving-ground', kind: 'fleet-readiness-credential' })
      setSigil({ thumb: await keyThumbprint(s.pubkey_jwk), obj: s, inputDigest })
    } catch (e) {
      setSignError(e instanceof Error ? e.message : String(e))
    } finally {
      setSigning(false)
    }
  }

  const download = () => {
    if (!sigil) return
    const blob = new Blob([JSON.stringify(sigil.obj, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fleet-readiness.sigil.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="pg-wrap product-workspace">
      <ol className="workspace-steps" aria-label="Proving-ground workflow">
        <li><span>01</span><div><b>Edit the synthetic floor</b>Geometry and fleet composition</div></li>
        <li><span>02</span><div><b>Explore the playback</b>The same floor in 2D or 3D</div></li>
        <li><span>03</span><div><b>Inspect the oracle result</b>Per-type episodes and demo evidence</div></li>
      </ol>
      {/* 1 · Paint the floor + the mixed fleet (the original console step, intact) */}
      <ReflectAlign draft={draft} onApprove={approve} onEdit={setSnapshot} onBack={() => window.location.assign('/labs')} backLabel="← Back to Labs" mode="proving-ground" />

      {/* 2 · Watch the SAME floor in 2D / 3D — descriptive playback of the deployment */}
      <div className="pg-stage">
        <div className="pg-stage__bar">
          <div><p className="pg-h">02 · Descriptive playback</p><h2>The floor you just painted.</h2></div>
          <div className="pg-toggle" role="group" aria-label="Playback view">
            <button aria-pressed={view === '2d'} className={view === '2d' ? 'is-on' : ''} onClick={() => setView('2d')}>2D</button>
            <button aria-pressed={view === '3d'} className={view === '3d' ? 'is-on' : ''} onClick={() => setView('3d')}>3D</button>
          </div>
        </div>
        {view === '2d'
          ? <MultiRobotSim siteMap={siteMap} embodiment={embodiment} verdictLabel={uniformVerdict ? episodes[0]?.evaluation.verdict : 'mixed per robot type — see episodes below'} />
          : <ProvingGround3D siteMap={siteMap} embodiment={embodiment} domain={domain} />}
        <p className="pg-note">
          The animation is <b>descriptive</b> — robot placements drive what you watch, never the verdict.
          The deterministic oracle scores the floor's geometry and policy alone; move every robot and the
          verdicts below stay byte-identical.
        </p>
      </div>

      {/* 3 · The oracle's verdicts + the earned Verified Readiness Level */}
      <div className="pg-results" ref={resultsRef}>
        <div><p className="pg-h">03 · The oracle record</p><h2>One episode per robot type.</h2></div>
        <div className="pg-episodes">
          {episodes.map((e) => (
            <div key={e.embodiment} className="pg-episode">
              <span className="pg-episode__dot" style={{ background: VERDICT_DOT[e.evaluation.verdict] }} />
              <b>{EMBODIMENT_CODE[e.embodiment]}</b>
              <span className="pg-episode__name">{e.embodiment}</span>
              <span className="pg-episode__verdict">{e.evaluation.verdict}</span>
              <span className="pg-episode__meta">
                {e.evaluation.verdict === 'finish'
                  ? `finish in this synthetic gym · reward ${e.verdict.reward.toFixed(2)}`
                  : e.evaluation.verdict === 'escalate'
                    ? 'gym verdict — escalate to a human'
                    : 'gym verdict — refuse the order'}
                {e.verdict.catastrophic ? ' · CATASTROPHIC' : ''}
              </span>
            </div>
          ))}
        </div>
        {unverifiedFalseAccepts > 0 && (
          <p className="pg-note">
            <b>Counterfactual:</b> an <b>unverified</b> always-act policy false-accepts{' '}
            {unverifiedFalseAccepts} episode(s) on this floor — claiming success it never actually
            earned (executing a forbidden order, or fabricating a finish no route supports). The
            verified fleet does neither; its catastrophic count stays 0. Capability is not permission.
          </p>
        )}

        <div className="pg-ladder" aria-label="Verified Readiness Level ladder">
          {LEVEL_ORDER.map((id) => {
            const l = LICENSE_LEVELS[id]
            const on = id === level.id
            const earned = levelRank(id) <= levelRank(level.id)
            return (
              <div key={id} className={`pg-rung${on ? ' is-on' : ''}${earned ? ' is-earned' : ''}`} style={on ? { borderColor: l.color } : undefined}>
                <b>{id}</b>
                <span>{l.name}</span>
              </div>
            )
          })}
        </div>

        <div className="pg-verdict" style={{ borderColor: level.color }}>
          <div className="pg-verdict__badge" style={{ background: level.color }}>
            <b>{level.id}</b>
            <span>{level.name}</span>
          </div>
          <div>
            <p className="pg-verdict__line">
              <b>Verified Readiness Level {level.id} — {level.name}.</b>{' '}
              {readiness.catastrophicCount > 0
                ? `${readiness.catastrophicCount} catastrophic episode(s) hard-cap the level — the right to act cannot be averaged back.`
                : `Pass rate ${Math.round(readiness.passRate * 100)}% and average reward ${readiness.avgReward.toFixed(2)} across ${readiness.episodes} embodiment episode(s), zero catastrophic.`}
            </p>
            <p className="pg-verdict__perm">An illustrative readiness level for this synthetic floor and fixed verifier. It grants no deployment permission.</p>
            <p className="pg-verdict__scope">A level means "reproducible under this verifier" on this exact floor — never "safe." Simulation evidence is not real-world validation or robot certification.</p>
          </div>
        </div>

        <div className="pg-evidence">
          {!sigil
            ? <button className="btn btn--primary btn--sm" onClick={signCredential} disabled={signing || (!frozen && !snapshot)} aria-busy={signing}>
                {signing ? 'Signing this floor…' : 'Sign this floor → fleet readiness credential'}
              </button>
            : <>
                <button className="btn btn--ghost btn--sm" onClick={download}>Download the credential</button>
                <a className="btn btn--ghost btn--sm" href="/verify">Re-verify it on /verify →</a>
                <span className="pg-thumb">signed · {level.id} · key {sigil.thumb.slice(0, 10)}…</span>
              </>}
        </div>
        {signError && <p className="rc-error" role="alert">Could not sign this floor: {signError}</p>}
        {!sigil && <p className="pg-note">Signing creates a browser-session integrity artifact for the current evaluated inputs. Change the geometry or fleet composition and sign again.</p>}
        {sigil && (
          <p className="pg-note">
            Signed with an <b>in-session key</b> (thumbprint above) for offline integrity — a{' '}
            <b>demo credential</b>, not an Origin-issued attestation. A trusted production issuer and runtime enforcement are proposed architecture; this page does not provide them.
          </p>
        )}
      </div>
    </div>
  )
}
