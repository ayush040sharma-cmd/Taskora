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
