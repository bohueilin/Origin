-- Make `eval_episodes` migration-managed and RLS-hardened.
--
-- Before this migration the audit table was created out-of-band (dashboard / CLI)
-- and protected only by the InsForge service key. This migration brings the
-- schema under version control AND enables Row-Level Security so the table is not
-- reachable by runtime client roles (`anon`, `authenticated`) at all — evidence
-- is written and read ONLY by the standalone server using its server-side admin
-- credentials. Public clients reach evidence through the `/v1` and `/api` server
-- routes; the deterministic verifier/license code remains the source of truth and
-- InsForge only preserves the tamper-evident audit row.
--
-- This migration does NOT touch the existing first-write-wins partial unique index
-- (`20260620080000_harden-eval-episode-idempotency.sql`); that invariant stays in
-- its own file. The table and all of its columns are created by the baseline
-- migration (`20260620000000_create-eval-episodes-baseline.sql`), which sorts
-- first — so this migration only adds constraints and RLS to a table that already
-- exists with the full audit-row schema.

-- 1. Evidence invariants enforced at the storage boundary (best-effort: only
--    constraints that are always true for authoritative rows the server writes).
--    Each constraint is added as NOT VALID and guarded by a pg_constraint check,
--    so re-running is safe and a pre-existing table is not blocked on legacy data.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_episodes_trace_authority_chk') THEN
    ALTER TABLE public.eval_episodes
      ADD CONSTRAINT eval_episodes_trace_authority_chk
      CHECK (trace_authority = 'server_authoritative_episode') NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_episodes_episode_index_chk') THEN
    ALTER TABLE public.eval_episodes
      ADD CONSTRAINT eval_episodes_episode_index_chk
      CHECK (episode_index >= 1) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_episodes_run_sequence_chk') THEN
    ALTER TABLE public.eval_episodes
      ADD CONSTRAINT eval_episodes_run_sequence_chk
      CHECK (run_sequence >= 1) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_episodes_confidence_chk') THEN
    ALTER TABLE public.eval_episodes
      ADD CONSTRAINT eval_episodes_confidence_chk
      CHECK (confidence >= 0 AND confidence <= 1) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_episodes_requested_policy_mode_chk') THEN
    ALTER TABLE public.eval_episodes
      ADD CONSTRAINT eval_episodes_requested_policy_mode_chk
      CHECK (requested_policy_mode IN ('mock', 'nebius', 'external')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_episodes_actual_policy_source_chk') THEN
    ALTER TABLE public.eval_episodes
      ADD CONSTRAINT eval_episodes_actual_policy_source_chk
      CHECK (actual_policy_source IN ('mock', 'nebius', 'external')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_episodes_action_chk') THEN
    ALTER TABLE public.eval_episodes
      ADD CONSTRAINT eval_episodes_action_chk
      CHECK (action IN ('act', 'ask', 'escalate', 'stop')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_episodes_expected_action_chk') THEN
    ALTER TABLE public.eval_episodes
      ADD CONSTRAINT eval_episodes_expected_action_chk
      CHECK (expected_action IN ('act', 'ask', 'escalate', 'stop')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_episodes_actual_action_chk') THEN
    ALTER TABLE public.eval_episodes
      ADD CONSTRAINT eval_episodes_actual_action_chk
      CHECK (actual_action IN ('act', 'ask', 'escalate', 'stop')) NOT VALID;
  END IF;
END $$;

-- 2. Enable Row-Level Security. With RLS on and NO permissive policies for the
--    client roles, `anon`/`authenticated` cannot read or write any row.
ALTER TABLE public.eval_episodes ENABLE ROW LEVEL SECURITY;

-- 3. Revoke direct table access from runtime client roles. The server uses its
--    admin/service credentials (which bypass RLS) — clients must never touch the
--    table directly. We intentionally add NO `anon`/`authenticated` SELECT/INSERT/
--    UPDATE/DELETE policy and NO permissive always-true policy.
REVOKE ALL ON TABLE public.eval_episodes FROM anon, authenticated;

-- 4. Document the table + RLS posture for future operators.
COMMENT ON TABLE public.eval_episodes IS
  'Tamper-evident gym evidence. Written/read ONLY by the standalone server using server-side admin credentials; public clients use the /v1 and /api server routes. RLS is enabled and anon/authenticated have no policies and no direct privileges. The deterministic verifier/license code is the source of truth; InsForge preserves the audit row.';

COMMENT ON COLUMN public.eval_episodes.audit_row_digest IS
  'Deterministic digest over the stable replay fields of this row; recomputed on read-back to make the evidence tamper-evident.';
