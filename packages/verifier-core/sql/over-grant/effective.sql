-- Effective authority — the delegation closure, as a recursive CTE.
--
-- An identity's effective authority is its own grants UNION every descendant's, transitively.
-- Under a correct attenuating capability token this union is a NO-OP, because a child can only
-- narrow. It stops being a no-op exactly when an attenuation-monotonicity violation exists below —
-- which is why BRI and TRP are computed over this view and not over direct grants.
--
-- Included by the metric queries below via the runner; kept in one file so the closure is defined
-- once and cannot drift between metrics.

WITH RECURSIVE subtree(root, node) AS (
    SELECT id, id FROM identities
  UNION
    SELECT s.root, i.id FROM subtree s JOIN identities i ON i.parent = s.node
),
effective AS (
  SELECT DISTINCT s.root AS identity, g.resource, g.capability
  FROM subtree s
  JOIN grants g ON g.identity = s.node
)
