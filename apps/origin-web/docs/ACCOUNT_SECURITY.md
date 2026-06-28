# Origin account security & RBAC — architecture

> Goal: a user's templates and data can **never be leaked, stolen, or modified by another
> account**, and roles can **never be self-escalated**. Enforced at the database and in
> server-verified edge functions — never trusted to the client UI.

## Threat model
1. Cross-account read/write — account B reading/modifying account A's templates.
2. Privilege escalation — a user making themselves admin/super_admin.
3. Admin abuse / silent snooping — an admin reading user data without a trace.
4. Client tampering — a hacked client that flips UI flags to "admin".

## Defense in depth (4 layers)
1. **Row-Level Security** — every per-user table filters by the JWT subject
   (`auth.uid() = user_id`) in PostgREST. Even with the anon key, another user's rows
   return nothing. Primary isolation guarantee.
2. **No client write to roles** — `user_roles` has a read-own SELECT policy and ZERO
   insert/update/delete policies. Escalation is structurally impossible from the client.
3. **Server-verified privilege** — every admin action runs in an edge function that
   re-reads the caller's role with the admin key and rejects on mismatch. UI gating is
   convenience; the server is the real gate.
4. **Append-only admin audit** — every cross-account access is written to
   `admin_audit_log` (RLS on, no client policies → function-only).

## Roles
- **super_admin** — root: assign/revoke roles, view/manage all accounts, templates, audit.
- **admin** — list accounts (metadata), read-only + logged view of a user's template for
  debugging, read audit/errors, work the support queue. No role changes, no escalation.
- **user** — CRUD own templates only, file support tickets, see support contact.

## Data model (live + verified)
- `floor_plans` (existing) — per-account templates; RLS own-only on all 4 ops (verified).
- `user_roles` — pk user_id, role check(user|admin|super_admin); RLS read-own, no writes;
  bootstrapped bohueilin@gmail.com = super_admin.
- `support_tickets` — RLS own SELECT+INSERT.
- `admin_audit_log` — RLS on, no policies (admin-function-only).

## Client (live)
- `src/roleStore.ts` — getMyRole() (fail-closed to 'user'), roleLabel, isStaff.
- `src/cloudFloorPlans.ts` — per-account template CRUD on floor_plans.

## Phase 2 (next): admin edge functions (role-verified, audited) + UI
- `admin-list-accounts`, `admin-view-template` (logged, read-only), `role-assign`
  (super_admin only, refuses last-super_admin self-demotion), `admin-list/update-ticket`.
- Account Settings: Admin tab (admin+), Roles tab (super_admin), Support tab (all);
  ReflectAlign My Plans dropdown (cloud when signed in, local fallback).

## Anthropic-way principles
Least privilege · fail-closed · no escalation surface · auditable · the UI never holds
authority — the server re-verifies every privileged action.
