-- GUR — Grant-Utilization Ratio.
--
-- Numerator:   distinct (identity, scope) pairs exercised with an ALLOW, joined back to `grants`
--              so an ALLOW on a scope the identity was never granted cannot inflate it.
-- Denominator: scopes granted at or before window start (`granted_day <= 0`), so a grant minted
--              mid-window is not scored as waste before it has had a chance to be used.
--
-- The fleet number is Σnumerator / Σdenominator — NOT AVG(per-identity ratio). Mean-of-ratios lets
-- one busy 3-scope agent cancel out a dormant 60-scope one.
WITH eligible AS (
  SELECT g.identity, g.scope
  FROM grants g
  JOIN identities i ON i.id = g.identity
  WHERE i.granted_day <= 0
),
exercised AS (
  SELECT DISTINCT e.identity, e.scope
  FROM events e
  JOIN eligible g ON g.identity = e.identity AND g.scope = e.scope
  WHERE e.decision = 'allow'
)
SELECT
  (SELECT COUNT(*) FROM eligible)  AS scopes_granted,
  (SELECT COUNT(*) FROM exercised) AS scopes_exercised,
  (SELECT COUNT(*) FROM exercised) * 1.0 / NULLIF((SELECT COUNT(*) FROM eligible), 0) AS fleet_gur;
