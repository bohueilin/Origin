-- AMV — Attenuation-Monotonicity Violations. A delegation edge is sound iff child.granted ⊆
-- parent.granted. NOT EXISTS is the set-difference: any child scope with no matching parent row
-- widened authority across the hop.
--
-- Under a macaroon / biscuit-style attenuating token this reads a STRUCTURAL zero. Running it
-- anyway is the point — the difference between "escalation is impossible by construction" and
-- "escalation is impossible by construction, and here is the number that says it held."
WITH widened AS (
  SELECT c.identity AS child, ci.parent AS parent, c.scope
  FROM grants c
  JOIN identities ci ON ci.id = c.identity
  WHERE ci.parent IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM grants p WHERE p.identity = ci.parent AND p.scope = c.scope
    )
)
SELECT
  (SELECT COUNT(*) FROM identities WHERE parent IS NOT NULL)        AS delegation_edges,
  (SELECT COUNT(DISTINCT child) FROM widened)                       AS violating_edge_count,
  (SELECT COUNT(*) FROM widened)                                    AS violating_scopes,
  (SELECT COUNT(DISTINCT child) FROM widened) * 1.0
    / NULLIF((SELECT COUNT(*) FROM identities WHERE parent IS NOT NULL), 0) AS violation_rate;
