/**
 * Role-Based Access Control middleware
 *
 * Platform roles (users.role):
 *   team_member  — regular employee
 *   manager      — team manager; can access Manager View, team reports, capacity
 *   super_boss   — system admin; full access including Admin Panel
 */

const ROLE_HIERARCHY = { team_member: 1, manager: 2, super_boss: 3 };

// Canonical permission sets per platform role.
// Keep in sync with frontend/src/utils/canAccess.js PLATFORM_PERMISSIONS.
const ROLE_PERMISSIONS = {
  super_boss: new Set([
    "task:view", "task:create", "task:edit_own", "task:edit_any",
    "task:delete_own", "task:delete_any", "task:assign",
    "report:view_own", "report:view_team", "report:view_org", "report:export",
    "capacity:view_own", "capacity:view_team", "capacity:edit_team",
    "user:view_list", "user:invite", "user:edit_role", "user:suspend", "user:delete",
    "user:reset_password",
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

/**
 * requireRole(...roles) — user must have one of the exact roles listed.
 * Prefer requirePermission for new routes; use this for legacy role checks.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const userRole = req.user?.role || "team_member";
    if (allowedRoles.includes(userRole)) return next();
    return res.status(403).json({
      message: `Access denied. Required role: ${allowedRoles.join(" or ")}`,
    });
  };
}

/**
 * requireMinRole(minRole) — user must have at least this level in the hierarchy.
 * Example: requireMinRole("manager") allows manager and super_boss.
 */
function requireMinRole(minRole) {
  return (req, res, next) => {
    const userLevel = ROLE_HIERARCHY[req.user?.role] || 0;
    const minLevel  = ROLE_HIERARCHY[minRole]        || 0;
    if (userLevel >= minLevel) return next();
    return res.status(403).json({
      message: `Insufficient permissions. Required: ${minRole}+`,
    });
  };
}

/**
 * requirePermission(key) — user's role must include this permission key.
 * Preferred for new routes; keeps route code decoupled from role names.
 */
function requirePermission(permissionKey) {
  return (req, res, next) => {
    const role  = req.user?.role || "team_member";
    const perms = ROLE_PERMISSIONS[role];
    if (perms && perms.has(permissionKey)) return next();
    return res.status(403).json({
      error:    "Forbidden",
      required: permissionKey,
    });
  };
}

module.exports = { requireRole, requireMinRole, requirePermission, ROLE_PERMISSIONS };
