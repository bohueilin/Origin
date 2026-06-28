import { useEffect, useRef, useState } from 'react'
import type { PassportSnapshot } from '../../engine/session'
import type { Capability } from '../../types'
import type { OrderContext } from '../../orderContext'
import type { DiscordSendResult } from '../../discordClient'
import { sendJourneySummary } from '../../emailClient'
import type { EmailResult } from '../../emailClient'

export interface ExecState {
  discord?: DiscordSendResult
}

interface ResultRow {
  icon: string
  head: string
  detail: string
}

function approved(snap: PassportSnapshot, cap: Capability): boolean {
  return snap.approvals.some((p) => p.capability === cap && (p.status === 'approved' || p.status === 'consumed'))
}

/** A crisp, colorful envelope that scales with the button text. */
function MailIcon() {
  return (
    <svg className="pp-mail-ico" viewBox="0 0 24 24" width="1.25em" height="1.25em" aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="14" rx="3.2" fill="#3b62d6" />
      <path d="M4 8l8 5.4L20 8" fill="none" stroke="#bcd6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * The execution-results moment: once the run completes, Passport reports back exactly what it did —
 * only the actions you approved. It AUTO-emails you the recap on completion; the button re-sends it.
 * Closes the loop: request → understand → act (with a granted Passport) → results.
 */
export function ResultsSummary({ snap, exec, ctx }: { snap: PassportSnapshot; exec: ExecState; ctx: OrderContext | null }) {
  const [emailing, setEmailing] = useState(false)
  const [emailRes, setEmailRes] = useState<EmailResult | null>(null)
  const autoSentRef = useRef(false)

  const completed = snap.status === 'completed'

  const rows: ResultRow[] = []
  if (completed) {
    if (approved(snap, 'delivery.order.submit')) {
      const place = ctx?.deliveryAddress ?? 'your home'
      const eta = ctx?.orderEta ?? '7:00 PM'
      const vendor = ctx?.orderVendor ?? 'La Taqueria · DoorDash'
      rows.push({ icon: '🌯', head: 'DoorDash order placed', detail: `${vendor} — ETA ${eta} at ${place}.` })
    }
    if (approved(snap, 'social.post.commit')) {
      const d = exec.discord
      const detail = d
        ? d.simulated
          ? `Message ready for #game-night (simulated — set a webhook to post for real).`
          : d.ok
            ? 'Posted to your Discord — your homies can join you.'
            : 'Tried to post — Discord did not accept it.'
        : 'Shared the plan to Discord · Game Night.'
      rows.push({ icon: '🎮', head: 'Game Night invited', detail })
    }
    if (approved(snap, 'calendar.write.commit')) {
      rows.push({
        icon: '🗓',
        head: 'Calendar event added',
        detail: 'FIFA catch-up night · Thursday next week, 6:30–9:00 PM PST — blocked on your calendar.',
      })
    }
    if (approved(snap, 'reminders.write.commit')) {
      rows.push({
        icon: '⏰',
        head: 'Reminders set',
        detail: 'Nudge 1 hour before — 5:30 PM PST — plus mute sports notifications until kickoff so nothing spoils it.',
      })
    }
  }

  const nothing = rows.length === 0

  const sendNow = () => {
    setEmailing(true)
    void sendJourneySummary({
      scenario: snap.scenario.title,
      request: snap.intent.raw_user_request,
      results: rows.map((r) => ({ head: r.head, detail: r.detail })),
    }).then((r) => {
      setEmailRes(r)
      setEmailing(false)
    })
  }

  // Auto-send the summary once, the moment the run completes with real outcomes. (Keyed by run via
  // App's runKey remount, so a replay auto-sends again.)
  useEffect(() => {
    if (completed && !nothing && !autoSentRef.current) {
      autoSentRef.current = true
      sendNow()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed, nothing])

  if (!completed) return null

  return (
    <section className="pp-results">
      <div className="pp-results-head">
        <span className="pp-results-mark" aria-hidden="true">
          ✓
        </span>
        <div>
          <div className="pp-results-kicker">Done · execution results</div>
          <h2 className="pp-results-title">{nothing ? 'Nothing was executed — and that’s fine' : 'Here’s what I did'}</h2>
        </div>
      </div>

      {nothing ? (
        <p className="pp-results-empty">
          You held everything back — no order, no message, nothing irreversible. The full plan is ready whenever you want it.
        </p>
      ) : (
        <div className="pp-results-rows">
          {rows.map((r) => (
            <div key={r.head} className="pp-results-row">
              <span className="pp-results-icon" aria-hidden="true">
                {r.icon}
              </span>
              <div className="pp-results-tx">
                <b>{r.head}</b>
                <span>{r.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!nothing && (
        <div className="pp-results-actions">
          <button className="pp-btn pp-btn-ghost pp-email-btn" onClick={sendNow} disabled={emailing}>
            <MailIcon />
            <span>{emailing ? 'Sending…' : emailRes?.sent ? 'Resend summary' : 'Email me this summary'}</span>
          </button>
          {emailRes &&
            (emailRes.sent ? (
              <span className="pp-results-email pp-results-email-ok">✓ Sent to {emailRes.to}</span>
            ) : (
              <span className="pp-results-email pp-results-email-sim">
                Summary ready — add an email provider to send to {emailRes.to}
              </span>
            ))}
        </div>
      )}

      <p className="pp-results-foot">Sent to your inbox automatically · every real-world action ran only after you approved it.</p>
    </section>
  )
}
