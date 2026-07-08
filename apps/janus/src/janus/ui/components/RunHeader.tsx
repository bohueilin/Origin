import type { JanusSnapshot } from '../../engine/session'
import { getScenario } from '../../scenarios'
import { money } from '../format'
import { BRAND_LOGOS } from '../brandLogos'

const STATUS_LABEL: Record<string, string> = {
  running: 'Working…',
  awaiting_approval: 'Waiting for you',
  completed: 'Done',
  revoked: 'Stopped',
}

/** Map a tool name to a real brand logo (simple-icons) where one exists. */
function brandSlug(name: string): string | null {
  const n = name.toLowerCase()
  if (n.includes('calendar')) return 'googlecalendar'
  if (n.includes('youtube')) return 'youtube'
  if (n.includes('doordash')) return 'doordash'
  if (n.includes('uber')) return 'ubereats'
  if (n.includes('discord')) return 'discord'
  return null
}

/** Fallback emoji for products without a bundled logo (Snaplii, Sports, Reminders). */
function toolGlyph(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('sport')) return '⚽'
  if (n.includes('snaplii') || n.includes('wallet')) return '💳'
  if (n.includes('reminder')) return '⏰'
  return '🧩'
}

/** The product's real logo (inline SVG, offline) on a white app-tile, else a fallback glyph. */
function BrandIcon({ name }: { name: string }) {
  const slug = brandSlug(name)
  const logo = slug ? BRAND_LOGOS[slug] : null
  return (
    <span className="pp-tool-ico" aria-hidden="true">
      {logo ? (
        <svg viewBox="0 0 24 24" width="16" height="16" role="img">
          <path d={logo.d} fill={logo.color} />
        </svg>
      ) : (
        toolGlyph(name)
      )}
    </span>
  )
}

/**
 * The human-first run header (Luma-clean): your request, the tools Janus granted (with their
 * product app-icons, each flipping to "approved" once you OK it), overall progress, and the phone
 * approval callout. The technical grant/intent/audit detail lives lower, in the "Full report" disclosure.
 */
export function RunHeader({
  snap,
  onReview,
  onRevoke,
}: {
  snap: JanusSnapshot
  onReview?: () => void
  onRevoke?: () => void
}) {
  const scenario = getScenario(snap.scenario.id)
  const tools = scenario?.tools ?? []
  const total = snap.plan.steps.length
  const done = snap.plan.steps.filter((s) => s.status === 'done').length
  const pct = Math.round((done / Math.max(1, total)) * 100)
  const awaiting = snap.status === 'awaiting_approval'
  const pending = snap.approvals.find((a) => a.approval_id === snap.pendingApprovalId)
  const live = snap.status === 'running' || snap.status === 'awaiting_approval'
  // Capability breakdown (these three are one axis and sum to the capabilities Janus weighed):
  // granted = read/draft the agent got · gated = unlocked only by your approval · forbidden = never.
  const granted = snap.grant.allowed_capabilities.length
  const gated = snap.grant.requires_approval_for.length
  const forbidden = Math.max(0, snap.grant.denied_capabilities.length - gated)

  const capDone = (cap?: string) =>
    !!cap && snap.approvals.some((a) => a.capability === cap && (a.status === 'approved' || a.status === 'consumed'))

  return (
    <section className="pp-runhead">
      <div className="pp-runhead-top">
        <div className="pp-runhead-req">
          <span className="pp-mini-label">Your request</span>
          <p className="pp-runhead-prompt">{snap.intent.raw_user_request}</p>
        </div>
        <div className="pp-runhead-meta">
          <span className={`pp-runhead-status pp-runhead-status-${snap.status}`}>{STATUS_LABEL[snap.status] ?? 'Working…'}</span>
          {live && onRevoke && (
            <button className="pp-runhead-revoke" onClick={onRevoke} title="Kill switch — stop the agent now">⊘ Revoke</button>
          )}
        </div>
      </div>

      <div className="pp-runstats" aria-label="Run summary">
        <div className="pp-stat" title="Branded tools Janus scoped to the agent for this task">
          <b>{tools.length}</b><span>Tools</span>
        </div>
        <div className="pp-stat" title="Steps in the agent's plan, from reading your intent to the final itinerary">
          <b>{total}</b><span>Plan steps</span>
        </div>
        <div className="pp-stat pp-stat-good" title="Read & draft capabilities the agent was granted outright (no side effects)">
          <b>{granted}</b><span>Granted</span>
        </div>
        <div className="pp-stat pp-stat-appr" title="Real-world actions the agent can NEVER do on its own — each unlocks once, only with your approval">
          <b>{gated}</b><span>Need your OK</span>
        </div>
        <div className="pp-stat pp-stat-deny" title="Never granted, even with your approval: moving money directly and holding raw, unscoped credentials">
          <b>{forbidden}</b><span>Forbidden</span>
        </div>
      </div>

      {tools.length > 0 && (
        <div className="pp-runhead-tools">
          <span className="pp-mini-label">Tools Janus gave the agent — only these, only for this task</span>
          <div className="pp-tool-row">
            {tools.map((t) => {
              const isDone = capDone(t.cap)
              const needsOk = Boolean(t.approval) && !isDone
              return (
                <span key={t.name} className={`pp-tool ${needsOk ? 'pp-tool-approval' : ''} ${isDone ? 'pp-tool-done' : ''}`}>
                  <BrandIcon name={t.name} />
                  <span className="pp-tool-tx">
                    <b>{t.name}</b>
                    <span>{t.use}</span>
                  </span>
                  {needsOk && <em className="pp-tool-badge">needs your ok</em>}
                  {isDone && <em className="pp-tool-badge pp-tool-badge-done">{t.doneLabel ?? '✓ approved'}</em>}
                </span>
              )
            })}
          </div>
        </div>
      )}

      <div className="pp-runhead-progress">
        <div className="pp-progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
        <span className="pp-runhead-pct">{done} of {total} steps</span>
      </div>

      {awaiting && pending && (
        <button className="pp-phone" onClick={onReview}>
          <span className="pp-phone-icon" aria-hidden="true">📱</span>
          <span className="pp-phone-tx">
            <b>Approval request sent to your phone</b>
            <span>
              {pending.action_type}
              {pending.estimated_cost ? ` · ${money(pending.estimated_cost)}` : ''} — tap to review
            </span>
          </span>
          <span className="pp-phone-cta">Review ↓</span>
        </button>
      )}
    </section>
  )
}
