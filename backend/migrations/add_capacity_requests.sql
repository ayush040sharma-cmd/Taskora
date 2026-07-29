-- Migration: add capacity_requests table
-- Run once on Neon.tech or any PostgreSQL instance
-- This enables the leave/travel approval workflow for non-manager users

CREATE TABLE IF NOT EXISTS capacity_requests (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id     INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  manager_id       INTEGER REFERENCES users(id),
  request_type     VARCHAR(20) NOT NULL CHECK (request_type IN ('leave', 'travel')),
  status           VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  -- Leave fields
  leave_start      DATE,
  leave_end        DATE,
  -- Travel fields
  travel_hours     INTEGER DEFAULT 2,
  justification    TEXT,
  rejection_reason TEXT,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cap_req_workspace ON capacity_requests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cap_req_user      ON capacity_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_cap_req_status    ON capacity_requests(status);
