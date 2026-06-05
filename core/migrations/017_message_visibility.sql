-- 017_message_visibility.sql
--
-- Internal Goal Master planning turns should be persisted for audit/context
-- without rendering in the ordinary conversation or search surfaces.

ALTER TABLE messages
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'visible'
  CHECK (visibility IN ('visible', 'internal'));

CREATE INDEX messages_by_visibility
  ON messages(session_id, visibility, turn_index, sequence);
