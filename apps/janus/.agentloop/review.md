## Review — P0/P1/P2

**P0 (must-fix): Fresh migration path is broken.** `README.md:459-460` tells operators to run `npx @insforge/cli db migrations up --all`, but the existing idempotency migration runs first and references `public.eval_episodes` before this round creates it: `migrations/20260620080000_harden-eval-episode-idempotency.sql:14-16`. The table is only created in the later migration at `migrations/20260620090000_harden-eval-episodes-rls.sql:19`. On a clean project, `up --all` fails before the new hardening migration can run. Recommendation: add or move an idempotent table-baseline migration that sorts before `20260620080000...`, or otherwise make the pre-existing index migration safe on a clean DB.

**P0 (must-fix): Existing manual tables are not actually migrated to the required schema.** The implementation claims it applies cleanly when the table predates it (`.agentloop/implementation.md:13-14`), but `CREATE TABLE IF NOT EXISTS` at `migrations/20260620090000_harden-eval-episodes-rls.sql:19-70` does nothing if `eval_episodes` already exists. The subsequent constraints reference columns like `trace_authority`, `episode_index`, and `confidence` at `migrations/20260620090000_harden-eval-episodes-rls.sql:78-129`; if an operator followed the old “single JSON column + scalars” guidance, the migration can fail instead of adding the missing flat audit columns. Recommendation: add `ALTER TABLE public.eval_episodes ADD COLUMN IF NOT EXISTS ...` for every required column before adding constraints/RLS.

**P1 (architecture/test honesty): The new tests pass without proving migration applicability.** `server/evidence/evalEpisodesRlsMigration.test.ts:20-35` only scans the new SQL file for text snippets. It does not check migration ordering, that `up --all` can work from an empty DB, or that pre-existing partial/manual tables receive missing columns. That is why gates pass at `.agentloop/gates.log:123-128` while the documented setup remains broken. Recommendation: add tests that inspect all migration filenames in sorted order and assert no migration references `public.eval_episodes` before a create/baseline migration; also assert the hardening migration contains `ADD COLUMN IF NOT EXISTS` for the required audit columns.

**P2 (quality): Minor misleading SQL comment.** `migrations/20260620090000_harden-eval-episodes-rls.sql:72-75` says “NOT VALID-free adds,” but the constraints are explicitly `NOT VALID`. Recommendation: reword to “NOT VALID constraint adds” or similar.

Security/trust-boundary review: the intended posture is right: RLS enabled at `migrations/20260620090000_harden-eval-episodes-rls.sql:135`, direct `anon`/`authenticated` privileges revoked at `migrations/20260620090000_harden-eval-episodes-rls.sql:141`, and no client policies are added. Server evidence still derives verifier/license fields server-side in `server/env/gym.ts:466-509` and legacy path `server/runEpisodeHandler.ts:245-296`. But because the migrations may not apply, the hardening is not reliably deployable.

**Verdict: NEEDS-FIX** for this round’s change.

## Next design

**Objective:** Fix the InsForge hardening migration so `npx @insforge/cli db migrations up --all` works on a clean project and on projects with an existing incomplete/manual `eval_episodes` table.

**Scope:**
- Touch only migrations, `server/evidence/evalEpisodesRlsMigration.test.ts`, `README.md`, and `.env.example` if wording needs correction.
- Do not touch verifier, license, digest, `/api`, `/v1`, Nebius, Vapi, or `server/insforgeStore.ts`.

**Steps:**
1. Add an idempotent baseline migration that sorts before `20260620080000_harden-eval-episode-idempotency.sql`.
2. In that baseline, ensure `public.eval_episodes` exists before the unique-index migration runs.
3. Add `ALTER TABLE public.eval_episodes ADD COLUMN IF NOT EXISTS ...` for every required flat audit-row column, so partial/manual existing tables are upgraded.
4. Keep the existing first-write-wins unique-index migration intact.
5. Keep RLS enablement, revoke posture, comments, and no client policies.
6. Add migration tests that read the migrations directory in sorted order and prove:
   - a table/baseline migration appears before any `eval_episodes` index migration;
   - every required audit column has an `ADD COLUMN IF NOT EXISTS` path;
   - RLS/revoke/no-policy assertions still hold.
7. Update docs only if the exact migration instruction changes.

**Acceptance criteria:**
- Fresh DB migration order cannot reference `public.eval_episodes` before it exists.
- Existing incomplete/manual `eval_episodes` tables get missing required columns.
- RLS remains enabled and direct `anon`/`authenticated` CRUD remains denied.
- No permissive `CREATE POLICY` / `USING (true)` appears.
- Gates pass, and the new tests would have failed on this round’s migration ordering bug.

**Gates:**
```bash
npm run gates
```
