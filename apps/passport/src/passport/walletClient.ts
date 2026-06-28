// Client seam to the Snaplii wallet. All real-money logic lives on the server
// (key + caps + reserve + one-shot token + masking). The browser only asks our own
// /api/passport/wallet/* routes; it never sees the Snaplii key or raw codes.
//
// Flow: connect → quote (price + a NON-spendable claim) → authorize (your approval
// mints the one-shot token) → purchase (settles). One attempt; never auto-retries.

import { api } from './apiBase.ts'

export interface WalletStatus {
  connected: boolean
  scope: string
  live: boolean
  brand: { id: string; name: string } | null
  note?: string
}
export interface WalletQuote {
  amount: number
  currency: string
  cashback: number
  brand: string
  quote_claim: string
}
export interface WalletReceipt {
  ok: boolean
  simulated: boolean
  amount: number
  brand: string
  masked_code: string
  message: string
  error?: string
  code?: string
}

export async function walletConnect(): Promise<WalletStatus | null> {
  try {
    const r = await fetch(api('/api/passport/wallet/connect'), { method: 'POST' })
    const d = (await r.json()) as WalletStatus & { ok?: boolean }
    return d.ok ? d : null
  } catch {
    return null
  }
}

export async function walletQuote(amount: number, intent: string): Promise<WalletQuote | null> {
  try {
    const r = await fetch(api('/api/passport/wallet/quote'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount, intent }),
    })
    const d = (await r.json()) as WalletQuote & { ok?: boolean }
    return d.ok && d.quote_claim ? d : null
  } catch {
    return null
  }
}

/** The approval step: exchange a quote for a one-shot purchase token (only after the user approves). */
export async function walletAuthorize(quote_claim: string): Promise<string | null> {
  try {
    const r = await fetch(api('/api/passport/wallet/authorize'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quote_claim }),
    })
    const d = (await r.json()) as { ok?: boolean; approval_token?: string }
    return d.ok && d.approval_token ? d.approval_token : null
  } catch {
    return null
  }
}

export async function walletPurchase(approval_token: string): Promise<WalletReceipt> {
  try {
    const r = await fetch(api('/api/passport/wallet/purchase'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approval_token }),
    })
    return (await r.json()) as WalletReceipt
  } catch {
    return { ok: false, simulated: false, amount: 0, brand: 'DoorDash', masked_code: '', message: '', error: 'Network error reaching the wallet.', code: 'network' }
  }
}
