-- ============================================================
-- Taskora Enterprise RBAC Migration
-- Run once against the live database
-- ============================================================

-- 1. ROLES -------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(100) UNIQUE NOT NULL,
  display_name   VARCHAR(150) NOT NULL,
  description    TEXT,
  color          VARCHAR(20)  DEFAULT '#6366f1',
  is_system      BOOLEAN      DEFAULT FALSE,
  parent_role_id INTEGER      REFERENCES roles(id) ON DELETE SET NULL,
  created_by     INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ  DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  DEFAULT NOW()
);

-- 2. PERMISSIONS CATALOG -----------------------------------------
CREATE TABLE IF NOT EXISTS permissions_catalog (
  id           SERIAL PRIMARY KEY,
  key          VARCHAR(200) UNIQUE NOT NULL,
  module       VARCHAR(60)  NOT NULL,
  action       VARCHAR(50)  NOT NULL,
  label        VARCHAR(150) NOT NULL,
  description  TEXT,
  is_sensitive BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ROLE → PERMISSION MAP ----------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions_map (
  id             SERIAL PRIMARY KEY,
  role_id        INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key VARCHAR(200) NOT NULL REFERENCES permissions_catalog(key) ON DELETE CASCADE,
  data_scope     VARCHAR(20) DEFAULT 'self'
                 CHECK (data_scope IN ('self','team','department','project','org')),
  UNIQUE (role_id, permission_key)
);

-- 4. USER → ROLE ASSIGNMENT ---------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id      INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  assigned_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, role_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);

-- 5. USER PERMISSION OVERRIDES ------------------------------------
CREATE TABLE IF NOT EXISTS user_permission_overrides (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key VARCHAR(200) NOT NULL REFERENCES permissions_catalog(key) ON DELETE CASCADE,
  granted        BOOLEAN NOT NULL,
  data_scope     VARCHAR(20) DEFAULT 'self',
  workspace_id   INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  granted_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason         TEXT,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, permission_key, workspace_id)
);

-- 6. DEPARTMENTS --------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id           SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  head_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TEAMS --------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_teams (
  id            SERIAL PRIMARY KEY,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  name          VARCHAR(100) NOT NULL,
  manager_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 8. TEAM MEMBERS -------------------------------------------------
CREATE TABLE IF NOT EXISTS org_team_members (
  team_id   INTEGER NOT NULL REFERENCES org_teams(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      VARCHAR(20) DEFAULT 'member' CHECK (role IN ('lead','member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

-- 9. PERMISSION TEMPLATES ----------------------------------------
CREATE TABLE IF NOT EXISTS permission_templates (
  id           SERIAL PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  description  TEXT,
  base_role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permission_template_items (
  id             SERIAL PRIMARY KEY,
  template_id    INTEGER NOT NULL REFERENCES permission_templates(id) ON DELETE CASCADE,
  permission_key VARCHAR(200) NOT NULL REFERENCES permissions_catalog(key) ON DELETE CASCADE,
  granted        BOOLEAN NOT NULL DEFAULT TRUE,
  data_scope     VARCHAR(20) DEFAULT 'self'
);

-- 10. GENERIC APPROVAL ENGINE ------------------------------------
CREATE TABLE IF NOT EXISTS approval_requests (
  id            SERIAL PRIMARY KEY,
  type          VARCHAR(60) NOT NULL,
  workspace_id  INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  requester_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  approver_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status        VARCHAR(20) DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','cancelled','escalated','info_requested')),
  subject       VARCHAR(300) NOT NULL,
  description   TEXT,
  metadata      JSONB DEFAULT '{}',
  sla_hours     INTEGER DEFAULT 24,
  due_at        TIMESTAMPTZ,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  escalated_to  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  escalated_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ar_approver  ON approval_requests(approver_id, status);
CREATE INDEX IF NOT EXISTS idx_ar_requester ON approval_requests(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ar_workspace ON approval_requests(workspace_id, created_at DESC);

-- 11. ENTERPRISE PERMISSION AUDIT LOG ----------------------------
CREATE TABLE IF NOT EXISTS permission_audit_log (
  id             SERIAL PRIMARY KEY,
  workspace_id   INTEGER REFERENCES workspaces(id),
  actor_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action         VARCHAR(100) NOT NULL,
  entity_type    VARCHAR(50),
  entity_id      INTEGER,
  old_value      JSONB,
  new_value      JSONB,
  ip_address     TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pal_target    ON permission_audit_log(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pal_workspace ON permission_audit_log(workspace_id, created_at DESC);

-- 12. EXTEND USERS TABLE -----------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_team_id   INTEGER REFERENCES org_teams(id)  ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_id    INTEGER REFERENCES users(id)       ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status        VARCHAR(20) DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title     VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id   VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url    TEXT;

-- ================================================================
-- SEED: Default System Roles
-- ================================================================
INSERT INTO roles (name, display_name, description, color, is_system) VALUES
  ('super_admin', 'Super Admin',  'Full system access — billing, users, all data',           '#ef4444', TRUE),
  ('admin',       'Admin',        'Manages users, roles, workspaces, audit logs',             '#f97316', TRUE),
  ('manager',     'Manager',      'Team management, approvals, reports, capacity planning',   '#6366f1', TRUE),
  ('team_lead',   'Team Lead',    'Leads a sub-team; can assign tasks, view team reports',    '#8b5cf6', TRUE),
  ('employee',    'Employee',     'Standard user — create and manage own tasks',              '#06b6d4', TRUE),
  ('viewer',      'Viewer',       'Read-only access to assigned workspaces',                  '#64748b', TRUE)
ON CONFLICT (name) DO NOTHING;

-- ================================================================
-- SEED: Permissions Catalog
-- ================================================================
INSERT INTO permissions_catalog (key, module, action, label) VALUES
  -- Dashboard
  ('dashboard:view',               'dashboard',       'view',      'View Dashboard'),
  -- Tasks
  ('tasks:view',                   'tasks',           'view',      'View Tasks'),
  ('tasks:create',                 'tasks',           'create',    'Create Tasks'),
  ('tasks:edit',                   'tasks',           'edit',      'Edit Tasks'),
  ('tasks:delete',                 'tasks',           'delete',    'Delete Tasks'),
  ('tasks:assign',                 'tasks',           'assign',    'Assign Tasks'),
  ('tasks:export',                 'tasks',           'export',    'Export Tasks'),
  ('tasks:approve',                'tasks',           'approve',   'Approve Task Completion'),
  -- Reports
  ('reports:view',                 'reports',         'view',      'View Reports'),
  ('reports:export',               'reports',         'export',    'Export Reports'),
  -- Analytics
  ('analytics:view',               'analytics',       'view',      'View Analytics'),
  ('analytics:export',             'analytics',       'export',    'Export Analytics'),
  -- Team Management
  ('team_management:view',         'team_management', 'view',      'View Team Management'),
  ('team_management:edit',         'team_management', 'edit',      'Edit Team Settings'),
  ('team_management:assign',       'team_management', 'assign',    'Assign Team Members'),
  -- User Management
  ('user_management:view',         'user_management', 'view',      'View User Management'),
  ('user_management:create',       'user_management', 'create',    'Create Users'),
  ('user_management:edit',         'user_management', 'edit',      'Edit Users'),
  ('user_management:delete',       'user_management', 'delete',    'Delete/Deactivate Users'),
  ('user_management:assign_roles', 'user_management', 'assign',    'Assign Roles to Users'),
  -- Access Control
  ('access_control:view',          'access_control',  'view',      'View Access Control'),
  ('access_control:configure',     'access_control',  'configure', 'Configure Permissions & Roles'),
  -- Approvals
  ('approvals:view',               'approvals',       'view',      'View Approval Requests'),
  ('approvals:approve',            'approvals',       'approve',   'Approve / Reject Requests'),
  ('approvals:request',            'approvals',       'create',    'Submit Approval Requests'),
  -- Settings
  ('settings:view',                'settings',        'view',      'View Settings'),
  ('settings:configure',           'settings',        'configure', 'Configure Workspace Settings'),
  -- Billing
  ('billing:view',                 'billing',         'view',      'View Billing & Plans'),
  ('billing:configure',            'billing',         'configure', 'Manage Billing & Subscriptions'),
  -- Audit Logs
  ('audit_logs:view',              'audit_logs',      'view',      'View Audit Logs'),
  ('audit_logs:export',            'audit_logs',      'export',    'Export Audit Logs'),
  -- Workspace
  ('workspace:manage',             'workspace',       'configure', 'Manage Workspace Settings'),
  -- Integrations
  ('integrations:view',            'integrations',    'view',      'View Integrations'),
  ('integrations:configure',       'integrations',    'configure', 'Configure Integrations'),
  -- Sprints
  ('sprints:view',                 'sprints',         'view',      'View Sprints'),
  ('sprints:manage',               'sprints',         'configure', 'Manage Sprints')
ON CONFLICT (key) DO NOTHING;

-- ================================================================
-- SEED: Role → Permission Mappings
-- ================================================================

-- super_admin: ALL permissions, org scope
INSERT INTO role_permissions_map (role_id, permission_key, data_scope)
SELECT r.id, p.key, 'org'
FROM roles r CROSS JOIN permissions_catalog p
WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- admin: all except billing:configure, org scope
INSERT INTO role_permissions_map (role_id, permission_key, data_scope)
SELECT r.id, p.key, 'org'
FROM roles r CROSS JOIN permissions_catalog p
WHERE r.name = 'admin'
  AND p.key NOT IN ('billing:configure')
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- manager: team-scoped for data, full approval + user-view
INSERT INTO role_permissions_map (role_id, permission_key, data_scope)
SELECT r.id, p.key,
  CASE WHEN p.module IN ('tasks','reports','analytics') THEN 'team' ELSE 'self' END
FROM roles r CROSS JOIN permissions_catalog p
WHERE r.name = 'manager'
  AND p.key IN (
    'dashboard:view','tasks:view','tasks:create','tasks:edit','tasks:delete',
    'tasks:assign','tasks:approve','tasks:export',
    'reports:view','reports:export','analytics:view',
    'team_management:view','team_management:assign',
    'approvals:view','approvals:approve','approvals:request',
    'settings:view','user_management:view','access_control:view',
    'sprints:view','sprints:manage','integrations:view'
  )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- team_lead
INSERT INTO role_permissions_map (role_id, permission_key, data_scope)
SELECT r.id, p.key,
  CASE WHEN p.module = 'tasks' THEN 'team' ELSE 'self' END
FROM roles r CROSS JOIN permissions_catalog p
WHERE r.name = 'team_lead'
  AND p.key IN (
    'dashboard:view','tasks:view','tasks:create','tasks:edit','tasks:assign',
    'tasks:approve','reports:view','team_management:view',
    'approvals:view','approvals:approve','approvals:request',
    'settings:view','sprints:view'
  )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- employee: self only
INSERT INTO role_permissions_map (role_id, permission_key, data_scope)
SELECT r.id, p.key, 'self'
FROM roles r CROSS JOIN permissions_catalog p
WHERE r.name = 'employee'
  AND p.key IN (
    'dashboard:view','tasks:view','tasks:create','tasks:edit',
    'approvals:request','settings:view','sprints:view'
  )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- viewer: read-only, self
INSERT INTO role_permissions_map (role_id, permission_key, data_scope)
SELECT r.id, p.key, 'self'
FROM roles r CROSS JOIN permissions_catalog p
WHERE r.name = 'viewer'
  AND p.key IN ('dashboard:view','tasks:view','reports:view')
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ================================================================
-- MIGRATE existing users to enterprise roles based on users.role
-- ================================================================
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.name = CASE
  WHEN u.role = 'super_boss' THEN 'admin'
  WHEN u.role = 'manager'    THEN 'manager'
  ELSE 'employee'
END
ON CONFLICT (user_id, role_id, workspace_id) DO NOTHING;
