-- BRI — Blast-Radius Index. Distinct SENSITIVE resources reachable under effective authority,
-- normalized by the sensitive resources in the catalogue so fleets of different sizes compare.
--
-- The LEFT JOIN is load-bearing: an identity that reaches nothing sensitive must contribute a ZERO
-- to the mean, not vanish from the denominator. An inner join here would quietly report the mean
-- blast radius of only the identities that have one.
, sensitive_total AS (
  SELECT COUNT(*) AS n FROM resources WHERE classification IN ('high','forbidden')
),
per_identity AS (
  SELECT
    i.id,
    COUNT(DISTINCT CASE WHEN r.classification IN ('high','forbidden') THEN e.resource END) AS reachable
  FROM identities i
  LEFT JOIN effective e ON e.identity = i.id
  LEFT JOIN resources  r ON r.id = e.resource
  GROUP BY i.id
),
bri AS (
  SELECT p.id, p.reachable * 1.0 / (SELECT n FROM sensitive_total) AS bri FROM per_identity p
)
SELECT
  (SELECT n FROM sensitive_total)                              AS sensitive_resources,
  (SELECT AVG(bri) FROM bri)                                   AS mean_bri,
  -- p95 / max reproduce the analyzer's index formula exactly: floor(q * (n - 1)) over ASC order.
  (SELECT bri FROM bri ORDER BY bri LIMIT 1
     OFFSET (SELECT CAST(0.95 * (COUNT(*) - 1) AS INTEGER) FROM bri)) AS p95_bri,
  (SELECT MAX(bri) FROM bri)                                   AS max_bri;
