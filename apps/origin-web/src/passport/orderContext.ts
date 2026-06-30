// Client seam for the order / place context (delivery address, items, ETA, game-plan time).
// These are real values served from the server config, used to render the order details and
// to compose the Discord share. Never written into the client bundle.

export interface OrderContext {
  deliveryAddress: string
  orderVendor: string
  orderItems: string[]
  orderTotalUsd: number
  orderEta: string
  gamePlan: string
}

const ORDER_CONTEXT_ENABLED = import.meta.env.VITE_PASSPORT_ORDER_CONTEXT === '1'

export async function fetchOrderContext(): Promise<OrderContext | null> {
  if (!ORDER_CONTEXT_ENABLED) return null
  try {
    const r = await fetch('/api/passport/order-context')
    const d = (await r.json()) as { ok?: boolean; context?: OrderContext }
    return d.ok && d.context ? d.context : null
  } catch {
    return null
  }
}
