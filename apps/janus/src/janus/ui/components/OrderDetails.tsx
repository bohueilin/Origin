import type { JanusSnapshot } from '../../engine/session'
import type { OrderContext } from '../../orderContext'
import { Section } from '../bits'

/**
 * The DoorDash order, made legible: exactly what is ordered and where it goes. DoorDash has
 * no public consumer API, so the food order itself is prepared (not placed through DoorDash);
 * the payment, however, is a real Snaplii gift-card purchase at the approval gate.
 */
export function OrderDetails({ snap, ctx }: { snap: JanusSnapshot; ctx: OrderContext | null }) {
  const pkt = snap.approvals.find((a) => a.capability === 'delivery.order.submit')
  if (!pkt || !ctx) return null
  const placed = pkt.status === 'approved' || pkt.status === 'consumed'
  const denied = pkt.status === 'denied' || pkt.status === 'expired'

  return (
    <Section
      kicker="Your order · DoorDash"
      title={ctx.orderVendor}
      aside={
        <span className={`pp-ord-state ${placed ? 'pp-ord-on' : denied ? 'pp-ord-off' : ''}`}>
          {placed ? `Ordered · ETA ${ctx.orderEta}` : denied ? 'Not ordered' : 'Awaiting your OK'}
        </span>
      }
    >
      <div className="pp-ord">
        <ul className="pp-ord-items">
          {ctx.orderItems.map((it) => (
            <li key={it}>
              <span className="pp-ord-check" aria-hidden="true">
                {placed ? '✓' : '•'}
              </span>
              {it}
            </li>
          ))}
        </ul>
        <div className="pp-ord-meta">
          <div className="pp-ord-row">
            <span className="pp-ord-k">Deliver to</span>
            <span className="pp-ord-v">{ctx.deliveryAddress}</span>
          </div>
          <div className="pp-ord-row">
            <span className="pp-ord-k">When</span>
            <span className="pp-ord-v">{ctx.gamePlan} · food ~{ctx.orderEta}</span>
          </div>
          <div className="pp-ord-row">
            <span className="pp-ord-k">Total</span>
            <span className="pp-ord-v">
              <b>${ctx.orderTotalUsd.toFixed(2)}</b> · paid via Snaplii Cash below
            </span>
          </div>
        </div>
      </div>
      <p className="pp-ord-note">
        DoorDash has no public ordering API, so the food order is prepared from your usual — the{' '}
        <b>payment is a real Snaplii gift-card purchase</b> at the approval gate.
      </p>
    </Section>
  )
}
