-- Harden gym /v1 evidence idempotency at the STORAGE boundary.
--
-- The deterministic verifier + first-write-wins replay logic already make a
-- signed episode's first verdict authoritative in the request path. This index
-- enforces that same invariant in the database, so a race (two concurrent steps
-- whose pre-insert reads both miss the existing row) cannot persist two
-- authoritative rows for one trace_id: the second INSERT hits a unique violation
-- and the server rehydrates the first row instead.
--
-- Partial on trace_authority = 'server_authoritative_episode' so it constrains
-- ONLY authoritative gym episodes; any non-authoritative rows are unaffected.
-- No BEGIN/COMMIT, no table rewrite, no backfill — a single focused invariant.

CREATE UNIQUE INDEX IF NOT EXISTS eval_episodes_authoritative_trace_id_uidx
  ON public.eval_episodes (trace_id)
  WHERE trace_authority = 'server_authoritative_episode';

COMMENT ON INDEX public.eval_episodes_authoritative_trace_id_uidx IS
  'Storage boundary for gym episode idempotency: one authoritative evidence row per trace_id (first-write-wins).';
