-- 015_goal_v1.sql · Galley Goal V1
-- Headless autonomous Goal/Hive state. Galley Core owns these rows;
-- managed/external GenericAgent runtimes only participate through
-- ordinary Galley sessions and CLI task/event commands.

CREATE TABLE goal_proposals (
  id                       TEXT PRIMARY KEY,
  objective                TEXT NOT NULL,
  project_id               TEXT REFERENCES projects(id) ON DELETE SET NULL,
  budget_seconds           INTEGER NOT NULL,
  worker_limit             INTEGER NOT NULL,
  runtime_kind             TEXT NOT NULL CHECK (runtime_kind IN ('managed','external')),
  write_mode               TEXT NOT NULL CHECK (write_mode IN ('autonomous','read_only')),
  status                   TEXT NOT NULL CHECK (status IN ('awaiting_confirmation','started','cancelled')),
  internal_confirm_token   TEXT NOT NULL,
  expires_at               TEXT NOT NULL,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE INDEX goal_proposals_by_status
  ON goal_proposals(status, expires_at DESC);

CREATE TABLE goals (
  id                  TEXT PRIMARY KEY,
  proposal_id         TEXT REFERENCES goal_proposals(id) ON DELETE SET NULL,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  objective           TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN
    ('running','wrapping','completed','stopped','failed')),
  budget_seconds      INTEGER NOT NULL,
  worker_limit        INTEGER NOT NULL,
  runtime_kind        TEXT NOT NULL CHECK (runtime_kind IN ('managed','external')),
  write_mode          TEXT NOT NULL CHECK (write_mode IN ('autonomous','read_only')),
  started_at          TEXT NOT NULL,
  deadline_at         TEXT NOT NULL,
  ended_at            TEXT,
  latest_summary      TEXT,
  stop_requested      INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX goals_by_status
  ON goals(status, deadline_at ASC);

CREATE INDEX goals_by_project
  ON goals(project_id, status);

CREATE TABLE goal_tasks (
  id                 TEXT PRIMARY KEY,
  goal_id            TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  description        TEXT,
  status             TEXT NOT NULL CHECK (status IN
    ('open','claimed','running','completed','blocked','cancelled')),
  owner_session_id   TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  scope              TEXT,
  result_summary     TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE INDEX goal_tasks_by_goal
  ON goal_tasks(goal_id, status, updated_at DESC);

CREATE INDEX goal_tasks_by_owner
  ON goal_tasks(owner_session_id) WHERE owner_session_id IS NOT NULL;

CREATE TABLE goal_events (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id            TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  task_id            TEXT REFERENCES goal_tasks(id) ON DELETE SET NULL,
  author_session_id  TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  event_type         TEXT NOT NULL CHECK (event_type IN
    ('plan','claim','progress','result','conflict','synthesis','system')),
  body               TEXT NOT NULL,
  created_at         TEXT NOT NULL
);

CREATE INDEX goal_events_by_goal
  ON goal_events(goal_id, id DESC);
