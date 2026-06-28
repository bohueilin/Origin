import { useCallback, useEffect, useRef, useState } from 'react'
import { usePassport } from './usePassport'
import type { Speed } from './usePassport'
import { Home } from './components/Home'
import { RunHeader } from './components/RunHeader'
import { PhoneApproval } from './components/PhoneApproval'
import { DiscordShare } from './components/DiscordShare'
import { ResultsSummary } from './components/ResultsSummary'
import type { ExecState } from './components/ResultsSummary'
import { PassportCard } from './components/PassportCard'
import { IntentPanel } from './components/IntentPanel'
import { AgentCollab } from './components/AgentCollab'
import { PlanTimeline } from './components/PlanTimeline'
import { ToolActivityFeed } from './components/ToolActivityFeed'
import { ApprovalCard } from './components/ApprovalCard'
import { SnapliiPurchase } from './components/SnapliiPurchase'
import { ItineraryPanel } from './components/ItineraryPanel'
import { AuditTraceViewer } from './components/AuditTraceViewer'
import { PreventedPanel } from './components/PreventedPanel'
import { IntentConformanceMonitor } from './components/IntentConformanceMonitor'
import { DelegationChain } from './components/DelegationChain'
import { AccessLedger } from './components/AccessLedger'
import { Section } from './bits'
import type { SessionStatus } from '../engine/session'
import type { ScenarioSpec } from '../scenarios/types'
import { fetchOrderContext } from '../orderContext'
import type { OrderContext } from '../orderContext'
import type { DiscordSendResult } from '../discordClient'
import { useAuth } from '../../auth/AuthProvider'

// Only the logged-in Origin owner may TRIGGER actions on the public site; everyone else
// (anonymous or any other account) is view-only. Display stays fully live for all viewers.
const OWNER_EMAIL = 'bohueilin@gmail.com'

const STAGES: { key: SessionStatus | 'planning'; label: string }[] = [
  { key: 'planning', label: 'Intent + grant' },
  { key: 'running', label: 'Plan + tools' },
  { key: 'awaiting_approval', label: 'Approval gate' },
  { key: 'completed', label: 'Itinerary + audit' },
]

export function App() {
  const pp = usePassport()
  const snap = pp.snapshot
  const { user } = useAuth()
  const isOwner = (user?.email ?? '').trim().toLowerCase() === OWNER_EMAIL
  const approvalsRef = useRef<HTMLDivElement>(null)
  const reviewApprovals = () => approvalsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })

  // Real-world execution outcomes (the Discord send), surfaced in the results summary.
  // Reset on each fresh run so a replay starts clean.
  const [exec, setExec] = useState<ExecState>({})
  const [orderCtx, setOrderCtx] = useState<OrderContext | null>(null)
  // Bumped on every fresh run/replay; used as a remount key so the stateful side-effect
  // components (discord, phone, results) start clean and re-fire on a replay.
  const [runKey, setRunKey] = useState(0)
  useEffect(() => {
    let cancel = false
    void fetchOrderContext().then((c) => {
      if (!cancel) setOrderCtx(c)
    })
    return () => {
      cancel = true
    }
  }, [])
  // Deep link from a phone push / shared link: /passport?approve=<id> resolves the matching
  // pending packet in THIS live session, then strips the param. No-op if there's no such
  // pending approval (e.g. a fresh tab with no running session) or the viewer isn't the owner.
  // snaplii.purchase is excluded — that buy is approved only through its own broker surface.
  const approveParam = useRef<string | null>(
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('approve'),
  )
  useEffect(() => {
    const id = approveParam.current
    if (!id || !isOwner || !snap) return
    const p = snap.approvals.find(
      (a) => a.approval_id === id && a.status === 'pending' && a.capability !== 'snaplii.purchase',
    )
    if (!p) return
    approveParam.current = null
    pp.approve(id)
    const u = new URL(window.location.href)
    u.searchParams.delete('approve')
    window.history.replaceState({}, '', u.toString())
  }, [isOwner, snap, pp])
  // Every trigger is a no-op for non-owners — the public site is view-only.
  const startRun = (s: ScenarioSpec) => {
    if (!isOwner) return
    setExec({})
    setRunKey((k) => k + 1)
    pp.start(s)
  }
  const replayRun = () => {
    if (!isOwner) return
    setExec({})
    setRunKey((k) => k + 1)
    pp.replay()
  }
  const setSpeed = (sp: Speed) => {
    if (!isOwner) return
    pp.setSpeed(sp)
  }
  const approve = (id: string) => {
    if (!isOwner) return
    pp.approve(id)
  }
  const deny = (id: string) => {
    if (!isOwner) return
    pp.deny(id)
  }
  const revoke = () => {
    if (!isOwner) return
    pp.revoke()
  }
  const onDiscordSent = useCallback((r: DiscordSendResult) => setExec((e) => ({ ...e, discord: r })), [])

  if (!snap) {
    return (
      <div className="pp-app">
        <TopBar />
        {!isOwner && <ReadOnlyBanner />}
        <Home onRun={startRun} canRun={isOwner} />
        <Footer />
      </div>
    )
  }

  const stageIndex =
    snap.status === 'completed' ? 3 : snap.status === 'awaiting_approval' ? 2 : snap.status === 'revoked' ? 3 : 1

  return (
    <div className="pp-app">
      <TopBar
        crumb={snap.scenario.title}
        onBack={pp.reset}
        status={snap.status}
      />

      {!isOwner && <ReadOnlyBanner />}

      <div className="pp-controlbar">
        <div className="pp-stages">
          {STAGES.map((s, i) => (
            <div key={s.label} className={`pp-stage ${i <= stageIndex ? 'pp-stage-on' : ''} ${i === stageIndex ? 'pp-stage-cur' : ''}`}>
              <span className="pp-stage-i">{i + 1}</span>
              <span className="pp-stage-l">{s.label}</span>
            </div>
          ))}
        </div>
        <div className="pp-speed" role="group" aria-label="Playback speed">
          {(['live', 'fast', 'instant'] as Speed[]).map((sp) => (
            <button
              key={sp}
              className={`pp-speed-btn ${pp.speed === sp ? 'pp-speed-on' : ''}`}
              onClick={() => setSpeed(sp)}
              aria-pressed={pp.speed === sp}
              disabled={!isOwner}
              aria-disabled={!isOwner}
            >
              {sp === 'live' ? '▶ Live' : sp === 'fast' ? '⏩ Fast' : '⤓ Instant'}
            </button>
          ))}
          <button className="pp-speed-btn pp-replay-btn" onClick={replayRun} title="Replay this scenario" disabled={!isOwner} aria-disabled={!isOwner}>↻ Replay</button>
        </div>
      </div>

      <div className="pp-run">
        <RunHeader snap={snap} onRevoke={revoke} onReview={reviewApprovals} canRun={isOwner} />

        <ResultsSummary key={`results-${runKey}`} snap={snap} exec={exec} ctx={orderCtx} />

        <IntentConformanceMonitor snap={snap} />

        <AgentCollab snap={snap} />

        <DelegationChain snap={snap} />

        <AccessLedger leases={snap.ledger.leases} onRevoke={revoke} />

        {/* The snaplii.purchase buy is rendered by its own SnapliiPurchase surface (below),
            so the generic approvals list skips it to avoid showing it twice. */}
        {(() => {
          const generic = snap.approvals.filter((a) => a.capability !== 'snaplii.purchase')
          if (generic.length === 0) return null
          return (
            <div ref={approvalsRef}>
              <Section
                kicker="Your approval"
                title="Sensitive actions are prepared — then wait for you"
                aside={<span className="pp-count">{generic.filter((a) => a.status === 'approved' || a.status === 'consumed').length}/{generic.length} approved</span>}
              >
                <div className="pp-approvals">
                  {generic.map((p) => (
                    <ApprovalCard
                      key={p.approval_id}
                      packet={p}
                      active={p.approval_id === snap.pendingApprovalId}
                      onApprove={() => approve(p.approval_id)}
                      onDeny={() => deny(p.approval_id)}
                      canRun={isOwner}
                    />
                  ))}
                </div>
              </Section>
            </div>
          )
        })()}

        <SnapliiPurchase snap={snap} canRun={isOwner} onApproved={approve} />

        <PhoneApproval key={`phone-${runKey}`} snap={snap} onApprove={approve} interactive={isOwner} />

        <DiscordShare key={`discord-${runKey}`} snap={snap} ctx={orderCtx} onSent={onDiscordSent} />

        <PlanTimeline snap={snap} />
        <ToolActivityFeed snap={snap} />

        {snap.itinerary && <ItineraryPanel itinerary={snap.itinerary} />}

        <details className="pp-report">
          <summary className="pp-report-summary">
            <span>Full report</span>
            <span className="pp-report-hint">grant · intent · what Passport prevented · tamper-evident audit</span>
          </summary>
          <div className="pp-report-body">
            <PassportCard snap={snap} onRevoke={revoke} canRun={isOwner} />
            <IntentPanel snap={snap} />
            <PreventedPanel prevented={snap.prevented} />
            <AuditTraceViewer snap={snap} />
          </div>
        </details>

        <div className="pp-replay">
          <button className="pp-btn pp-btn-ghost" onClick={pp.reset}>← Back to all scenarios</button>
        </div>
      </div>
      <Footer />
    </div>
  )
}

function TopBar({ crumb, onBack, status }: { crumb?: string; onBack?: () => void; status?: SessionStatus }) {
  return (
    <header className="pp-top">
      <div className="pp-top-brand" onClick={onBack} role={onBack ? 'button' : undefined}>
        <img className="pp-top-mark" src="/origin-logo.png" alt="" aria-hidden="true" />
        <span className="pp-top-name">Passport</span>
        <span className="pp-top-sub">delegated autonomy you can trust</span>
      </div>
      {crumb && (
        <nav className="pp-top-nav">
          <button className="pp-top-back" onClick={onBack}>← All scenarios</button>
          <span className="pp-top-crumb">{crumb}</span>
          {status && <span className={`pp-top-status pp-top-status-${status}`}>{statusLabel(status)}</span>}
        </nav>
      )}
    </header>
  )
}

function statusLabel(s: SessionStatus): string {
  switch (s) {
    case 'awaiting_approval':
      return 'Awaiting your approval'
    case 'completed':
      return 'Complete'
    case 'revoked':
      return 'Revoked'
    default:
      return 'Running'
  }
}

function Footer() {
  return (
    <footer className="pp-foot">
      <span>Passport · local demo</span>
      <span className="pp-foot-mid">Capability is not permission. The agent can propose; Passport decides what it may do.</span>
      <span>No real actions · credentials stay brokered, scoped, revocable</span>
    </footer>
  )
}

// Persistent view-only notice for anonymous visitors and non-owner accounts. Everything still
// renders — only the triggers are inert.
function ReadOnlyBanner() {
  return (
    <div className="pp-readonly" role="status">
      <span className="pp-readonly-ico" aria-hidden="true">🔒</span>
      <span className="pp-readonly-tx">
        Read-only preview — sign in as the Origin owner to run Passport live.
      </span>
      <a className="pp-readonly-link" href="/auth?next=/passport">Sign in →</a>
    </div>
  )
}
