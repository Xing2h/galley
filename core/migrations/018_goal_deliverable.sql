-- 018_goal_deliverable.sql · Goal deliverable anchor (P1)
-- The master maintains a "current best deliverable" that it refines
-- incrementally over the run, instead of one-shot synthesis at wrap-up.
-- Append-only versions: the highest `version` for a goal is the current
-- anchor; older rows are retained so a future phase can roll back.

CREATE TABLE goal_deliverables (
  id                 TEXT PRIMARY KEY,
  goal_id            TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  version            INTEGER NOT NULL,
  content            TEXT NOT NULL,
  note               TEXT,
  author_session_id  TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL
);

CREATE INDEX goal_deliverables_by_goal
  ON goal_deliverables(goal_id, version);
