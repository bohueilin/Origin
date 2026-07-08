-- Durable one-shot purchase-nonce ledger for the Snaplii payment path.
--
-- Each approved Janus purchase mints a single-use nonce bound to {amount,item,intent,mode}.
-- Recording the nonce here behind a UNIQUE index makes one-shot replay protection survive a server
-- restart and hold across multiple instances: a second /purchase carrying the same nonce hits the
-- unique violation (SQLSTATE 23505) and is refused as a replay — even after the in-process Set is
-- gone. The in-process Set remains the fast path; this table is the durable source of truth.
--
-- Server-admin only: RLS is enabled with NO policies for anon/authenticated and direct privileges
-- revoked, so the table is reachable ONLY by the standalone server's admin credentials (which bypass
-- RLS). No backfill, no table rewrite — a single focused invariant. Mirrors the eval_episodes
-- idempotency boundary (migration 20260620080000).

-- 1. The ledger table (id / created_at are InsForge-managed; the server never inserts them).
CREATE TABLE IF NOT EXISTS public.passport_purchase_nonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  nonce text NOT NULL CHECK (length(nonce) > 0),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  live boolean NOT NULL DEFAULT false
);

-- 2. Storage boundary: exactly one row per consumed nonce (first-consume-wins).
CREATE UNIQUE INDEX IF NOT EXISTS passport_purchase_nonces_nonce_uidx
  ON public.passport_purchase_nonces (nonce);

-- 3. Lock it to the server's admin role only — no client role may read or write.
ALTER TABLE public.passport_purchase_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.passport_purchase_nonces FROM anon, authenticated;

COMMENT ON TABLE public.passport_purchase_nonces IS
  'Durable one-shot ledger: one row per consumed Snaplii purchase nonce (replay protection across restart/instances). Written/read ONLY by the standalone server with admin credentials; RLS on, anon/authenticated have no policies and no direct privileges.';
