// Session-key policy — the rules an agent's delegated wallet authority must obey.
//
// In production this policy is enforced ON-CHAIN by an ERC-4337 smart-account session
// key (a delegated key scoped to spend caps + allowlisted targets + expiry), so the
// agent literally cannot exceed it even if everything off-chain is compromised. This
// module is the same logic, used (a) as a pre-flight check when a draft is prepared and
// (b) mirrored into the on-chain validator config. It is pure + framework-agnostic so it
// is unit-tested and runs identically in the browser, the edge function, and the signer.
//
// Amounts are decimal strings (e.g. "0.05") in the asset's units; we compare in the
// smallest unit via BigInt to avoid floating-point error.

export interface SessionKeyPolicy {
  status: 'active' | 'revoked'
  agentId: string
  chainId: number
  asset: string                 // e.g. 'ETH', 'USDC'
  decimals: number              // 18 for ETH, 6 for USDC, …
  maxPerTx: string              // decimal string; '' or '0' = no per-tx cap
  maxPerWindow: string          // decimal string; '' or '0' = no window cap
  windowSeconds: number         // rolling window for maxPerWindow
  allowlist: string[]           // destination addresses; ['*'] = any; [] = DENY ALL
  expiresAt: number             // epoch ms
}

export interface TxDraft {
  to: string
  amount: string                // decimal string in `asset` units
  asset: string
  chainId: number
}

export interface PolicyContext {
  now?: number
  priorWindowSpend?: string     // sum of already-approved amounts inside the window
}

export interface PolicyVerdict {
  allowed: boolean
  violations: string[]
}

/** decimal string -> smallest-unit BigInt (e.g. "0.05" @18 -> 50000000000000000n). */
export function toSmallestUnit(amount: string, decimals: number): bigint {
  const s = (amount || '0').trim()
  if (!/^\d*(\.\d*)?$/.test(s)) throw new Error(`invalid amount: ${amount}`)
  const [whole, frac = ''] = s.split('.')
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fracPadded || '0')
}

function norm(addr: string): string {
  return (addr || '').trim().toLowerCase()
}

/** Evaluate a draft against a session-key policy. Fail-closed: any uncertainty denies. */
export function evaluatePolicy(policy: SessionKeyPolicy, draft: TxDraft, ctx: PolicyContext = {}): PolicyVerdict {
  const now = ctx.now ?? Date.now()
  const violations: string[] = []

  if (policy.status !== 'active') violations.push('session key revoked')
  if (now >= policy.expiresAt) violations.push('session key expired')
  if (draft.chainId !== policy.chainId) violations.push(`wrong chain (key is for chain ${policy.chainId})`)
  if (policy.asset && draft.asset && draft.asset.toUpperCase() !== policy.asset.toUpperCase()) violations.push(`asset ${draft.asset} not permitted (key allows ${policy.asset})`)

  // Destination allowlist. Empty allowlist denies everything (secure default); '*' = any.
  const allow = policy.allowlist.map(norm)
  if (!allow.includes('*')) {
    if (allow.length === 0) violations.push('no destinations allowlisted (deny by default)')
    else if (!allow.includes(norm(draft.to))) violations.push('destination not allowlisted')
  }

  // Amount caps (compared in smallest units; fail closed on parse error).
  try {
    const amt = toSmallestUnit(draft.amount, policy.decimals)
    if (amt <= 0n) violations.push('amount must be positive')
    const perTx = policy.maxPerTx && policy.maxPerTx !== '0' ? toSmallestUnit(policy.maxPerTx, policy.decimals) : null
    if (perTx !== null && amt > perTx) violations.push('exceeds per-transaction limit')
    const perWin = policy.maxPerWindow && policy.maxPerWindow !== '0' ? toSmallestUnit(policy.maxPerWindow, policy.decimals) : null
    if (perWin !== null) {
      const prior = ctx.priorWindowSpend ? toSmallestUnit(ctx.priorWindowSpend, policy.decimals) : 0n
      if (prior + amt > perWin) violations.push('exceeds rolling-window spend limit')
    }
  } catch {
    violations.push('unparseable amount (fail closed)')
  }

  return { allowed: violations.length === 0, violations }
}

/** Human-readable one-liner for a policy (for the UI + audit). */
export function describePolicy(p: SessionKeyPolicy): string {
  const cap = p.maxPerTx && p.maxPerTx !== '0' ? `${p.maxPerTx} ${p.asset}/tx` : 'no per-tx cap'
  const win = p.maxPerWindow && p.maxPerWindow !== '0' ? `, ${p.maxPerWindow} ${p.asset} per ${Math.round(p.windowSeconds / 3600)}h` : ''
  const dst = p.allowlist.includes('*') ? 'any address' : `${p.allowlist.length} allowlisted`
  return `${cap}${win} → ${dst}`
}
