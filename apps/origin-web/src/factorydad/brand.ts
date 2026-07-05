// Product brand — centralized so the name is a one-line swap.
// Internal benchmark id stays factorydad-1-v2 (Python/HUD); the UI shows the
// brand + a short version tag.

export const PRODUCT_NAME = 'Origin'
// Full brand for prominent lockups (hero, meta, legal entity). Use PRODUCT_NAME inline.
export const PRODUCT_FULL = 'Origin Physical AI'
export const PRODUCT_TAGLINE = 'The autonomy layer between work orders and robot action'
export const PRODUCT_INITIALS = 'OR'
export const PRODUCT_STRAPLINE = 'Observe · Plan · Act · Verify'

// "factorydad-1-v2" -> "v2" for a quiet technical tag in the UI.
export function versionTag(v: string): string {
  return v.replace(/^factorydad-1-/, '')
}
