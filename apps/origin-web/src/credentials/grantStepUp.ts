// Optional step-up before granting NEW agent authority, backed by a real WebAuthn passkey.
// Defends the unattended-but-unlocked session: adding a grant — or turning this gate off —
// requires a fresh biometric assertion (Touch ID on macOS) from a passkey the owner enrolled
// in 1Password (or the device). It is a second factor on the single most dangerous action
// (handing an agent new authority), layered on top of the owner-only sign-in.
//
// How "1Password" is actually involved: the passkey created here is stored by whatever passkey
// provider the user has set in Chrome — 1Password, when its extension is the provider. The
// browser shows a native prompt and 1Password unlocks it with Touch ID. Origin never sees a
// secret; it only keeps the credential ID so it can ask for that specific passkey later.
//
// Client-first by design: a successful, user-verified ceremony is required before the gate
// passes. For a hardened, server-enforced control the assertion would also be verified against
// a server-issued challenge + the stored public key (an InsForge function) — a follow-up. For
// the stated threat (a walk-up on an unlocked screen) the biometric ceremony already blocks it:
// the intruder cannot satisfy the owner's Touch ID / 1Password.

const KEY = 'origin.grantStepUp.v2'
const DEFAULT_LABEL = 'Origin · grant step-up'

export interface StepUpState {
  enabled: boolean
  credentialId: string // base64url of the passkey credential id
  label: string // the 1Password / passkey item name shown to the user
  createdAt: number
}

export type StepUpResult = { ok: true } | { ok: false; error: string }

function read(): StepUpState | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as StepUpState) : null
  } catch {
    return null
  }
}

function write(s: StepUpState | null): void {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage blocked — gate simply won't persist */
  }
}

function bufToB64url(buf: ArrayBuffer): string {
  let s = ''
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// WebAuthn wants BufferSource backed by a real ArrayBuffer (not the ArrayBufferLike union TS
// infers for typed arrays), so copy into a fresh ArrayBuffer for every credential field.
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}
function randomBuffer(n: number): ArrayBuffer {
  return toArrayBuffer(crypto.getRandomValues(new Uint8Array(n)))
}

// rpId must equal (or be a registrable parent of) the page's host. The full hostname always
// satisfies that — origin-physical-ai.pages.dev for prod, localhost for dev (both secure ctx).
function rpId(): string {
  try { return window.location.hostname } catch { return 'localhost' }
}

function friendly(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError') return 'Touch ID was cancelled or timed out. Try again.'
  if (name === 'InvalidStateError') return 'A passkey for Origin is already registered on this device.'
  if (name === 'SecurityError') return 'Passkeys need a secure context (https or localhost).'
  return (e as { message?: string })?.message || 'Could not complete the passkey check.'
}

export function isWebAuthnAvailable(): boolean {
  return typeof window !== 'undefined'
    && typeof window.PublicKeyCredential !== 'undefined'
    && typeof navigator !== 'undefined'
    && !!navigator.credentials?.create
}

/** A passkey has been enrolled (whether the gate is currently on or off). */
export function isStepUpConfigured(): boolean {
  const s = read()
  return Boolean(s && s.credentialId)
}

/** The gate is enrolled AND active — new grants must pass a passkey check. */
export function isStepUpRequired(): boolean {
  const s = read()
  return Boolean(s && s.enabled && s.credentialId)
}

export function stepUpLabel(): string {
  return read()?.label || DEFAULT_LABEL
}

/** Enroll a passkey (Touch ID prompt) and switch the gate on. */
export async function enrollStepUp(label?: string): Promise<StepUpResult> {
  if (!isWebAuthnAvailable()) return { ok: false, error: 'This browser does not support passkeys.' }
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Origin', id: rpId() },
        user: { id: randomBuffer(16), name: 'origin-owner', displayName: 'Origin owner' },
        challenge: randomBuffer(32),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
        timeout: 60_000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null
    if (!cred) return { ok: false, error: 'Passkey creation was cancelled.' }
    const credentialId = cred.id || bufToB64url(cred.rawId)
    write({ enabled: true, credentialId, label: label?.trim() || DEFAULT_LABEL, createdAt: Date.now() })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: friendly(e) }
  }
}

/** Require a fresh, user-verified passkey assertion (Touch ID prompt). */
export async function verifyStepUp(): Promise<StepUpResult> {
  const s = read()
  if (!s || !s.credentialId) return { ok: true } // nothing enrolled → no gate to pass
  if (!isWebAuthnAvailable()) return { ok: false, error: 'This browser does not support passkeys.' }
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBuffer(32),
        rpId: rpId(),
        allowCredentials: [{ type: 'public-key', id: toArrayBuffer(b64urlToBytes(s.credentialId)) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return assertion ? { ok: true } : { ok: false, error: 'Verification was cancelled.' }
  } catch (e) {
    return { ok: false, error: friendly(e) }
  }
}

/** Turn the gate ON for an already-enrolled passkey (adding protection is never gated). */
export function enableStepUp(): void {
  const s = read()
  if (s && s.credentialId) write({ ...s, enabled: true })
}

/** Turn the gate OFF — requires a passkey check, so an intruder can't simply disable it. */
export async function disableStepUp(): Promise<StepUpResult> {
  const r = await verifyStepUp()
  if (r.ok) {
    const s = read()
    if (s) write({ ...s, enabled: false }) // keep the credential so re-enabling needs no re-enroll
  }
  return r
}
