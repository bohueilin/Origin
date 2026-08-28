/**
 * Encode an evidence artifact into a /verify link, and read one back.
 *
 * The artifact travels in the URL FRAGMENT, not a query string. Fragments are never sent
 * to the server, so a shared link keeps the same property the page already promises —
 * nothing you paste is uploaded — and it needs no artifact store behind it. A `?id=` link
 * would mean the opposite on both counts.
 *
 * encode and decode are kept together deliberately: they are one codec, and splitting a
 * matched pair across two files is how the two halves drift out of sync.
 */

const B64URL_PAD = /=+$/

/** Artifact -> fragment value. Returns null if the result is too long to be a usable URL. */
export function encodeArtifact(artifact: unknown): string | null {
  const bytes = new TextEncoder().encode(JSON.stringify(artifact))
  let binary = ''
  // A spread into String.fromCharCode blows the stack on large artifacts.
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(B64URL_PAD, '')
  // Browsers and chat clients start truncating well before their hard limits; a link that
  // silently loses its tail would verify as VOID and look like a bug in the verifier.
  return encoded.length > 8000 ? null : encoded
}

/** Fragment value -> artifact. Returns null on anything malformed. */
export function decodeArtifact(fragment: string): unknown | null {
  try {
    const b64 = fragment.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(b64)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

/** The `#a=…` an artifact should be shared as, or null when it will not fit. */
export function shareUrl(artifact: unknown, origin: string): string | null {
  const encoded = encodeArtifact(artifact)
  return encoded === null ? null : `${origin}/verify#a=${encoded}`
}
