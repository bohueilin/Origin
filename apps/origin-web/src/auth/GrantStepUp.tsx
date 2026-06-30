// Step-up modal shown before a NEW agent grant is created (and before the gate can be turned
// off). It runs a real WebAuthn passkey ceremony — your browser asks 1Password (or the device)
// to verify with Touch ID — so an unlocked, unattended screen can't be used to hand an agent
// fresh authority.
import { useState } from 'react'
import { useDialog } from './useDialog'
import { disableStepUp, enrollStepUp, isWebAuthnAvailable, stepUpLabel, verifyStepUp } from '../credentials/grantStepUp'

export type StepUpMode = 'verify' | 'setup' | 'disable'

const COPY: Record<StepUpMode, { title: string; body: string; cta: string }> = {
  verify: {
    title: 'Confirm with Touch ID',
    body: 'Granting an agent new authority needs your passkey. Your browser will ask 1Password (or this device) to verify it — Touch ID on macOS.',
    cta: 'Verify with passkey',
  },
  setup: {
    title: 'Create your step-up passkey',
    body: 'Enroll a passkey that gates every new agent grant. Save it in 1Password (or this device) so each new grant requires Touch ID — even on an unlocked screen. Origin never sees a secret, only a public key.',
    cta: 'Create passkey',
  },
  disable: {
    title: 'Turn off step-up',
    body: 'Verify with your passkey to stop requiring Touch ID for new grants. Anyone on this session will then be able to add agent authority.',
    cta: 'Verify & turn off',
  },
}

function OnePasswordBadge({ label }: { label: string }) {
  return (
    <span className="cset-stepup-1p" title="Your passkey lives in 1Password (or this device)">
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 1.5A10.5 10.5 0 1 0 22.5 12 10.51 10.51 0 0 0 12 1.5Zm0 15.25a1.25 1.25 0 0 1-1.25-1.25v-2.06a2.75 2.75 0 1 1 2.5 0v2.06A1.25 1.25 0 0 1 12 16.75Z" />
      </svg>
      Passkey · {label}
    </span>
  )
}

export function GrantStepUp({ mode, onPass, onCancel }: { mode: StepUpMode; onPass: () => void; onCancel: () => void }) {
  const ref = useDialog<HTMLDivElement>(onCancel)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const copy = COPY[mode]
  const label = stepUpLabel()
  const supported = isWebAuthnAvailable()

  async function run() {
    setErr('')
    setBusy(true)
    try {
      const r = mode === 'setup' ? await enrollStepUp() : mode === 'disable' ? await disableStepUp() : await verifyStepUp()
      if (r.ok) { onPass(); return }
      setErr(r.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cset-stepup-overlay" role="dialog" aria-modal="true" aria-label={copy.title} onClick={onCancel}>
      <div className="cset-stepup-card" ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <OnePasswordBadge label={label} />
        <h3>{copy.title}</h3>
        <p>{copy.body}</p>

        {!supported && (
          <div className="cset-stepup-err">
            This browser doesn’t support passkeys. Use Chrome or Safari with the 1Password extension installed.
          </div>
        )}
        {err && <div className="cset-stepup-err">{err}</div>}

        <div className="cset-stepup-actions">
          <button type="button" className="cset-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="cset-btn" onClick={run} disabled={busy || !supported}>
            {busy ? 'Waiting for Touch ID…' : copy.cta}
          </button>
        </div>
      </div>
    </div>
  )
}
