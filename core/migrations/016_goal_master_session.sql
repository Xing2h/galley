-- 016_goal_master_session.sql · Goal master session delivery
-- Desktop Goals now have a user-visible master session that owns launch
-- context, final delivery, and result-seen state. CLI / IM Goals may leave
-- master_session_id NULL while an external Supervisor handles delivery.

ALTER TABLE goal_proposals
  ADD COLUMN master_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL;

ALTER TABLE goals
  ADD COLUMN master_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL;

ALTER TABLE goals
  ADD COLUMN result_seen_at TEXT;

CREATE INDEX goals_by_master_session
  ON goals(master_session_id, status)
  WHERE master_session_id IS NOT NULL;

CREATE INDEX goals_visible_unseen_results
  ON goals(status, result_seen_at, updated_at DESC)
  WHERE status IN ('completed','failed');
