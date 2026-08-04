-- Align the ticket status domain with the shipped UI.
--
-- AccountSettings.tsx's queue offers four statuses — open / in_progress / resolved /
-- closed — but the rebuilt schema only allowed three. Picking "Resolved" would have
-- raised 22023 from admin_update_ticket and shown as a failed action with no
-- explanation. Widen the domain rather than remove the option: "resolved" and
-- "closed" are different facts (we fixed it vs. we stopped working it), and the queue
-- is more useful when it can say which.

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_status_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_status_check
  CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'));

CREATE OR REPLACE FUNCTION public.admin_update_ticket(ticket_id UUID, new_status TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.require_staff();
  IF new_status NOT IN ('open', 'in_progress', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'invalid status: %', new_status USING ERRCODE = '22023';
  END IF;
  UPDATE public.support_tickets SET status = new_status, updated_at = NOW() WHERE id = ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no ticket %', ticket_id USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM public.admin_audit_write('update_ticket', NULL, 'ticket', ticket_id::text,
    jsonb_build_object('new_status', new_status));
END $$;
