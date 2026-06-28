## Objective

Satisfy the GOAL “InsForge hardening” checkbox by making `eval_episodes` migration-managed and RLS-hardened while keeping server-only evidence writes as the only accepted path.

## Scope

Create/change only:
- `migrations/20260620090000_harden-eval-episodes-rls.sql`
- `server/evidence/evalEpisodesRlsMigration.test.ts`
- `README.md`
- `.env.example`

Do NOT touch:
- verifier, license, digest semantics
- `/api` or `/v1` route behavior
- InsForge request-path code in `server/insforgeStore.ts`
- Nebius/Vapi behavior
- existing applied migration `migrations/20260620080000_harden-eval-episode-idempotency.sql`
- `package.json` / `package-lock.json`

## Steps

1. Add `migrations/20260620090000_harden-eval-episodes-rls.sql`.

2. In the migration, define `public.eval_episodes` as a migration-managed table if it does not already exist. Include the flat audit-row columns the server currently writes:
   - InsForge-managed/storage columns: `id`, `created_at`, `updated_at`
   - identity/order: `trace_id`, `run_id`, `episode_index`, `run_sequence`, `trace_authority`
   - versions: `environment_name`, `scenario_registry_version`, `verifier_version`, `reward_model_version`, `license_policy_version`, `app_commit`, `row_schema_version`
   - scenario: `scenario_id`, `scenario_version`, `scenario_title`, `domain`, `scenario_snapshot`
   - provenance/input: `requested_policy_mode`, `actual_policy_source`, `fallback`, `fallback_code`, `attempted_model_input`, `actual_policy_input`, `model_name`
   - decision: `action`, `rationale`, `requested_info`, `confidence`
   - verifier/license: `passed`, `reward`, `category`, `catastrophic`, `expected_action`, `actual_action`, `verifier_reason`, `verifier_checks`, `license_level`, `license_summary`
   - integrity: `audit_row_digest`

3. Use appropriate Postgres types:
   - `text` for string fields
   - `integer` for `episode_index` and `run_sequence`
   - `boolean` for `fallback`, `passed`, and `catastrophic`
   - `double precision` for `confidence` and `reward`
   - `jsonb` for snapshots, policy inputs, verifier checks, and license summary
   - `timestamptz` defaults for `created_at` / `updated_at`
   - UUID primary key default for `id`

4. Preserve evidence invariants with database constraints where safe:
   - `trace_authority = 'server_authoritative_episode'`
   - `episode_index >= 1`
   - `run_sequence >= 1`
   - `confidence >= 0 AND confidence <= 1`
   - `requested_policy_mode IN ('mock', 'nebius', 'external')`
   - `actual_policy_source IN ('mock', 'nebius', 'external')`
   - `action`, `expected_action`, and `actual_action` in `('act', 'ask', 'escalate', 'stop')`
   - Do not duplicate or remove the existing partial unique index migration; leave first-write-wins idempotency in the existing file.

5. Enable RLS on `public.eval_episodes`.

6. Revoke direct table access from runtime client roles:
   - `REVOKE ALL ON TABLE public.eval_episodes FROM anon, authenticated`
   - If any sequence is introduced, revoke sequence access from `anon` and `authenticated` too.
   - Do not add `anon` or `authenticated` `SELECT`, `INSERT`, `UPDATE`, or `DELETE` policies.
   - Do not add any `USING (true)` policy on `public.eval_episodes`.

7. Add SQL comments on the table and RLS posture explaining:
   - evidence rows are written/read by the standalone server using server-only admin credentials
   - public clients must use `/v1` or `/api` server routes
   - deterministic verifier/license code remains the source of truth
   - InsForge preserves tamper-evident evidence only

8. Add `server/evidence/evalEpisodesRlsMigration.test.ts` with focused text-level migration tests:
   - the new migration exists
   - it creates or manages `public.eval_episodes`
   - it enables row-level security
   - it revokes direct access from `anon` and `authenticated`
   - it does not contain an `eval_episodes` policy with `USING (true)`
   - it includes `audit_row_digest`, `row_schema_version`, and `trace_id`
   - it does not modify verifier/license/digest code

9. Update `README.md`:
   - Replace instructions to manually create `eval_episodes` with applying migrations:
     `npx @insforge/cli db migrations up --all`
   - Document that `eval_episodes` is migration-managed.
   - Document that RLS is enabled and direct `anon`/`authenticated` CRUD is intentionally denied.
   - State that server/admin writes through the standalone backend are the supported evidence path.
   - Update the manual InsForge checklist so it no longer says “create the table”.

10. Update `.env.example`:
   - Replace the manual table creation note with the migration command.
   - Keep the warning that `INSFORGE_API_KEY` is server-side only and must never be exposed as `VITE_*`.

## Acceptance criteria

- `eval_episodes` schema is represented in a migration, not only README/manual setup.
- RLS is enabled on `public.eval_episodes`.
- Direct `anon` and `authenticated` table CRUD is denied by privileges/RLS.
- No permissive client policy such as `USING (true)` exists for `eval_episodes`.
- Existing first-write-wins unique-index migration remains intact.
- README and `.env.example` no longer instruct operators to manually create the table.
- No secrets are committed or exposed to the client.
- Verifier/license/digest/gym behavior is unchanged.

## Gates

```bash
npm run gates
```
