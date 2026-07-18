// Type surface for examples.mjs — synthetic, SDK-minted /verify examples.

export type ExampleKind = 'reference' | 'sigil' | 'credential' | 'receipt' | 'trace' | 'inclusion' | 'factory'

export const exampleKinds: readonly ExampleKind[]

/** Mint one synthetic example of the given kind (async — the Sigil is signed live via Web Crypto). */
export function makeExample(kind: ExampleKind): Promise<unknown>
