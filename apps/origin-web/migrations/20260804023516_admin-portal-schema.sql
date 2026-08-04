-- Admin portal schema — rebuilt in version control.
--
-- WHY THIS FILE EXISTS. These tables and RPCs previously existed ONLY inside an
-- InsForge dashboard. When the site was repointed from the decommissioned project
-- to the current one (82fs5fqk), auth came along — it lives in InsForge's own
-- schema — but every application table did not. `public` was left with ZERO tables,
-- so the admin panel, the support queue, and role lookups all pointed at objects
-- that no longer existed, and nothing recorded that because nothing was in a repo.
-- This migration is both the fix and the prevention.
--
-- SECURITY MODEL. The client's `staffOnly` tab flag is a convenience, NOT a gate:
-- anyone can call an RPC directly. Every privileged read/write below therefore goes
-- through a SECURITY DEFINER function that re-derives the caller's role INSIDE the
-- database and writes an audit row. Base tables stay locked; the functions are the
-- only privileged door.

-- ============================================================================
-- 1. Role resolution
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The founder's account is super_admin BY CONSTRUCTION, so the portal can never be
-- locked out by a missing seed row and a fresh project has no bootstrap ordering
-- problem. Must stay in sync with OWNER_EMAIL in src/auth/AuthProvider.tsx.
CREATE OR REPLACE FUNCTION public.owner_email()
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT 'bohueilin@gmail.com'::text $$;

-- Caller's effective role. SECURITY DEFINER so it can read auth.users and user_roles
-- without tripping the very policies that call it.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  uid   UUID := auth.uid();
  mail  TEXT;
  found TEXT;
BEGIN
  IF uid IS NULL THEN RETURN 'anon'; END IF;
  SELECT lower(email) INTO mail FROM auth.users WHERE id = uid;
  IF mail IS NOT NULL AND mail = lower(public.owner_email()) THEN
    RETURN 'super_admin';
  END IF;
  SELECT role INTO found FROM public.user_roles WHERE user_id = uid;
  RETURN COALESCE(found, 'user');
END $$;

-- Self-healing role read for the signed-in client. Upserts the caller's own row so
-- `user_roles` stays a true census of accounts (admin_list_accounts joins it), then
-- returns the effective role. This replaces a bare RLS table read, which returned
-- 'user' for the owner until somebody remembered to seed a row.
CREATE OR REPLACE FUNCTION public.ensure_my_role()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  uid  UUID := auth.uid();
  eff  TEXT;
BEGIN
  IF uid IS NULL THEN RETURN 'anon'; END IF;
  eff := public.current_user_role();
  INSERT INTO public.user_roles (user_id, role) VALUES (uid, eff)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
  WHERE public.user_roles.role IS DISTINCT FROM EXCLUDED.role;
  RETURN eff;
END $$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT public.current_user_role() IN ('admin', 'super_admin') $$;

-- Raises instead of returning false: an unauthorised RPC call must fail loudly, never
-- return an empty list that a UI would render as "no data".
CREATE OR REPLACE FUNCTION public.require_staff()
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'forbidden: staff role required' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.require_super_admin()
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF public.current_user_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'forbidden: super_admin role required' USING ERRCODE = '42501';
  END IF;
END $$;

-- ============================================================================
-- 2. Application tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  subject    TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 200),
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 8000),
  category   TEXT NOT NULL DEFAULT 'general',
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS support_tickets_user_created_idx ON public.support_tickets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  snapshot   JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_templates_user_idx ON public.user_templates (user_id, updated_at DESC);

-- Append-only admin action log. No client touches it directly; admin_list_audit does.
CREATE TABLE IF NOT EXISTS public.admin_audit (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email    TEXT NOT NULL,
  action         TEXT NOT NULL,
  target_user_id UUID,
  target_type    TEXT,
  target_id      TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON public.admin_audit (created_at DESC);

-- Review requests from the public lead form. These previously went ONLY to a webhook
-- + email, so the admin portal had nothing to show; persisting them here is what makes
-- the portal the real inbox. Reads are staff-gated through admin_list_leads().
CREATE TABLE IF NOT EXISTS public.leads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  email      TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  company    TEXT CHECK (company IS NULL OR length(company) <= 200),
  blocker    TEXT CHECK (blocker IS NULL OR length(blocker) <= 8000),
  intent     TEXT NOT NULL DEFAULT 'review',
  cta_source TEXT,
  page_path  TEXT,
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS leads_created_idx ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads (status, created_at DESC);

-- ============================================================================
-- 3. Row Level Security
-- ============================================================================

ALTER TABLE public.user_roles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads           ENABLE ROW LEVEL SECURITY;

-- user_roles: a user may READ their own role and nothing else. There is no client write
-- path at all — roles change only through admin_assign_role() / ensure_my_role().
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;
DROP POLICY IF EXISTS user_roles_read_own ON public.user_roles;
CREATE POLICY user_roles_read_own ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- support_tickets: file your own, read your own. Status changes are staff-only via RPC.
REVOKE UPDATE, DELETE ON public.support_tickets FROM anon, authenticated;
DROP POLICY IF EXISTS support_tickets_insert_own ON public.support_tickets;
CREATE POLICY support_tickets_insert_own ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS support_tickets_read_own ON public.support_tickets;
CREATE POLICY support_tickets_read_own ON public.support_tickets
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- user_templates: fully owner-scoped.
DROP POLICY IF EXISTS user_templates_own ON public.user_templates;
CREATE POLICY user_templates_own ON public.user_templates
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- admin_audit: append-only, no direct client access whatsoever.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.admin_audit FROM anon, authenticated;

-- leads: nobody may read them from the client, and there is no client INSERT either.
-- The public form posts to the Pages Function, which writes with the service key —
-- that keeps the write path rate-limited and server-validated rather than trusting the
-- browser, and means an anon caller cannot spam rows straight into the table.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.leads FROM anon, authenticated;

-- ============================================================================
-- 4. Privileged RPCs — the only door to staff data
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_audit_write(
  p_action TEXT, p_target_user UUID, p_target_type TEXT, p_target_id TEXT, p_metadata JSONB
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE mail TEXT;
BEGIN
  SELECT lower(email) INTO mail FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.admin_audit (admin_email, action, target_user_id, target_type, target_id, metadata)
  VALUES (COALESCE(mail, 'unknown'), p_action, p_target_user, p_target_type, p_target_id, COALESCE(p_metadata, '{}'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_accounts()
RETURNS TABLE (user_id UUID, email TEXT, role TEXT, template_count BIGINT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.require_staff();
  RETURN QUERY
    SELECT u.id,
           u.email::text,
           CASE WHEN lower(u.email) = lower(public.owner_email()) THEN 'super_admin'
                ELSE COALESCE(r.role, 'user') END,
           (SELECT count(*) FROM public.user_templates t WHERE t.user_id = u.id),
           u.created_at
    FROM auth.users u
    LEFT JOIN public.user_roles r ON r.user_id = u.id
    ORDER BY u.created_at DESC
    LIMIT 500;
END $$;

CREATE OR REPLACE FUNCTION public.admin_assign_role(target_email TEXT, new_role TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  target UUID;
  others INT;
BEGIN
  PERFORM public.require_super_admin();
  IF new_role NOT IN ('user', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'invalid role: %', new_role USING ERRCODE = '22023';
  END IF;
  SELECT id INTO target FROM auth.users WHERE lower(email) = lower(trim(target_email));
  IF target IS NULL THEN
    RAISE EXCEPTION 'no account for %', target_email USING ERRCODE = 'no_data_found';
  END IF;
  -- The owner is super_admin by construction; refusing here keeps the database honest
  -- rather than writing a row that current_user_role() would override anyway.
  IF lower(trim(target_email)) = lower(public.owner_email()) AND new_role <> 'super_admin' THEN
    RAISE EXCEPTION 'cannot demote the owner account' USING ERRCODE = '42501';
  END IF;
  -- Never leave the project with zero super admins.
  IF new_role <> 'super_admin'
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = target AND role = 'super_admin') THEN
    SELECT count(*) INTO others FROM public.user_roles WHERE role = 'super_admin' AND user_id <> target;
    IF others = 0 THEN
      RAISE EXCEPTION 'refusing to demote the last super_admin' USING ERRCODE = '42501';
    END IF;
  END IF;
  INSERT INTO public.user_roles (user_id, role, updated_at) VALUES (target, new_role, NOW())
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW();
  PERFORM public.admin_audit_write('assign_role', target, 'user', target_email,
    jsonb_build_object('new_role', new_role));
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_tickets()
RETURNS TABLE (id UUID, user_id UUID, email TEXT, subject TEXT, body TEXT, category TEXT, status TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.require_staff();
  RETURN QUERY
    SELECT t.id, t.user_id, u.email::text, t.subject, t.body, t.category, t.status, t.created_at
    FROM public.support_tickets t
    LEFT JOIN auth.users u ON u.id = t.user_id
    ORDER BY t.created_at DESC
    LIMIT 500;
END $$;

CREATE OR REPLACE FUNCTION public.admin_update_ticket(ticket_id UUID, new_status TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.require_staff();
  IF new_status NOT IN ('open', 'in_progress', 'closed') THEN
    RAISE EXCEPTION 'invalid status: %', new_status USING ERRCODE = '22023';
  END IF;
  UPDATE public.support_tickets SET status = new_status, updated_at = NOW() WHERE id = ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no ticket %', ticket_id USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM public.admin_audit_write('update_ticket', NULL, 'ticket', ticket_id::text,
    jsonb_build_object('new_status', new_status));
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_audit()
RETURNS TABLE (id UUID, admin_email TEXT, action TEXT, target_user_id UUID, target_type TEXT, target_id TEXT, metadata JSONB, created_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.require_staff();
  RETURN QUERY
    SELECT a.id, a.admin_email, a.action, a.target_user_id, a.target_type, a.target_id, a.metadata, a.created_at
    FROM public.admin_audit a ORDER BY a.created_at DESC LIMIT 200;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_user_templates(target_user UUID)
RETURNS TABLE (id UUID, name TEXT, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.require_staff();
  RETURN QUERY
    SELECT t.id, t.name, t.updated_at FROM public.user_templates t
    WHERE t.user_id = target_user ORDER BY t.updated_at DESC LIMIT 200;
END $$;

CREATE OR REPLACE FUNCTION public.admin_view_template(template_id UUID)
RETURNS TABLE (id UUID, user_id UUID, name TEXT, snapshot JSONB, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.require_staff();
  -- Opening someone else's saved work is exactly the action that must leave a trace.
  PERFORM public.admin_audit_write('view_template', NULL, 'template', template_id::text, '{}'::jsonb);
  RETURN QUERY
    SELECT t.id, t.user_id, t.name, t.snapshot, t.updated_at
    FROM public.user_templates t WHERE t.id = template_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_leads()
RETURNS TABLE (id UUID, name TEXT, email TEXT, company TEXT, blocker TEXT, intent TEXT, cta_source TEXT, page_path TEXT, status TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.require_staff();
  RETURN QUERY
    SELECT l.id, l.name, l.email, l.company, l.blocker, l.intent, l.cta_source, l.page_path, l.status, l.created_at
    FROM public.leads l ORDER BY l.created_at DESC LIMIT 500;
END $$;

CREATE OR REPLACE FUNCTION public.admin_update_lead(lead_id UUID, new_status TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.require_staff();
  IF new_status NOT IN ('new', 'contacted', 'qualified', 'archived') THEN
    RAISE EXCEPTION 'invalid status: %', new_status USING ERRCODE = '22023';
  END IF;
  UPDATE public.leads SET status = new_status WHERE id = lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no lead %', lead_id USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM public.admin_audit_write('update_lead', NULL, 'lead', lead_id::text,
    jsonb_build_object('new_status', new_status));
END $$;

-- ============================================================================
-- 5. Execute grants — anon may not call any admin_* function
-- ============================================================================
-- Each function re-checks the caller's role internally regardless; this is defence
-- in depth, and it keeps an unauthenticated caller from even reaching the check.

REVOKE ALL ON FUNCTION public.admin_list_accounts()                 FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_assign_role(TEXT, TEXT)         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_tickets()                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_ticket(UUID, TEXT)       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_audit()                    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_user_templates(UUID)       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_view_template(UUID)             FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_leads()                    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_lead(UUID, TEXT)         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_my_role()                      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_role()                   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_audit_write(TEXT, UUID, TEXT, TEXT, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_list_accounts()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_role(TEXT, TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_tickets()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_ticket(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_audit()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_user_templates(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_view_template(UUID)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_leads()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_lead(UUID, TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_my_role()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role()             TO authenticated;

-- ============================================================================
-- 6. Backfill
-- ============================================================================
-- Every existing account gets a census row so admin_list_accounts and the role UI
-- have something real to show on the first load, before anyone signs in again.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id,
       CASE WHEN lower(u.email) = lower(public.owner_email()) THEN 'super_admin' ELSE 'user' END
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;
