// Step-up modal shown before a NEW agent grant is created (and before the gate can be
// turned off). One extra check — a passphrase the owner keeps in 1Password — so that an
// unlocked, unattended screen can't be used to hand an agent fresh authority.
import { useState } from 'react'
import { useDialog } from './useDialog'
import {
  disableStepUp, setupStepUp, stepUpLabel, verifyStepUp, type VerifyResult,
} from '../credentials/grantStepUp'

export type StepUpMode = 'verify' | 'setup' | 'disable'

const COPY: Record<StepUpMode, { title: string; body: string; cta: string }> = {
  verify: {
    title: 'Confirm with 1Password',
    body: 'Granting an agent new authority needs your step-up passphrase. Open 1Password, find your step-up item, and enter it below.',
    cta: 'Authorize grant',
  },
  setup: {
    title: 'Set your step-up passphrase',
    body: 'Choose a passphrase that gates every new agent grant. Save it in 1Password so only you can approve new authority — even if your screen is left unlocked. Origin stores only a one-way hash, never the passphrase.',
    cta: 'Turn on step-up',
  },
  disable: {
    title: 'Turn off step-up',
    body: 'Confirm with your step-up passphrase to stop requiring it for new grants. Anyone on this session will then be able to add agent authority.',
    cta: 'Turn off',
  },
}

function OnePasswordBadge({ label }: { label: string }) {
  return (
    <span className="cset-stepup-1p" title="Keep this passphrase in 1Password">
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 1.5A10.5 10.5 0 1 0 22.5 12 10.51 10.51 0 0 0 12 1.5Zm0 15.25a1.25 1.25 0 0 1-1.25-1.25v-2.06a2.75 2.75 0 1 1 2.5 0v2.06A1.25 1.25 0 0 1 12 16.75Z" />
      </svg>
      1Password · {label}
    </span>
  )
}

export function GrantStepUp({ mode, onPass, onCancel }: { mode: StepUpMode; onPass: () => void; onCancel: () => void }) {
  const ref = useDialog<HTMLFormElement>(onCancel)
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const copy = COPY[mode]
  const label = stepUpLabel()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!p1) { setErr('Enter your step-up passphrase.'); return }
    setBusy(true)
    try {
      if (mode === 'setup') {
        if (p1.length < 6) { setErr('Use at least 6 characters.'); return }
        if (p1 !== p2) { setErr('The two passphrases don’t match.'); return }
        await setupStepUp(p1)
        onPass()
        return
      }
      const r: VerifyResult = mode === 'disable' ? await disableStepUp(p1) : await verifyStepUp(p1)
      if (r.ok) { onPass(); return }
      setErr(
        r.lockedMs > 0
          ? `Too many attempts — locked for ${Math.ceil(r.lockedMs / 1000)}s.`
          : `Incorrect passphrase. ${r.remaining} attempt${r.remaining === 1 ? '' : 's'} left.`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cset-stepup-overlay" role="dialog" aria-modal="true" aria-label={copy.title} onClick={onCancel}>
      <form className="cset-stepup-card" ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <OnePasswordBadge label={label} />
        <h3>{copy.title}</h3>
        <p>{copy.body}</p>

        <label>
          <span>{mode === 'setup' ? 'New step-up passphrase' : 'Step-up passphrase'}</span>
          <input
            type="password" value={p1} onChange={(e) => setP1(e.target.value)}
            autoComplete="off" autoFocus
            placeholder={mode === 'setup' ? 'At least 6 characters' : 'From your 1Password vault'}
          />
        </label>
        {mode === 'setup' && (
          <label>
            <span>Confirm passphrase</span>
            <input type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="off" placeholder="Re-enter to confirm" />
          </label>
        )}

        {err && <div className="cset-stepup-err">{err}</div>}

        <div className="cset-stepup-actions">
          <button type="button" className="cset-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="cset-btn" disabled={busy}>{busy ? 'Working…' : copy.cta}</button>
        </div>
      </form>
    </div>
  )
}
