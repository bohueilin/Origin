// Broker selection — prefer the real 1Password broker when the server reports a configured
// service account, otherwise fall back to the in-memory mock (which is always available locally).

import type { SecretBroker } from '../types'
import { MockSecretBroker } from './mockSecretBroker'
import { OnePasswordSecretBroker } from './onePasswordSecretBroker'

export async function pickBroker(now: () => number = Date.now): Promise<SecretBroker> {
  const op = new OnePasswordSecretBroker()
  if (await op.isAvailable()) return op
  return new MockSecretBroker(now)
}
