// Type surface for examples.mjs — synthetic, SDK-minted /verify examples.

export type ExampleKind = 'reference' | 'action-run' | 'sigil' | 'credential' | 'receipt' | 'trace' | 'inclusion' | 'factory'

export const exampleKinds: readonly ExampleKind[]

/**
 * Mint one synthetic example of the given kind (async — the Sigil is signed live via Web Crypto).
 * `issuedAt` (an ISO time) pins the action-run record's issue time; it defaults to now.
 */
export function makeExample(kind: ExampleKind, options?: { issuedAt?: string }): Promise<unknown>
