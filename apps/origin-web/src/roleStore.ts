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

/** Read the signed-in user's own role. RLS returns only their row; default 'user'. */
export async function getMyRole(): Promise<Role> {
  if (!insforge) return 'user'
  try {
    const { data, error } = await insforge.database.from('user_roles').select('role').limit(1)
    if (error || !data || !(data as unknown[]).length) return 'user'
    const r = (data as Array<{ role?: string }>)[0]?.role
    return r === 'admin' || r === 'super_admin' ? r : 'user'
  } catch {
    return 'user'
  }
}

export function isStaff(r: Role): boolean {
  return r === 'admin' || r === 'super_admin'
}
