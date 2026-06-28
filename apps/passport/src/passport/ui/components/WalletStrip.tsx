import { useEffect, useRef, useState } from 'react'
import type { PassportSnapshot } from '../../engine/session'
import { walletConnect, walletQuote, walletAuthorize, walletPurchase } from '../../walletClient'
import type { WalletStatus, WalletQuote, WalletReceipt } from '../../walletClient'
import { Section } from '../bits'
import { money } from '../format'

/**
 * Real Snaplii wallet for any scenario with a payable action (a packet carrying a cost).
 * connect → live quote → and once YOU approve the packet, the approval token is minted and
 * the purchase settles, server-side, exactly once. The browser never holds the key or a code.
 */
export function WalletStrip({ snap, onPaid }: { snap: PassportSnapshot; onPaid?: (r: WalletReceipt) => void }) {
  const paidPkt = snap.approvals.find((a) => a.estimated_cost)
  const [status, setStatus] = useState<WalletStatus | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [quote, setQuote] = useState<WalletQuote | null>(null)
  const [receipt, setReceipt] = useState<WalletReceipt | null>(null)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<{ msg: string; retry: boolean } | null>(null)
  const firedRef = useRef(false) // pay exactly once — never auto-retry on failure
  const triedConnectRef = useRef(false) // auto-connect at most once

  const cost = paidPkt?.estimated_cost ?? null
  const approved = paidPkt ? paidPkt.status === 'approved' || paidPkt.status === 'consumed' : false

  // Auto-connect as soon as there's a payable action, so the quote is primed and an approval
  // settles immediately — no separate "Connect wallet" click needed. The manual button stays
  // as a fallback if this attempt fails.
  useEffect(() => {
    // deps are [paidPkt] only: setConnecting(true) must NOT retrigger this effect (that would
    // cancel the in-flight connect and stick on "Connecting…"). triedConnectRef fires it once.
    if (!paidPkt || triedConnectRef.current) return
    triedConnectRef.current = true
    setConnecting(true)
    void walletConnect().then((s) => {
      setStatus(s)
      setConnecting(false)
    })
  }, [paidPkt])

  // Quote the payable action once the wallet is connected.
  useEffect(() => {
    if (!status?.connected || !cost || quote) return
    let cancel = false
    void (async () => {
      const q = await walletQuote(cost.amount, snap.scenario.id)
      if (!cancel) setQuote(q)
    })()
    return () => {
      cancel = true
    }
  }, [status?.connected, cost, quote, snap.scenario.id])

  // Pay exactly once after YOU approve: authorize (mint one-shot token) → purchase (settle).
  useEffect(() => {
    if (!approved || !quote || receipt || error || firedRef.current) return
    firedRef.current = true
    let cancel = false
    void (async () => {
      setPaying(true)
      const token = await walletAuthorize(quote.quote_claim)
      if (cancel) return
      if (!token) {
        setError({ msg: 'Could not authorize the payment (quote may have expired).', retry: true })
        setPaying(false)
        return
      }
      const r = await walletPurchase(token)
      if (cancel) return
      if (r.ok) {
        setReceipt(r)
        onPaid?.(r)
      } else setError({ msg: r.error || 'Payment failed.', retry: r.code !== 'uncertain' })
      setPaying(false)
    })()
    return () => {
      cancel = true
    }
  }, [approved, quote, receipt, error, onPaid])

  if (!paidPkt) return null

  const connect = async () => {
    setConnecting(true)
    setStatus(await walletConnect())
    setConnecting(false)
  }
  const retry = () => {
    // Fresh quote → fresh approval → fresh nonce (no double-charge). Only offered when safe.
    setError(null)
    setQuote(null)
    firedRef.current = false
  }

  return (
    <Section
      kicker="Real wallet · Snaplii"
      title="Your money — scoped, capped, and yours to approve"
      aside={status?.connected ? <span className={`pp-wallet-badge ${status.live ? 'pp-wallet-live' : ''}`}>{status.live ? 'LIVE' : 'SIMULATION'}</span> : null}
    >
      {!status?.connected ? (
        <div className="pp-wallet-connect">
          <div className="pp-wallet-pitch">
            <b>Connect Snaplii</b>
            <span>Pay from your prepaid Snaplii Cash — scoped key, daily cap, and your approval on every single buy.</span>
          </div>
          <button className="pp-btn pp-btn-primary" onClick={connect} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Connect wallet'}
          </button>
        </div>
      ) : (
        <div className="pp-wallet">
          <div className="pp-wallet-row">
            <span className="pp-wallet-k">Wallet</span>
            <span>Snaplii Cash · {status.scope}{status.brand ? ` · ${status.brand.name} available` : ''}</span>
          </div>
          {quote && (
            <div className="pp-wallet-row">
              <span className="pp-wallet-k">{quote.brand} credit</span>
              <span>
                <b>{money({ amount: quote.amount, currency: quote.currency })}</b>
                {quote.cashback > 0 && <em className="pp-wallet-cash"> + {money({ amount: quote.cashback, currency: quote.currency })} cashback</em>}
              </span>
            </div>
          )}
          {!approved && quote && !receipt && <div className="pp-wallet-await">Waiting for your approval above to release payment — nothing is charged until you approve.</div>}
          {paying && <div className="pp-wallet-await">Authorizing &amp; paying with Snaplii…</div>}
          {error && (
            <div className="pp-wallet-error">
              <span>⚠ {error.msg}</span>
              {error.retry && <button className="pp-btn pp-btn-ghost" onClick={retry}>Try again</button>}
            </div>
          )}
          {receipt && (
            <div className={`pp-wallet-receipt ${receipt.simulated ? 'pp-wallet-sim' : ''}`}>
              <b>{receipt.simulated ? '✓ Simulated — no real charge' : '✓ Paid with Snaplii'}</b>
              <span>{receipt.brand} · {money({ amount: receipt.amount, currency: 'USD' })} · code {receipt.masked_code}</span>
              <span className="pp-wallet-msg">{receipt.message}</span>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}
