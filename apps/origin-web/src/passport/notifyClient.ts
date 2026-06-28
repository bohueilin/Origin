// Client seam for approval-to-phone. The browser asks our own /api/passport/notify/*
// routes to send a real push/SMS and then polls whether the phone tapped Approve. All
// channel secrets (ntfy topic, Twilio creds) stay server-side.

export interface PhoneApprovalHandle {
  id: string
  channel: 'push' | 'sms' | 'push+sms' | 'simulation'
  target: string
  pushed: boolean
  approvableFromPhone: boolean
}

// Deep link a phone (or another tab on this device) can open to land directly on the approval.
// App.tsx reads `?approve=<id>` and resolves the matching pending packet in the live session.
export function phoneApprovalLink(approvalId: string): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}/passport?approve=${encodeURIComponent(approvalId)}`
}

export async function requestPhoneApproval(input: { approvalId: string; title: string; summary: string; amount?: number | null }): Promise<PhoneApprovalHandle> {
  // Fail-soft to a clearly-labeled on-device simulation: when no real channel is wired
  // (e.g. the static deploy has no /api/passport/notify route), the approval card must NOT
  // hang on "sending…" — it falls back to an on-screen tap that advances the run, so the
  // agent never stalls waiting on a notification that can't arrive.
  const simulation: PhoneApprovalHandle = {
    id: `sim-${input.approvalId}`,
    channel: 'simulation',
    target: 'your phone',
    pushed: false,
    approvableFromPhone: false,
  }
  try {
    const r = await fetch('/api/passport/notify/approval', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!r.ok) return simulation
    const ct = r.headers.get('content-type') ?? ''
    if (!ct.includes('application/json')) return simulation // SPA fallback served HTML — no real route
    const d = (await r.json()) as {
      ok?: boolean
      id?: string
      channel?: PhoneApprovalHandle['channel']
      target?: string
      pushed?: boolean
      approvable_from_phone?: boolean
    }
    if (!d.ok || !d.id) return simulation
    return {
      id: d.id,
      channel: d.channel ?? 'simulation',
      target: d.target ?? 'your phone',
      pushed: Boolean(d.pushed),
      approvableFromPhone: Boolean(d.approvable_from_phone),
    }
  } catch {
    return simulation
  }
}

export type PhoneStatus = 'pending' | 'approved' | 'denied' | 'expired'

export async function pollPhoneStatus(id: string): Promise<PhoneStatus> {
  try {
    const r = await fetch(`/api/passport/notify/status?id=${encodeURIComponent(id)}`)
    const d = (await r.json()) as { status?: PhoneStatus }
    return d.status ?? 'expired'
  } catch {
    return 'pending' // transient network blip — keep polling rather than give up
  }
}
