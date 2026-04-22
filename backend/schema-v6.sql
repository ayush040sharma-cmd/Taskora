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
