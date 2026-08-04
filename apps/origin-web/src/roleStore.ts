// Account roles (RBAC). The role is a SERVER-CONTROLLED fact: a user may read their own
// role (RLS: read-own on `user_roles`) but can NEVER write any role — there is no client
// insert/update policy, so client-side privilege escalation is impossible. This reader is
// for UI convenience only; every privileged action is RE-VERIFIED server-side in an edge
// function before it touches another account's data. Fail-closed: anything uncertain → 'user'.
import { insforge } from './insforge'

export type Role = 'user' | 'admin' | 'super_admin'

export function roleLabel(r: Role): string {
  return r === 'super_admin' ? 'Super Admin' : r === 'admin' ? 'Admin' : 'User'
}

/**
 * The outcome of a role lookup.
 *
 * `role` is ALWAYS safe to act on — it is 'user' unless staff was positively confirmed,
 * so permission stays fail-closed. `ok` says whether that answer is a real verdict or
 * merely the safe default after a failure. The two are different facts and the UI must
 * be able to tell them apart: "you are a regular user" is information, "we could not
 * find out" is an error, and rendering the second as the first is how a super_admin
 * silently loses the Admin tab with nothing on screen to explain it.
 */
export type RoleResult =
  | { ok: true; role: Role }
  | { ok: false; role: 'user'; error: string }

/**
 * Read the signed-in user's own role.
 *
 * Goes through `ensure_my_role()` rather than a bare `user_roles` read. The table read
 * returned 'user' for any account with no row yet — including the owner on a freshly
 * provisioned project, which is exactly how the Admin tab silently vanished after a
 * backend migration. The RPC derives the role server-side (the owner is super_admin by
 * construction) and upserts the caller's census row on the way out, so `user_roles`
 * stays complete without anyone remembering to seed it.
 */
export async function getMyRole(): Promise<RoleResult> {
  if (!insforge) return { ok: false, role: 'user', error: 'Accounts are not configured.' }
  try {
    const { data, error } = await insforge.database.rpc('ensure_my_role')
    if (error) return { ok: false, role: 'user', error: error.message || 'Role lookup failed.' }
    // The RPC returns a scalar, but a PostgREST-style client may hand it back wrapped in
    // a row or an array depending on the call path — normalize all shapes.
    const raw = Array.isArray(data) ? (data[0] as unknown) : data
    const r = typeof raw === 'string' ? raw : (raw as { ensure_my_role?: string } | null)?.ensure_my_role
    // An unrecognised value is a successful answer we decline to trust with staff
    // permission — not an error, but never elevated either.
    return { ok: true, role: r === 'admin' || r === 'super_admin' ? r : 'user' }
  } catch (e) {
    return { ok: false, role: 'user', error: e instanceof Error ? e.message : 'Role lookup failed.' }
  }
}

export function isStaff(r: Role): boolean {
  return r === 'admin' || r === 'super_admin'
}
