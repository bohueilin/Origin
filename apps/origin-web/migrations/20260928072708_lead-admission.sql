-- Shared admission for the public Pages lead handler. This table carries only a
-- keyed HMAC of the edge-supplied address, never the raw IP or form contents.
CREATE TABLE public.lead_admission (
  client_key text PRIMARY KEY CHECK (client_key ~ '^[a-f0-9]{64}$'),
  window_start timestamptz NOT NULL,
  used smallint NOT NULL CHECK (used BETWEEN 1 AND 4)
);
CREATE INDEX lead_admission_expiry ON public.lead_admission (window_start);
ALTER TABLE public.lead_admission ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_admission FROM PUBLIC, anon, authenticated;

-- SECURITY INVOKER: only the server admin API key may invoke this function.
-- UPSERT locks the row, so concurrent Pages isolates cannot race a read+write.
CREATE FUNCTION public.admit_origin_lead(client_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  stamp timestamptz := clock_timestamp();
  admitted public.lead_admission%ROWTYPE;
BEGIN
  IF client_key IS NULL OR client_key !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid admission key' USING ERRCODE = '22023';
  END IF;
  -- Opportunistic cleanup: no rows older than 24h survive a successful call.
  DELETE FROM public.lead_admission WHERE window_start < stamp - interval '24 hours';
  INSERT INTO public.lead_admission AS counters (client_key, window_start, used)
    VALUES (client_key, stamp, 1)
  ON CONFLICT ON CONSTRAINT lead_admission_pkey DO UPDATE SET
    window_start = CASE WHEN counters.window_start <= stamp - interval '10 minutes' THEN stamp ELSE counters.window_start END,
    used = CASE WHEN counters.window_start <= stamp - interval '10 minutes' THEN 1 ELSE LEAST(counters.used + 1, 4) END
  RETURNING * INTO admitted;
  RETURN jsonb_build_object(
    'allowed', admitted.used <= 3,
    'retry_after', CASE WHEN admitted.used <= 3 THEN 0 ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM admitted.window_start + interval '10 minutes' - stamp))::integer) END
  );
END $$;
REVOKE ALL ON FUNCTION public.admit_origin_lead(text) FROM PUBLIC, anon, authenticated;
