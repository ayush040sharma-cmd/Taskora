import { FEATURES, PLAN_RANK } from "../config/features";

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
const MANAGER_ONLY_VIEWS = new Set(["manager", "workload", "members", "approvals", "ai-risk", "analytics", "simulation"]);
const ADMIN_ONLY_VIEWS   = new Set([]);

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
 * customViews (optional Set) — view IDs granted via custom roles from the backend.
 * A custom-role grant can unlock restricted views regardless of platform role.
 */
export function canViewSidebar(viewId, role = "team_member", customViews = null) {
  if (customViews && customViews.has(viewId)) return true;
  if (ADMIN_ONLY_VIEWS.has(viewId))   return role === "super_boss";
  if (MANAGER_ONLY_VIEWS.has(viewId)) return (ROLE_LEVELS[role] || 0) >= ROLE_LEVELS.manager;
  return true;
}

export function canAccess(feature, plan = "free", isAdmin = false) {
  if (isAdmin) return true;
  const required = FEATURES[feature];
  if (!required) return true; // unknown feature → open by default
  return (PLAN_RANK[plan] || 0) >= (PLAN_RANK[required] || 0);
}

export function requiredPlan(feature) {
  return FEATURES[feature] || "free";
}

/**
 * Returns which settings sections are visible for a given platform role.
 * Sections: general | notifications | regional | security | workspace | demo
 *           project | workflow | integrations | user-mgmt
 */
export function canAccessSettingsSection(sectionId, role = "team_member") {
  const level = ROLE_LEVELS[role] || 0;
  if (sectionId === "user-mgmt") return level >= ROLE_LEVELS.super_boss;
  if (["project", "workflow", "integrations"].includes(sectionId)) return level >= ROLE_LEVELS.manager;
  return true; // personal + workspace sections always accessible
}
