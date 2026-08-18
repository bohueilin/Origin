-- TRP — Taint-Reachability. Fires only where all three legs of the lethal trifecta meet on one
-- identity: it processed untrusted content, it can READ something sensitive, and it holds a
-- non-read capability on an egress-capable resource.
--
-- `paths` is the PRODUCT (sensitive readable × egress writable) per exposed identity — the count of
-- distinct source→sink pairs. Headcount tells you how many identities are exposed; the product
-- tells you how large the surface is, which is the number that should carry the SLO.
, legs AS (
  SELECT
    i.id,
    COUNT(DISTINCT CASE WHEN r.classification IN ('high','forbidden')
                         AND e.capability IN ('read','export') THEN e.resource END) AS sensitive_reads,
    COUNT(DISTINCT CASE WHEN r.egress = 1
                         AND e.capability <> 'read'            THEN e.resource END) AS egress_writes
  FROM identities i
  JOIN effective e ON e.identity = i.id
  JOIN resources  r ON r.id = e.resource
  WHERE i.tainted = 1
  GROUP BY i.id
)
SELECT
  (SELECT COUNT(*) FROM identities WHERE tainted = 1)                       AS tainted_identities,
  (SELECT COUNT(*) FROM legs WHERE sensitive_reads > 0 AND egress_writes > 0) AS exposed_identities,
  (SELECT COUNT(*) FROM legs WHERE sensitive_reads > 0 AND egress_writes > 0) * 1.0
    / NULLIF((SELECT COUNT(*) FROM identities WHERE tainted = 1), 0)        AS exposure_rate,
  COALESCE((SELECT SUM(sensitive_reads * egress_writes) FROM legs
            WHERE sensitive_reads > 0 AND egress_writes > 0), 0)            AS paths;
