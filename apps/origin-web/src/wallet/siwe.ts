// Client side of SIWE wallet linking. Talks to the user's own injected wallet
// (EIP-1193, e.g. MetaMask) to prove address ownership — Origin never sees a key.
// Flow: request account -> server issues nonce -> user signs the SIWE message in their
// wallet -> server verifies the signature and records a VERIFIED wallet.
import { createSiweMessage } from 'viem/siwe'
import { insforge } from '../insforge'

// Minimal EIP-1193 surface we use. We never request anything beyond accounts + a
// personal_sign of our own message; no transaction is ever requested here.
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}
function getProvider(): Eip1193Provider | null {
  const w = window as unknown as { ethereum?: Eip1193Provider }
  return w.ethereum ?? null
}

function utf8ToHex(s: string): `0x${string}` {
  const bytes = new TextEncoder().encode(s)
  let hex = '0x'
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex as `0x${string}`
}

export interface SiweResult { ok: boolean; address?: string; error?: string }

export function hasInjectedWallet(): boolean {
  return getProvider() !== null
}

export async function linkWalletWithSiwe(): Promise<SiweResult> {
  if (!insforge) return { ok: false, error: 'Sign in to link a wallet.' }
  const provider = getProvider()
  if (!provider) return { ok: false, error: 'No Ethereum wallet detected. Install MetaMask or another EIP-1193 wallet, then try again.' }

  try {
    const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
    const address = accounts?.[0]
    if (!address) return { ok: false, error: 'No account authorized.' }
    const chainHex = (await provider.request({ method: 'eth_chainId' })) as string
    const chainId = Number.parseInt(chainHex, 16) || 1

    // 1. server-issued nonce bound to our origin
    const { data: ch, error: chErr } = await insforge.functions.invoke('wallet-link-challenge', { body: { address, chainId } })
    if (chErr || !ch?.nonce) return { ok: false, error: 'Could not start linking. Try again.' }

    // 2. build the canonical SIWE message and sign it in the user's wallet
    const message = createSiweMessage({
      domain: ch.domain,
      address: address as `0x${string}`,
      statement: ch.statement,
      uri: ch.uri,
      version: '1',
      chainId,
      nonce: ch.nonce,
      issuedAt: new Date(),
    })
    const signature = (await provider.request({ method: 'personal_sign', params: [utf8ToHex(message), address] })) as string

    // 3. server verifies and records the verified wallet
    const { data: res, error: vErr } = await insforge.functions.invoke('wallet-link-verify', { body: { message, signature } })
    if (vErr || !res?.ok) return { ok: false, error: res?.error || 'Signature verification failed.' }
    return { ok: true, address: res.address }
  } catch (e) {
    // User rejection or wallet error — fail closed, surface a readable message.
    const msg = (e as { message?: string })?.message || 'Wallet request was rejected.'
    return { ok: false, error: msg.includes('rejected') ? 'You declined the signature.' : msg }
  }
}
