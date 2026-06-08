-- 019_goal_workspace.sql · Goal file workspace (P3)
-- Each goal gets a Galley-owned scratch workspace directory for
-- file/code deliverables (the BBS_CWD equivalent). The path is stored
-- here; the directory itself is created lazily by the agents when they
-- first write to it, so "directory exists" approximates "produced
-- files". cwd is unchanged — agents use this absolute path directly.

ALTER TABLE goals
  ADD COLUMN workspace_path TEXT;
