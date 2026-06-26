/**
 * Frontend permission utilities.
 *
 * These checks are cosmetic (hide UI elements) — the backend enforces the same
 * rules on every API request. Never rely solely on frontend checks for security.
 *
 * Platform roles (users.role): team_member | manager | super_boss
 * Keep PLATFORM_PERMISSIONS in sync with backend/middleware/rbac.js ROLE_PERMISSIONS.
 */

const PLATFORM_PERMISSIONS = {
  super_boss: new Set([
    "task:view", "task:create", "task:edit_own", "task:edit_any",
    "task:delete_own", "task:delete_any", "task:assign",
    "report:view_own", "report:view_team", "report:view_org", "report:export",
    "capacity:view_own", "capacity:view_team", "capacity:edit_team",
    "user:view_list", "user:invite", "user:edit_role", "user:suspend", "user:delete",
    "workspace:view", "workspace:manage_members",
    "admin:access_panel", "admin:view_audit_log", "admin:send_notification",
    "settings:view", "settings:edit",
    "manager:view",
  ]),
  manager: new Set([
    "task:view", "task:create", "task:edit_own", "task:edit_any",
    "task:delete_own", "task:delete_any", "task:assign",
    "report:view_own", "report:view_team",
    "capacity:view_own", "capacity:view_team", "capacity:edit_team",
    "user:view_list", "user:invite",
    "workspace:view", "workspace:manage_members",
    "settings:view",
    "manager:view",
  ]),
  team_member: new Set([
    "task:view", "task:create", "task:edit_own", "task:delete_own",
    "report:view_own",
    "capacity:view_own",
    "workspace:view",
    "settings:view",
  ]),
};

// Sidebar views restricted by minimum role
const MANAGER_ONLY_VIEWS = new Set(["manager", "workload", "analytics", "simulation", "enterprise-approvals"]);
const ADMIN_ONLY_VIEWS   = new Set(["access-control"]);

const ROLE_LEVELS = { team_member: 1, manager: 2, super_boss: 3 };

/**
 * Check if a platform role has a specific permission key.
 * @param {string} permission — e.g. 'manager:view', 'task:edit_any'
 * @param {string} role       — users.role: 'team_member' | 'manager' | 'super_boss'
 */
export function hasPermission(permission, role = "team_member") {
  const perms = PLATFORM_PERMISSIONS[role] || PLATFORM_PERMISSIONS.team_member;
  return perms.has(permission);
}

/**
 * Check if a sidebar view should be visible for this platform role.
 * @param {string} viewId — sidebar view id e.g. 'manager', 'board'
 * @param {string} role   — users.role
 */
export function canViewSidebar(viewId, role = "team_member") {
  if (ADMIN_ONLY_VIEWS.has(viewId))   return role === "super_boss";
  if (MANAGER_ONLY_VIEWS.has(viewId)) return (ROLE_LEVELS[role] || 0) >= ROLE_LEVELS.manager;
  return true;
}

// Plan gating not enforced yet — kept for API compatibility
export function canAccess(_feature, _plan = "free", _isAdmin = false) {
  return true;
}

export function requiredPlan(_feature) {
  return "free";
}
