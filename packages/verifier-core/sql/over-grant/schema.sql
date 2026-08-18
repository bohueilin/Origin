-- Over-grant analyzer — relational schema for the agent authorization log.
--
-- The shape a real deployment reads from: one row per granted scope, one row per RPC / tool call.
-- Deliberately narrow and denormalized at the scope level (`resource`, `capability` split out of
-- the scope string) so every metric is a straight aggregate and no metric needs application code.

CREATE TABLE resources (
  id             TEXT PRIMARY KEY,
  classification TEXT    NOT NULL CHECK (classification IN ('low','medium','high','forbidden')),
  egress         INTEGER NOT NULL CHECK (egress IN (0,1))   -- can move bytes out of the trust boundary
);

CREATE TABLE identities (
  id          TEXT PRIMARY KEY,
  parent      TEXT REFERENCES identities(id),               -- the delegation edge; NULL for a root
  owner       TEXT    NOT NULL,                             -- the human the authority traces back to
  tainted     INTEGER NOT NULL CHECK (tainted IN (0,1)),    -- processed untrusted content in the window
  granted_day INTEGER NOT NULL,
  ttl_days    INTEGER NOT NULL
);

CREATE TABLE grants (
  identity   TEXT NOT NULL REFERENCES identities(id),
  scope      TEXT NOT NULL,                                 -- '${resource}:${capability}'
  resource   TEXT NOT NULL REFERENCES resources(id),
  capability TEXT NOT NULL,
  PRIMARY KEY (identity, scope)
);

CREATE TABLE events (
  day      INTEGER NOT NULL,
  identity TEXT    NOT NULL REFERENCES identities(id),
  scope    TEXT    NOT NULL,
  decision TEXT    NOT NULL CHECK (decision IN ('allow','deny','escalate'))
);

CREATE INDEX idx_events_identity_scope ON events (identity, scope, decision);
CREATE INDEX idx_identities_parent     ON identities (parent);
CREATE INDEX idx_grants_identity       ON grants (identity);
