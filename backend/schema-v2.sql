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
