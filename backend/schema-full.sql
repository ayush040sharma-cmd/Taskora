-- Run this file to initialize the database
-- psql -U postgres -d kanban_db -f schema.sql

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspaces (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'todo' CHECK (status IN ('todo', 'inprogress', 'done')),
  priority VARCHAR(50) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date DATE,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- ── Schema v2 Migration ──────────────────────────────────────────────────────
-- Run: psql -U ayushsharma -d kanban_db -f backend/schema-v2.sql

-- Add progress, type, estimated_days, start_date, completed_at to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress       INTEGER DEFAULT 0
  CHECK (progress >= 0 AND progress <= 100);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS type           VARCHAR(50) DEFAULT 'normal'
  CHECK (type IN ('normal', 'upgrade', 'rfp'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_days INTEGER DEFAULT 3;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date     DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at   TIMESTAMP;

-- Add max_capacity to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_capacity INTEGER DEFAULT 100;

-- Sprints table
CREATE TABLE IF NOT EXISTS sprints (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  goal         TEXT,
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  status       VARCHAR(50) DEFAULT 'planning'
    CHECK (status IN ('planning', 'active', 'completed')),
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Link tasks → sprints
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_id INTEGER REFERENCES sprints(id) ON DELETE SET NULL;

-- Index for fast workload queries
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user ON tasks(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sprint        ON tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_sprints_workspace   ON sprints(workspace_id);
-- ============================================================
--  Taskora v3 — Workload Management & Capacity Planning
--  Run this after schema.sql + schema-v2.sql
-- ============================================================

-- ── 1. Roles on users ────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'team_member';
-- Roles: 'team_member' | 'manager' | 'super_boss'

-- ── 2. User capacity settings ────────────────────────────────
CREATE TABLE IF NOT EXISTS user_capacity (
  user_id               INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_hours           NUMERIC(4,1)  DEFAULT 8.0,
  customer_facing_hours NUMERIC(4,1)  DEFAULT 5.0,
  internal_hours        NUMERIC(4,1)  DEFAULT 3.0,
  travel_mode           BOOLEAN       DEFAULT FALSE,
  travel_hours          NUMERIC(4,1)  DEFAULT 2.0,
  on_leave              BOOLEAN       DEFAULT FALSE,
  leave_start           DATE,
  leave_end             DATE,
  -- Default allocation limits per type
  max_rfp               INTEGER       DEFAULT 1,
  max_proposals         INTEGER       DEFAULT 2,
  max_presentations     INTEGER       DEFAULT 2,
  max_upgrades          INTEGER       DEFAULT 2,
  updated_at            TIMESTAMPTZ   DEFAULT NOW()
);

-- ── 3. Extend tasks table ────────────────────────────────────
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(6,1);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours    NUMERIC(6,1);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date      DATE;
-- 'pending_approval' is a valid status alongside todo/inprogress/done
-- No schema change needed — status is already VARCHAR

-- ── 4. Effort logs (per-day time tracking → feeds AI) ────────
CREATE TABLE IF NOT EXISTS effort_logs (
  id           SERIAL PRIMARY KEY,
  task_id      INTEGER     REFERENCES tasks(id) ON DELETE CASCADE,
  user_id      INTEGER     REFERENCES users(id),
  logged_hours NUMERIC(5,1),
  log_date     DATE        DEFAULT CURRENT_DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. Approvals ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approvals (
  id               SERIAL PRIMARY KEY,
  task_id          INTEGER     REFERENCES tasks(id) ON DELETE CASCADE,
  workspace_id     INTEGER     REFERENCES workspaces(id),
  requested_by     INTEGER     REFERENCES users(id),   -- super_boss who requested
  assigned_to      INTEGER     REFERENCES users(id),   -- user task is assigned to
  approver_id      INTEGER     REFERENCES users(id),   -- manager/Nishanth who approves
  status           VARCHAR(20) DEFAULT 'pending',      -- pending | approved | rejected
  justification    TEXT,                               -- override justification
  rejection_reason TEXT,
  requested_at     TIMESTAMPTZ DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ
);

-- ── 6. Notifications (in-app) ────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(50),
  -- Types: task_assigned | approval_pending | approval_resolved |
  --        overload_warning | sla_alert | leave_blocked
  title      TEXT        NOT NULL,
  body       TEXT,
  data       JSONB       DEFAULT '{}',
  read       BOOLEAN     DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read, created_at DESC);

-- ── 7. Audit logs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id           SERIAL PRIMARY KEY,
  workspace_id INTEGER     REFERENCES workspaces(id),
  actor_id     INTEGER     REFERENCES users(id),
  action       VARCHAR(100),
  -- Actions: task_assigned | task_unassigned | task_override |
  --          approval_requested | approval_approved | approval_rejected |
  --          capacity_changed | travel_mode_on | leave_started
  target_type  VARCHAR(50),
  target_id    INTEGER,
  meta         JSONB       DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_ws ON audit_logs(workspace_id, created_at DESC);

-- ── 8. Workspace members (team collaboration) ─────────────────
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id INTEGER     REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      INTEGER     REFERENCES users(id)      ON DELETE CASCADE,
  role         VARCHAR(20) DEFAULT 'team_member',
  invited_by   INTEGER     REFERENCES users(id),
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

-- Auto-insert workspace owner as member when workspace is created
-- (Run once for existing workspaces)
INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT id, user_id, 'manager'
FROM   workspaces
ON CONFLICT DO NOTHING;

-- Auto-create capacity row for existing users
INSERT INTO user_capacity (user_id)
SELECT id FROM users
ON CONFLICT DO NOTHING;
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
-- Schema v6: Integration Layer
-- Run after schema-v5.sql

-- ── workspace_integrations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_integrations (
  id            SERIAL PRIMARY KEY,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type          VARCHAR(50) NOT NULL,          -- 'slack' | 'github' | 'email' | 'jira'
  enabled       BOOLEAN NOT NULL DEFAULT false,
  config        JSONB NOT NULL DEFAULT '{}',   -- type-specific config (webhook_url, token, etc.)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, type)
);

-- ── integration_events log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_events (
  id             SERIAL PRIMARY KEY,
  workspace_id   INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_type VARCHAR(50),
  event_type     VARCHAR(100),                 -- 'slack_notification_sent', 'github_commit_linked', etc.
  payload        JSONB,
  status         VARCHAR(20) DEFAULT 'ok',     -- 'ok' | 'error'
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_events_workspace
  ON integration_events(workspace_id, created_at DESC);
-- Schema v7: Agent runs log + NL query support
-- Run after schema-v6.sql

CREATE TABLE IF NOT EXISTS agent_runs (
  id             SERIAL PRIMARY KEY,
  agent_name     VARCHAR(60) NOT NULL,
  workspace_id   INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
  result         JSONB,
  status         VARCHAR(20) DEFAULT 'ok',
  error_message  TEXT,
  ran_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_name_time
  ON agent_runs(agent_name, ran_at DESC);

-- Add conflict target to notifications if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_user_task_unique'
  ) THEN
    -- Only add if the column exists and table has data structure expected
    NULL;
  END IF;
END$$;
