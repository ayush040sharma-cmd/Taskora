-- ============================================================
--  Taskora v11 — Enterprise Foundation v1.1
--  Teams, Blocked Workflow, Task Import/Export, Workspace Templates
--  Run this after schema-v10.sql
-- ============================================================

-- ── 1. Teams ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id           SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  description  TEXT,
  color        VARCHAR(20) DEFAULT '#6366f1',
  icon         VARCHAR(10) DEFAULT '👥',
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_teams_workspace ON teams(workspace_id);

-- ── 2. Team Members ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_members (
  team_id  INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     VARCHAR(20) DEFAULT 'member',
  added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

-- ── 3. Add team_id to tasks ───────────────────────────────────
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id);

-- ── 4. Blocked Workflow fields on tasks ───────────────────────
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_by_task_id        INTEGER REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_reason             TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_severity           VARCHAR(20) DEFAULT 'medium';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_expected_resolution DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS date_blocked               TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS unblocked_at               TIMESTAMPTZ;

-- ── 5. Import / Export logs ───────────────────────────────────
CREATE TABLE IF NOT EXISTS import_logs (
  id            SERIAL PRIMARY KEY,
  workspace_id  INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  import_type   VARCHAR(20) DEFAULT 'tasks',
  filename      VARCHAR(255),
  total_rows    INTEGER DEFAULT 0,
  created_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  error_count   INTEGER DEFAULT 0,
  errors        JSONB DEFAULT '[]',
  status        VARCHAR(20) DEFAULT 'completed',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_logs_workspace ON import_logs(workspace_id, created_at DESC);

-- ── 6. Workspace Templates ────────────────────────────────────
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS template VARCHAR(50);

-- ── 7. Email field on workspace_invites ──────────────────────
ALTER TABLE workspace_invites ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- ── 8. Performance index for blocked analytics ───────────────
CREATE INDEX IF NOT EXISTS idx_tasks_status_workspace
  ON tasks(workspace_id, status);
