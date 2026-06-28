// Admin/support client calls. The privileged ones go through SECURITY DEFINER RPC
// functions that re-verify the caller's role INSIDE the database and write an audit row —
// so calling these as a non-admin (even directly) fails closed server-side. The UI gating
// is convenience; the database is the real gate.
import { insforge } from './insforge'
import type { Role } from './roleStore'

export interface AdminAccount {
  user_id: string
  email: string
  role: Role
  template_count: number
  created_at: string
}

/** Staff only — list every account with its role + template count (audited). */
export async function adminListAccounts(): Promise<{ ok: boolean; accounts: AdminAccount[]; error?: string }> {
  if (!insforge) return { ok: false, accounts: [], error: 'not configured' }
  const { data, error } = await insforge.database.rpc('admin_list_accounts')
  if (error) return { ok: false, accounts: [], error: error.message }
  return { ok: true, accounts: (data as AdminAccount[]) ?? [] }
}

/** Super-admin only — set a user's role by email (audited; refuses last-super_admin demotion). */
export async function adminAssignRole(email: string, role: Role): Promise<{ ok: boolean; error?: string }> {
  if (!insforge) return { ok: false, error: 'not configured' }
  const { error } = await insforge.database.rpc('admin_assign_role', { target_email: email.trim(), new_role: role })
  return error ? { ok: false, error: error.message } : { ok: true }
}

// ---- Support tickets (user files + reads own; RLS-scoped) --------------------
export interface SupportTicket {
  id: string
  subject: string
  body: string
  category: string
  status: string
  created_at: string
}

export async function fileTicket(subject: string, body: string, category: string): Promise<boolean> {
  if (!insforge) return false
  const { error } = await insforge.database.from('support_tickets').insert([{ subject: subject.trim(), body: body.trim(), category }])
  return !error
}

export async function listMyTickets(): Promise<SupportTicket[]> {
  if (!insforge) return []
  const { data, error } = await insforge.database.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(50)
  if (error || !data) return []
  return data as SupportTicket[]
}

// ---- Phase 2b: admin queue / audit / template viewer (all staff-gated server-side) ----
export interface AdminTicket extends SupportTicket { user_id: string; email: string }
export interface AuditEntry { id: string; admin_email: string; action: string; target_user_id: string | null; target_type: string | null; target_id: string | null; metadata: unknown; created_at: string }
export interface UserTemplate { id: string; name: string; updated_at: string }
export interface TemplateDetail { id: string; user_id: string; name: string; snapshot: unknown; updated_at: string }

export async function adminListTickets(): Promise<{ ok: boolean; tickets: AdminTicket[]; error?: string }> {
  if (!insforge) return { ok: false, tickets: [] }
  const { data, error } = await insforge.database.rpc('admin_list_tickets')
  if (error) return { ok: false, tickets: [], error: error.message }
  return { ok: true, tickets: (data as AdminTicket[]) ?? [] }
}

export async function adminUpdateTicket(id: string, status: string): Promise<boolean> {
  if (!insforge) return false
  const { error } = await insforge.database.rpc('admin_update_ticket', { ticket_id: id, new_status: status })
  return !error
}

export async function adminListAudit(): Promise<{ ok: boolean; entries: AuditEntry[]; error?: string }> {
  if (!insforge) return { ok: false, entries: [] }
  const { data, error } = await insforge.database.rpc('admin_list_audit')
  if (error) return { ok: false, entries: [], error: error.message }
  return { ok: true, entries: (data as AuditEntry[]) ?? [] }
}

export async function adminListUserTemplates(userId: string): Promise<UserTemplate[]> {
  if (!insforge) return []
  const { data, error } = await insforge.database.rpc('admin_list_user_templates', { target_user: userId })
  if (error || !data) return []
  return data as UserTemplate[]
}

export async function adminViewTemplate(id: string): Promise<TemplateDetail | null> {
  if (!insforge) return null
  const { data, error } = await insforge.database.rpc('admin_view_template', { template_id: id })
  if (error || !data || !(data as unknown[]).length) return null
  return (data as TemplateDetail[])[0]
}
