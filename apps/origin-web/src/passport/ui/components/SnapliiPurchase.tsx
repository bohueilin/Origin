import { useEffect, useRef, useState } from 'react'
import type { PassportSnapshot } from '../../engine/session'
import { Section } from '../bits'
import {
  snapliiConnect,
  snapliiRunClaim,
  snapliiQuote,
  snapliiAuthorize,
  snapliiPurchase,
} from '../../../credentials/store'
import type {
  SnapliiConnectResult,
  SnapliiPurchaseResult,
} from '../../../credentials/store'

// The agent-driven, broker-mediated, capped buy. The agent prepared ONE specific $15 DoorDash
// gift card; Passport gated it on YOUR approval. On approve (owner only) we run the REAL deployed
// snaplii-broker four-step flow — quote → authorize (the human-approval moment) → purchase — then
// resolve the engine approval so the run completes. SIMULATION by default; real on SNAPLII_LIVE=1.

const INTENT = 'passport-treat-the-team'

type Phase = 'idle' | 'buying' | 'done' | 'error'

/** Fail-closed copy for every broker error code. We never render a fake success. */
function failCopy(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'over_cap':
      return 'Refused — over the broker’s server-side cap ($25/buy, $50/day). Nothing was charged.'
    case 'insecure_secret':
      return 'Refused — the broker could not resolve a secure key. Fail-closed: nothing was charged.'
    case 'replayed':
      return 'Refused — that one-shot approval was already used. The broker enforces single-use; nothing was charged again.'
    case 'uncertain':
      return 'Unknown outcome — the broker could not confirm the charge, so we fail closed. Check before retrying.'
    case 'mode_mismatch':
      return 'Refused — live/simulation mode mismatch between authorize and purchase. Nothing was charged.'
    case 'no_token':
    case 'bad_token':
      return 'Refused — the approval token was missing or invalid. Nothing was charged.'
    case 'bad_quote':
      return 'Refused — the price quote was invalid or expired. Nothing was charged.'
    case 'no_key':
      return 'The Snaplii key is not configured on the server. Nothing was charged.'
    case 'upstream':
      return 'The Snaplii service was unreachable. Fail-closed: nothing was charged.'
    case 'bad_request':
      return 'Refused — the purchase request was malformed. Nothing was charged.'
    default:
      return fallback
  }
}

export function SnapliiPurchase({
  snap,
  canRun,
  onApproved,
}: {
  snap: PassportSnapshot
  canRun: boolean
  onApproved: (approvalId: string) => void
}) {
  // The pending (or just-resolved) snaplii.purchase packet for the $15 buy.
  const pkt = snap.approvals.find((a) => a.capability === 'snaplii.purchase')

  const [conn, setConn] = useState<SnapliiConnectResult | null>(null)
  const [connErr, setConnErr] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [receipt, setReceipt] = useState<SnapliiPurchaseResult | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const probedRef = useRef(false)

  const amount = pkt?.estimated_cost?.amount ?? 15
  const resolved = pkt ? pkt.status === 'approved' || pkt.status === 'consumed' : false

  // On first appearance, probe the broker once to surface mode (SIMULATION/LIVE) + brand + caps.
  // View-only visitors never call the broker.
  useEffect(() => {
    if (!pkt || probedRef.current || !canRun) return
    probedRef.current = true
    let cancel = false
    void (async () => {
      try {
        const c = await snapliiConnect()
        if (!cancel) setConn(c)
      } catch {
        if (!cancel) setConnErr(true)
      }
    })()
    return () => {
      cancel = true
    }
  }, [pkt, canRun])

  if (!pkt) return null

  const live = conn?.live === true
  const brandName = conn?.brand?.name ?? 'DoorDash'

  // Owner approves → run the REAL four-step broker flow, then resolve the engine approval.
  async function approveAndBuy() {
    if (!canRun || !pkt || phase === 'buying' || phase === 'done' || resolved) return
    setPhase('buying')
    setErrMsg(null)
    try {
      // Server-mint a Passport run claim first (binds owner+amount+intent). quote requires it,
      // so a purchase can't be driven out-of-band of this approved Passport flow.
      const rc = await snapliiRunClaim(amount, INTENT)
      if (!rc.ok) {
        setErrMsg(rc.error ?? 'Could not start the purchase (run claim refused).')
        setPhase('error')
        return
      }
      // rc.run_claim may be undefined when minting degraded (function not deployed) — the
      // broker then quotes without it. A real denial (401/403) already returned ok:false above.
      const quote = await snapliiQuote(amount, INTENT, rc.run_claim)
      if (!quote.ok || !quote.quote_claim) {
        setErrMsg(failCopy(quote.code, quote.error ?? 'Could not price the purchase.'))
        setPhase('error')
        return
      }
      const auth = await snapliiAuthorize(quote.quote_claim)
      if (!auth.ok || !auth.approval_token) {
        setErrMsg(failCopy(auth.code, auth.error ?? 'Could not authorize the purchase.'))
        setPhase('error')
        return
      }
      const result = await snapliiPurchase(auth.approval_token)
      if (!result.ok) {
        setErrMsg(failCopy(result.code, result.error ?? 'The purchase did not complete.'))
        setPhase('error')
        return
      }
      setReceipt(result)
      setPhase('done')
      // Resolve the engine approval so the run completes — the agent collab / plan / audit
      // all reflect the approved, brokered buy.
      onApproved(pkt.approval_id)
    } catch (e) {
      setErrMsg((e as Error)?.message || 'The Snaplii broker was unreachable. Nothing was charged.')
      setPhase('error')
    }
  }

  const modePill = connErr ? (
    <span className="pp-sn-pill pp-sn-pill-warn">Broker unreachable</span>
  ) : conn ? (
    <span className={`pp-sn-pill ${live ? 'pp-sn-pill-live' : 'pp-sn-pill-sim'}`}>
      {live ? 'LIVE — real spend' : 'SIMULATION'}
    </span>
  ) : (
    <span className="pp-sn-pill pp-sn-pill-idle">Connecting…</span>
  )

  const busy = phase === 'buying'

  return (
    <Section
      kicker="Brokered purchase · Snaplii"
      title="A capped buy the agent prepared — yours to approve"
      aside={modePill}
    >
      <div className="pp-sn">
        {/* The narrative spine: forbidden vs. brokered. */}
        <div className="pp-sn-spine">
          <div className="pp-sn-deny">
            <span className="pp-sn-x" aria-hidden="true">✕</span>
            <div>
              <b>Free spending is denied.</b>
              <span>
                <code className="pp-sn-cap">payment.spend</code> is on the agent’s permanent deny list — it can
                never move your money.
              </span>
            </div>
          </div>
          <div className="pp-sn-allow">
            <span className="pp-sn-check" aria-hidden="true">⏯</span>
            <div>
              <b>One capped buy is brokered.</b>
              <span>
                <code className="pp-sn-cap">snaplii.purchase</code> — a single, capped, one-shot charge through the
                broker, unlocked only by your approval.
              </span>
            </div>
          </div>
        </div>

        {/* The prepared purchase. */}
        <div className="pp-sn-card">
          <div className="pp-sn-brand">
            <span className="pp-sn-logo" aria-hidden="true">{brandName.slice(0, 2).toUpperCase()}</span>
            <div className="pp-sn-brand-meta">
              <b>{brandName} gift card</b>
              <span className="pp-sn-caps">Capped · $25/buy · $50/day · one-shot</span>
            </div>
            <span className="pp-sn-amt mono">${amount.toFixed(2)}</span>
          </div>
          <p className="pp-sn-prep">
            The agent prepared a <b>${amount.toFixed(2)} {brandName} gift card</b> via Snaplii. The agent holds no
            card — <b>Passport brokers it</b>.
          </p>

          {/* States ----------------------------------------------------------- */}
          {!canRun ? (
            <div className="pp-sn-foot">
              <button className="pp-btn pp-btn-approve pp-sn-buy" disabled aria-disabled>
                Approve &amp; buy ${amount.toFixed(0)}
              </button>
              <p className="pp-sn-readonly">🔒 Sign in as the owner to authorize this charge.</p>
            </div>
          ) : phase === 'done' && receipt ? (
            <Receipt receipt={receipt} brand={brandName} />
          ) : phase === 'error' ? (
            <div className="pp-sn-foot">
              <p className="pp-sn-err">⚠ {errMsg}</p>
              <button className="pp-btn pp-btn-deny pp-sn-retry" onClick={() => setPhase('idle')}>
                ← Back
              </button>
            </div>
          ) : resolved ? (
            <p className="pp-sn-already">✓ Approved — the brokered purchase is recorded in the run.</p>
          ) : (
            <div className="pp-sn-foot">
              <button
                className="pp-btn pp-btn-approve pp-sn-buy"
                onClick={approveAndBuy}
                disabled={busy}
                aria-disabled={busy}
              >
                {busy ? 'Brokering the charge…' : `Approve & buy $${amount.toFixed(0)}`}
              </button>
              <p className="pp-sn-gate">
                This is the deliberate human-approval moment. The agent can’t reach the broker on its own.
              </p>
            </div>
          )}
        </div>
      </div>
    </Section>
  )
}

function Receipt({ receipt, brand }: { receipt: SnapliiPurchaseResult; brand: string }) {
  const sim = receipt.simulated !== false
  const amt = receipt.amount ?? 15
  const cur = receipt.currency ?? 'USD'
  return (
    <div className="pp-sn-receipt">
      <div className="pp-sn-receipt-head">
        <span className="pp-sn-receipt-ok">✓ Purchase complete</span>
        <span className={`pp-sn-pill ${sim ? 'pp-sn-pill-sim' : 'pp-sn-pill-live'}`}>
          {sim ? 'SIMULATED — no real money' : 'REAL SPEND'}
        </span>
      </div>
      <dl className="pp-sn-receipt-grid">
        <Row k="Brand" v={receipt.brand ?? brand} />
        <Row k="Amount" v={`$${amt.toFixed(2)} ${cur}`} mono />
        {receipt.masked_code && <Row k="Redemption code" v={receipt.masked_code} mono />}
      </dl>
      {receipt.message && <p className="pp-sn-receipt-msg">{receipt.message}</p>}
    </div>
  )
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="pp-sn-row">
      <dt className="pp-mini-label">{k}</dt>
      <dd className={`pp-sn-row-v ${mono ? 'mono' : ''}`}>{v}</dd>
    </div>
  )
}
