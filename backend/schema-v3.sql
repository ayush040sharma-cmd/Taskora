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
