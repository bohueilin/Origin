All gates pass.

## Implementation report

Implemented the InsForge hardening round exactly per `design.md`: `eval_episodes` is now migration-managed and RLS-hardened, with server-only admin writes as the sole evidence path.

### Files changed
- **`migrations/20260620090000_harden-eval-episodes-rls.sql`** (new) — idempotent `CREATE TABLE IF NOT EXISTS public.eval_episodes` with the full flat audit-row schema (Postgres types per spec: `text`/`integer`/`boolean`/`double precision`/`jsonb`, `timestamptz` defaults, `uuid` PK via `gen_random_uuid()`). Adds `NOT VALID` CHECK constraints for the evidence invariants (`trace_authority`, `episode_index>=1`, `run_sequence>=1`, `confidence` 0–1, policy-mode/source enums, action enums), enables RLS, `REVOKE ALL ... FROM anon, authenticated`, and documents posture via `COMMENT ON TABLE`/`COMMENT ON COLUMN`. Adds no client policies and no permissive always-true policy. Leaves the existing idempotency unique-index migration untouched.
- **`server/evidence/evalEpisodesRlsMigration.test.ts`** (new) — text-level migration assertions: exists/non-empty, manages the table, enables RLS, revokes anon/authenticated, no `CREATE POLICY` / `USING (true)`, includes `audit_row_digest`/`row_schema_version`/`trace_id`, and references no verifier/license/digest source.
- **`README.md`** — replaced "create the table by hand" guidance (both the InsForge setup section and the demo-prep checklist) with the migration command; documents migration-managed + RLS-denied-CRUD + server/admin evidence path.
- **`.env.example`** — replaced the manual-table note with the migration command and RLS note; reinforced that `INSFORGE_API_KEY` is server-side only and never `VITE_*`.

### Key decisions
- Used `IF NOT EXISTS` + `NOT VALID` constraints + `DO $$ ... pg_constraint` guards so the migration applies cleanly whether or not the table already exists (existing live projects predate it), without blocking on legacy rows.
- Reworded one SQL comment to avoid the literal `USING (true)` token, which the posture test (correctly) forbids anywhere in the file — a comment mentioning it was a false positive; meaning preserved as "no permissive always-true policy."

### Gate results — all pass
- `npm run build` ✅
- `npm run lint` ✅ (clean)
- `npm run verify:evidence` ✅ (40/40 checks)
- `npm test` ✅ (90 tests, 10 files)

### Deferred / open questions for Codex
- The migration's `NOT VALID` checks are not `VALIDATE`d (intentional, to avoid failing on any pre-existing legacy rows). If a future round wants them enforced retroactively, that needs a separate `VALIDATE CONSTRAINT` migration after a data audit — flagging as adjacent, not done.
- No live DB was exercised (no test DB in repo); RLS/privilege behavior is verified only at the SQL-text level, consistent with the plan's "focused text-level migration tests."

---
## Post-review manual fix (outside the loop)
The round-15 review's two P0s (migration ordering + missing ADD COLUMN upgrade) are
RESOLVED in commit 47e5565: added baseline migration 20260620000000 (sorts first,
creates table + ADD COLUMN IF NOT EXISTS for all columns), slimmed the RLS migration
to constraints+RLS only, and replaced the shallow SQL-grep test with an ordering +
upgrade-path + RLS test. Gates green (10 files, 89 tests). Ready for re-review.
