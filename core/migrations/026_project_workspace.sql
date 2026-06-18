ALTER TABLE projects
  ADD COLUMN workspace_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (workspace_enabled IN (0, 1));
