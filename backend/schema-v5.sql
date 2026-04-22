-- ============================================================
--  Taskora v5 — AI Fields + Task Dependencies + Workload Logs
--  Run this after schema.sql + schema-v2.sql + schema-v3.sql + schema-v4.sql
-- ============================================================

-- ── 1. AI fields on tasks ────────────────────────────────────
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS risk_score         NUMERIC(5,2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS delay_probability  NUMERIC(4,3);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS confidence_score   NUMERIC(4,3);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ai_suggestion      TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ai_last_analyzed_at TIMESTAMPTZ;

-- ── 2. Task dependencies ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_dependencies (
  id                  SERIAL PRIMARY KEY,
  task_id             INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_type     VARCHAR(20) DEFAULT 'finish_to_start',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);
CREATE INDEX IF NOT EXISTS idx_task_deps_task    ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_depends ON task_dependencies(depends_on_task_id);

-- ── 3. Workload logs (daily aggregated load per user) ────────
CREATE TABLE IF NOT EXISTS workload_logs (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id    INTEGER     REFERENCES workspaces(id) ON DELETE CASCADE,
  date            DATE        NOT NULL,
  scheduled_hours NUMERIC(5,2) DEFAULT 0,
  actual_hours    NUMERIC(5,2) DEFAULT 0,
  capacity_hours  NUMERIC(5,2) DEFAULT 8,
  overload_flag   BOOLEAN     DEFAULT FALSE,
  source          VARCHAR(20) DEFAULT 'task',
  -- source: 'task' | 'leave' | 'travel' | 'meeting'
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date, source)
);
CREATE INDEX IF NOT EXISTS idx_wl_logs_user_date ON workload_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_wl_logs_ws        ON workload_logs(workspace_id, date);

-- ── 4. AI predictions store ──────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_predictions (
  id               SERIAL PRIMARY KEY,
  task_id          INTEGER     REFERENCES tasks(id) ON DELETE CASCADE,
  prediction_type  VARCHAR(50) NOT NULL,
  -- Types: delay_probability | risk_score | completion_estimate
  predicted_value  NUMERIC(6,3),
  predicted_label  VARCHAR(100),
  confidence       NUMERIC(4,3),
  model_version    VARCHAR(20) DEFAULT 'v1-rules',
  features_used    JSONB,
  reasoning        TEXT,
  suggestions      JSONB,   -- array of suggestion strings
  ai_fallback      BOOLEAN  DEFAULT TRUE,
  was_correct      BOOLEAN,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_pred_task ON ai_predictions(task_id, created_at DESC);

-- ── 5. Extend users for workload intelligence ─────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_capacity_hours NUMERIC(4,2) DEFAULT 8.0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone             VARCHAR(50)  DEFAULT 'UTC';
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_load_score   NUMERIC(5,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at        TIMESTAMPTZ;

-- ── 6. Extend workspaces ──────────────────────────────────────
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS slug     VARCHAR(100);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS plan     VARCHAR(20) DEFAULT 'free';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS settings JSONB       DEFAULT '{}';

-- Make slug unique where not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug) WHERE slug IS NOT NULL;

-- ── 7. Performance indexes ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee  ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date  ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_notif_user_read ON notifications(user_id, read, created_at DESC);
