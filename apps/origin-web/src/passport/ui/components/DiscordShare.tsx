import { useEffect, useRef, useState } from 'react'
import type { PassportSnapshot } from '../../engine/session'
import type { OrderContext } from '../../orderContext'
import { sendDiscordMessage } from '../../discordClient'
import type { DiscordSendResult } from '../../discordClient'
import { Section } from '../bits'

/**
 * The real Discord group message. Shows the exact message it will post (server-composed), and
 * once YOU approve the "Message your Game Night" packet, fires it to the webhook exactly once.
 */
export function DiscordShare({
  snap,
  ctx,
  onSent,
}: {
  snap: PassportSnapshot
  ctx: OrderContext | null
  onSent?: (r: DiscordSendResult) => void
}) {
  const pkt = snap.approvals.find((a) => a.capability === 'social.post.commit')
  const approved = pkt ? pkt.status === 'approved' || pkt.status === 'consumed' : false
  const [result, setResult] = useState<DiscordSendResult | null>(null)
  const firedRef = useRef(false)

  useEffect(() => {
    if (!approved || result || firedRef.current) return
    firedRef.current = true
    let cancel = false
    void (async () => {
      const r = await sendDiscordMessage({ time: ctx?.gamePlan, place: ctx?.deliveryAddress })
      if (cancel) return
      setResult(r)
      onSent?.(r)
    })()
    return () => {
      cancel = true
    }
  }, [approved, result, ctx, onSent])

  if (!pkt) return null

  const preview =
    result?.preview ??
    `🎮 FIFA catch-up night — ${ctx?.gamePlan ?? 'this week'} at ${ctx?.deliveryAddress ?? 'home'}. Food's handled (DoorDash, arriving ~${ctx?.orderEta ?? '7:00 PM'}). Spoiler-free zone — come thru! 🌯⚽`

  return (
    <Section
      kicker="Invite · Discord"
      title="Rally your Game Night"
      aside={
        <span className={`pp-dc-badge ${result ? (result.simulated ? 'pp-dc-sim' : 'pp-dc-on') : ''}`}>
          {result ? (result.simulated ? 'Simulated' : 'Sent ✓') : 'Game Night'}
        </span>
      }
    >
      <div className="pp-dc">
        <div className="pp-dc-msg">
          <div className="pp-dc-from">
            <span className="pp-dc-avatar" aria-hidden="true">
              SQ
            </span>
            <b>Passport · Concierge</b>
            <span className="pp-dc-chan">#game-night</span>
          </div>
          <p className="pp-dc-text">{preview}</p>
        </div>
        {!result ? (
          approved ? (
            <p className="pp-dc-status">Posting to Discord…</p>
          ) : (
            <p className="pp-dc-status pp-dc-wait">Approve “Message your Game Night” above to post this.</p>
          )
        ) : result.simulated ? (
          <p className="pp-dc-status pp-dc-simtx">
            Simulated — set <code>DISCORD_WEBHOOK_URL</code> to post this to your real server.
          </p>
        ) : result.ok ? (
          <p className="pp-dc-status pp-dc-oktx">✓ Posted to your Discord — your homies can join.</p>
        ) : (
          <p className="pp-dc-status pp-dc-errtx">⚠ {result.error ?? 'Could not post to Discord.'}</p>
        )}
      </div>
    </Section>
  )
}
