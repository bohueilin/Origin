-- Baseline schema for the gym evidence table `eval_episodes`.
--
-- This migration sorts FIRST (00:00:00) so every later migration — the
-- idempotency unique index (…080000) and the RLS hardening (…090000) — runs
-- against a table that already exists. It is safe on BOTH a clean project (the
-- CREATE makes the table) and a project where the table was created out-of-band
-- (dashboard/CLI, possibly with a partial/legacy shape): the CREATE is a no-op
-- and the per-column `ADD COLUMN IF NOT EXISTS` upgrades it to the required flat
-- audit-row schema. No data is touched; no constraints/RLS here (that is …090000).

-- 1. Ensure the table exists (clean project).
CREATE TABLE IF NOT EXISTS public.eval_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Ensure every flat audit-row column exists (upgrades a pre-existing or
--    partial/manual table). Idempotent: ADD COLUMN IF NOT EXISTS is a no-op when
--    the column is already present. Keep this list in sync with the audit row
--    written by server/env/gym.ts and server/runEpisodeHandler.ts.
ALTER TABLE public.eval_episodes
  -- identity / order
  ADD COLUMN IF NOT EXISTS trace_id text,
  ADD COLUMN IF NOT EXISTS run_id text,
  ADD COLUMN IF NOT EXISTS episode_index integer,
  ADD COLUMN IF NOT EXISTS run_sequence integer,
  ADD COLUMN IF NOT EXISTS trace_authority text,
  -- attribution versions
  ADD COLUMN IF NOT EXISTS environment_name text,
  ADD COLUMN IF NOT EXISTS scenario_registry_version text,
  ADD COLUMN IF NOT EXISTS verifier_version text,
  ADD COLUMN IF NOT EXISTS reward_model_version text,
  ADD COLUMN IF NOT EXISTS license_policy_version text,
  ADD COLUMN IF NOT EXISTS app_commit text,
  ADD COLUMN IF NOT EXISTS row_schema_version text,
  -- scenario
  ADD COLUMN IF NOT EXISTS scenario_id text,
  ADD COLUMN IF NOT EXISTS scenario_version text,
  ADD COLUMN IF NOT EXISTS scenario_title text,
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS scenario_snapshot jsonb,
  -- policy provenance / input
  ADD COLUMN IF NOT EXISTS requested_policy_mode text,
  ADD COLUMN IF NOT EXISTS actual_policy_source text,
  ADD COLUMN IF NOT EXISTS fallback boolean,
  ADD COLUMN IF NOT EXISTS fallback_code text,
  ADD COLUMN IF NOT EXISTS attempted_model_input jsonb,
  ADD COLUMN IF NOT EXISTS actual_policy_input jsonb,
  ADD COLUMN IF NOT EXISTS model_name text,
  -- decision
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS rationale text,
  ADD COLUMN IF NOT EXISTS requested_info text,
  ADD COLUMN IF NOT EXISTS confidence double precision,
  -- deterministic verifier / license result
  ADD COLUMN IF NOT EXISTS passed boolean,
  ADD COLUMN IF NOT EXISTS reward double precision,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS catastrophic boolean,
  ADD COLUMN IF NOT EXISTS expected_action text,
  ADD COLUMN IF NOT EXISTS actual_action text,
  ADD COLUMN IF NOT EXISTS verifier_reason text,
  ADD COLUMN IF NOT EXISTS verifier_checks jsonb,
  ADD COLUMN IF NOT EXISTS license_level text,
  ADD COLUMN IF NOT EXISTS license_summary jsonb,
  -- integrity
  ADD COLUMN IF NOT EXISTS audit_row_digest text;
