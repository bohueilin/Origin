// Stub for @1password/sdk on the Cloudflare Workers build. The native 1Password SDK can't run on
// the Workers runtime, so on Workers the credential broker degrades to its mock path (isAvailable()
// is false because no OP_SERVICE_ACCOUNT_TOKEN is provided) — leaseScopedSecret still mints opaque
// handles (crypto only); only useLease() would need the real SDK, and no HTTP route calls it.
// This keeps the bundle free of the native dependency while preserving the broker's handle/lease demo.
export default {
  createClient: async () => {
    throw new Error('1Password SDK is unavailable on the Workers runtime (mock broker only).')
  },
}
