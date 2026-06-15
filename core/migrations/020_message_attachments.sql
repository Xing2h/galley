-- Message attachments owned by Galley.
--
-- V1 stores only image attachments. Binary bytes live on disk under the
-- app-data directory; SQLite keeps searchable conversation text separate
-- from large media payloads.

CREATE TABLE message_attachments (
  id          TEXT PRIMARY KEY,
  message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('image')),
  file_path   TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  byte_size   INTEGER NOT NULL CHECK (byte_size >= 0),
  width       INTEGER,
  height      INTEGER,
  created_at  TEXT NOT NULL
);

CREATE INDEX message_attachments_by_message
  ON message_attachments(message_id, id);

CREATE INDEX message_attachments_by_session
  ON message_attachments(session_id, message_id);
