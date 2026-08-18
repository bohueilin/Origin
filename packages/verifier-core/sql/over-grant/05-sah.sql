-- SAH — Standing-Authority Half-Life. Scoped to the scopes that WERE exercised.
--
-- A never-used scope is already GUR's subject; counting it here too would make this metric
-- algebraically identical to (1 − GUR). Two numbers that are the same number are one number
-- wearing a hat. So SAH answers what GUR cannot: of the authority actually in use, how much longer
-- does the credential live than the work needs?
--
--   staleness = (window_end − last_use) / ttl   → the grant outliving its usefulness
--   span      = (last_use  − first_use) / ttl   → the just-in-time conversion signal
--
-- The * 1.0 casts are load-bearing: SQLite integer division would silently floor every ratio to 0.
WITH used AS (
  SELECT e.identity, e.scope, MIN(e.day) AS first_day, MAX(e.day) AS last_day, i.ttl_days
  FROM events e
  JOIN grants     g ON g.identity = e.identity AND g.scope = e.scope
  JOIN identities i ON i.id = e.identity
  WHERE e.decision = 'allow'
  GROUP BY e.identity, e.scope
),
ratios AS (
  SELECT (:window - last_day) * 1.0 / ttl_days AS staleness,
         (last_day - first_day) * 1.0 / ttl_days AS span
  FROM used
)
SELECT
  (SELECT COUNT(*) FROM grants)                                            AS scopes,
  (SELECT COUNT(*) FROM ratios)                                            AS exercised_scopes,
  -- median reproduces the analyzer's index formula exactly: floor((n - 1) / 2) over ASC order
  (SELECT staleness FROM ratios ORDER BY staleness LIMIT 1
     OFFSET (SELECT CAST((COUNT(*) - 1) / 2 AS INTEGER) FROM ratios))      AS median_staleness_ratio,
  (SELECT span FROM ratios ORDER BY span LIMIT 1
     OFFSET (SELECT CAST((COUNT(*) - 1) / 2 AS INTEGER) FROM ratios))      AS median_span_to_ttl,
  (SELECT COUNT(*) FROM grants) - (SELECT COUNT(*) FROM ratios)            AS dormant_scopes;
