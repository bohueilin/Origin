import { useEffect, useRef, useState } from 'react'
import type { PassportSnapshot } from '../../engine/session'
import { requestPhoneApproval, pollPhoneStatus, phoneApprovalLink } from '../../notifyClient'
import type { PhoneApprovalHandle } from '../../notifyClient'
import { Section } from '../bits'

/**
 * Sends a REAL push/SMS to your phone for the pending sensitive action (anything irreversible
 * or carrying a cost), then mirrors a phone tap back into the run. You can equally approve in
 * the panel above — whichever happens first wins. One notification per distinct packet.
 *
 * `handle` and `tapped` are derived against the active packet id so a new packet starts fresh
 * with no setState-in-effect resets.
 */
export function PhoneApproval({ snap, onApprove, interactive = true }: { snap: PassportSnapshot; onApprove: (approvalId: string) => void; interactive?: boolean }) {
  // Every pending approval gets a phone push — so the run never stalls waiting on a notification
  // that was never sent (e.g. the calendar / reminders gates).
  // The snaplii.purchase buy is approved only through its own broker surface (SnapliiPurchase),
  // never via the phone push — a phone approval would resolve the engine gate WITHOUT charging the
  // real broker. So skip it here.
  const pending = snap.approvals.find((a) => a.approval_id === snap.pendingApprovalId && a.status === 'pending' && a.capability !== 'snaplii.purchase')
  const sensitive = !!pending
  const activeId = sensitive && pending ? pending.approval_id : null

  const [handleState, setHandleState] = useState<{ id: string; handle: PhoneApprovalHandle | null } | null>(null)
  const [tappedId, setTappedId] = useState<string | null>(null)
  const sentForRef = useRef<string | null>(null)

  // Derived against the current packet — stale state for a previous packet reads as absent.
  const handle = handleState && handleState.id === activeId ? handleState.handle : null
  const tapped = tappedId !== null && tappedId === activeId

  // Send exactly one notification when a new sensitive packet becomes pending. View-only
  // visitors never fire a real push — they get the simulated card without a network call.
  useEffect(() => {
    if (!activeId || !pending) return
    if (sentForRef.current === activeId) return
    sentForRef.current = activeId
    let cancel = false
    void (async () => {
      const h: PhoneApprovalHandle = interactive
        ? await requestPhoneApproval({ approvalId: activeId, title: pending.action_type, summary: pending.description, amount: null })
        : { id: `sim-${activeId}`, channel: 'simulation', target: 'your phone', pushed: false, approvableFromPhone: false }
      if (!cancel) setHandleState({ id: activeId, handle: h })
    })()
    return () => {
      cancel = true
    }
  }, [activeId, pending, interactive])

  // On-screen tap = the bulletproof path: the simulated phone's Approve resolves THIS exact
  // packet in the live session, so the agent continues even when no real push channel is wired.
  const approveFromCard = () => {
    if (!interactive || !activeId || tapped) return
    setTappedId(activeId)
    onApprove(activeId)
  }

  // Poll for a phone tap; on approval, advance this exact packet once.
  useEffect(() => {
    if (!interactive) return
    if (!handle || !activeId || tapped || !handle.approvableFromPhone) return
    let cancel = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      const s = await pollPhoneStatus(handle.id)
      if (cancel) return
      if (s === 'approved') {
        setTappedId(activeId)
        onApprove(activeId)
        return
      }
      if (s === 'expired') return // stop polling; in-app approval still works
      timer = setTimeout(tick, 1200)
    }
    timer = setTimeout(tick, 1200)
    return () => {
      cancel = true
      clearTimeout(timer)
    }
  }, [handle, activeId, tapped, onApprove, interactive])

  if (!sensitive || !pending) return null

  const sim = handle?.channel === 'simulation'
  const channelLabel =
    handle?.channel === 'push+sms' ? 'Push + SMS' : handle?.channel === 'push' ? 'Push' : handle?.channel === 'sms' ? 'SMS' : 'Simulation'
  const link = activeId ? phoneApprovalLink(activeId) : ''

  return (
    <Section
      kicker="Approve from your phone"
      title="A request just went to your phone"
      aside={<span className={`pp-ph-badge ${sim ? 'pp-ph-badge-sim' : ''}`}>{channelLabel}</span>}
    >
      <div className="pp-ph">
        <div className="pp-ph-device">
          <div className="pp-ph-notch" />
          <div className="pp-ph-card">
            <div className="pp-ph-app">
              <span className="pp-ph-dot" />
              Passport
            </div>
            <b className="pp-ph-title">
              {pending.action_type}
            </b>
            <span className="pp-ph-body">{pending.description}</span>
            <div className="pp-ph-actions">
              {interactive ? (
                <button type="button" className="pp-ph-approve" onClick={approveFromCard} disabled={tapped}>
                  {tapped ? 'Approved ✓' : 'Approve'}
                </button>
              ) : (
                <span className="pp-ph-approve">Approve</span>
              )}
              <span className="pp-ph-deny">Deny</span>
            </div>
          </div>
        </div>
        <div className="pp-ph-side">
          {!handle ? (
            <p className="pp-ph-status">Sending the request to your phone…</p>
          ) : tapped ? (
            <p className="pp-ph-status pp-ph-ok">✓ Approved — the agent is continuing now.</p>
          ) : !interactive ? (
            <>
              <p className="pp-ph-status pp-ph-sim">
                Every sensitive action pushes to the owner’s phone for a tap-to-approve.
              </p>
              <p className="pp-ph-hint">Sign in as the Origin owner to approve.</p>
            </>
          ) : sim ? (
            <>
              <p className="pp-ph-status pp-ph-sim">
                Simulated push. Tap <b>Approve</b> on the phone to continue — or wire{' '}
                <code>NTFY_TOPIC</code> (free push) / <code>TWILIO_*</code> for a real ring to <b>{handle.target}</b>.
              </p>
              <p className="pp-ph-hint">Open on your phone or another tab:</p>
              <a className="pp-ph-link" href={link} target="_blank" rel="noreferrer">{link}</a>
            </>
          ) : (
            <>
              <p className="pp-ph-status">
                {channelLabel} sent to <b>{handle.target}</b>
                {handle.approvableFromPhone ? ' — tap Approve on your phone, or here.' : ' — tap Approve here or on the phone above.'}
              </p>
              <a className="pp-ph-link" href={link} target="_blank" rel="noreferrer">{link}</a>
            </>
          )}
        </div>
      </div>
    </Section>
  )
}
