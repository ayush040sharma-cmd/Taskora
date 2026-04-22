-- ============================================================
--  Taskora v4 — Subtasks + Calendar Events + Effort Log ext.
--  Run this after schema.sql + schema-v2.sql + schema-v3.sql
-- ============================================================

-- ── 1. Subtasks ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subtasks (
  id          SERIAL      PRIMARY KEY,
  task_id     INTEGER     NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  done        BOOLEAN     DEFAULT FALSE,
  position    INTEGER     DEFAULT 0,
  created_by  INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id, position);

-- ── 2. Calendar Events ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
  id           SERIAL      PRIMARY KEY,
  workspace_id INTEGER     REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      INTEGER     REFERENCES users(id)       ON DELETE SET NULL,
  title        TEXT        NOT NULL,
  description  TEXT,
  start_date   DATE        NOT NULL,
  end_date     DATE,
  type         VARCHAR(30) DEFAULT 'event',
  -- Types: event | meeting | deadline | milestone | leave | travel
  color        VARCHAR(20) DEFAULT '#6366f1',
  task_id      INTEGER     REFERENCES tasks(id)       ON DELETE SET NULL,
  all_day      BOOLEAN     DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cal_ws   ON calendar_events(workspace_id, start_date);
CREATE INDEX IF NOT EXISTS idx_cal_user ON calendar_events(user_id, start_date);

-- ── 3. Extra task columns (safe additions) ───────────────────
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(6,1);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours    NUMERIC(6,1);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence      VARCHAR(20);
-- recurrence: null | daily | weekly | monthly

-- ── 4. Effort logs already created in v3, add index if missing
CREATE INDEX IF NOT EXISTS idx_effort_task ON effort_logs(task_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_effort_user ON effort_logs(user_id, log_date DESC);
