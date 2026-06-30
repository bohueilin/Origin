// Optional step-up before granting NEW agent authority. Defends the unattended-but-
// unlocked session: even with the page already open, adding a grant — or turning this
// gate off — requires a passphrase the owner keeps in their 1Password vault. It is a
// second factor on the single most dangerous action (handing an agent new authority),
// layered on top of the owner-only sign-in.
//
// Client-side by design: a deterrent for casual physical access, not a server ACL. The
// stored value is a PBKDF2 hash (never the passphrase), so reading localStorage doesn't
// reveal it; and because the app is owner-only, clearing storage to wipe this config also
// drops the session — and the attacker can't sign back in. The real secret lives in
// 1Password; Origin only ever holds a one-way hash to compare against.

const KEY = 'origin.grantStepUp.v1'
const MAX_FAILS = 5
const LOCK_MS = 60_000
const ITERATIONS = 120_000
export const DEFAULT_LABEL = 'Origin · grant step-up'

export interface StepUpState {
  enabled: boolean
  salt: string // base64
  hash: string // base64 PBKDF2-derived bits
  label: string // the 1Password item name the owner stores the passphrase under
  fails: number
  lockUntil: number // epoch ms; 0 when not locked
}

export type VerifyResult = { ok: true } | { ok: false; lockedMs: number; remaining: number }

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

const toB64 = (buf: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(buf)))
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}

async function derive(passphrase: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder()
  const material = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    256,
  )
  return toB64(bits)
}

// Constant-time-ish compare so a wrong passphrase can't be timed character-by-character.
function constantEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

/** A passphrase has been set (whether the gate is currently on or off). */
export function isStepUpConfigured(): boolean {
  const s = read()
  return Boolean(s && s.hash)
}

/** The gate is configured AND active — new grants must pass it. */
export function isStepUpRequired(): boolean {
  const s = read()
  return Boolean(s && s.enabled && s.hash)
}

export function stepUpLabel(): string {
  return read()?.label || DEFAULT_LABEL
}

export function lockRemainingMs(): number {
  const s = read()
  if (!s) return 0
  return Math.max(0, s.lockUntil - Date.now())
}

/** Set (or replace) the passphrase and switch the gate on. */
export async function setupStepUp(passphrase: string, label?: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(passphrase, salt)
  write({ enabled: true, salt: toB64(toArrayBuffer(salt)), hash, label: label?.trim() || DEFAULT_LABEL, fails: 0, lockUntil: 0 })
}

/** Verify a passphrase. Tracks failures and locks for a cool-down after too many. */
export async function verifyStepUp(passphrase: string): Promise<VerifyResult> {
  const s = read()
  if (!s || !s.hash) return { ok: true } // nothing configured → no gate to pass
  const now = Date.now()
  if (s.lockUntil > now) return { ok: false, lockedMs: s.lockUntil - now, remaining: 0 }

  const hash = await derive(passphrase, fromB64(s.salt))
  if (constantEquals(hash, s.hash)) {
    write({ ...s, fails: 0, lockUntil: 0 })
    return { ok: true }
  }
  const fails = s.fails + 1
  const lock = fails >= MAX_FAILS
  write({ ...s, fails: lock ? 0 : fails, lockUntil: lock ? now + LOCK_MS : 0 })
  return { ok: false, lockedMs: lock ? LOCK_MS : 0, remaining: Math.max(0, MAX_FAILS - fails) }
}

/** Turn the gate ON for an already-configured passphrase (no secret needed to add protection). */
export function enableStepUp(): void {
  const s = read()
  if (s && s.hash) write({ ...s, enabled: true })
}

/** Turn the gate OFF — requires the passphrase, so an intruder can't simply disable it. */
export async function disableStepUp(passphrase: string): Promise<VerifyResult> {
  const r = await verifyStepUp(passphrase)
  if (r.ok) {
    const s = read()
    if (s) write({ ...s, enabled: false }) // keep the secret so re-enabling needs no re-setup
  }
  return r
}
