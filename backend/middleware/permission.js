/**
 * Enterprise Permission Evaluation Middleware
 *
 * Resolves a user's effective permissions by merging:
 *   1. All role_permissions_map rows for the user's active roles
 *   2. user_permission_overrides rows (+grant or -revoke)
 *
 * Falls back to legacy users.role if the user has no enterprise roles.
 *
 * Usage:
 *   router.get('/route', auth, requirePerm('tasks:delete'), handler)
 *   router.get('/route', auth, requirePerm('reports:export', 'team'), handler)
 */

const pool = require("../db");

// Legacy role → enterprise permissions fallback (mirrors rbac.js, kept for safety)
const LEGACY_FALLBACK = {
  super_boss: new Set([
    "dashboard:view","tasks:view","tasks:create","tasks:edit","tasks:delete",
    "tasks:assign","tasks:approve","tasks:export","reports:view","reports:export",
    "analytics:view","analytics:export","team_management:view","team_management:edit",
    "team_management:assign","user_management:view","user_management:create",
    "user_management:edit","user_management:delete","user_management:assign_roles",
    "access_control:view","access_control:configure","approvals:view","approvals:approve",
    "approvals:request","settings:view","settings:configure","billing:view",
    "audit_logs:view","audit_logs:export","workspace:manage","integrations:view",
    "integrations:configure","sprints:view","sprints:manage",
  ]),
  manager: new Set([
    "dashboard:view","tasks:view","tasks:create","tasks:edit","tasks:delete",
    "tasks:assign","tasks:approve","tasks:export","reports:view","reports:export",
    "analytics:view","team_management:view","team_management:assign",
    "user_management:view","access_control:view","approvals:view","approvals:approve",
    "approvals:request","settings:view","sprints:view","sprints:manage","integrations:view",
  ]),
  team_member: new Set([
    "dashboard:view","tasks:view","tasks:create","tasks:edit",
    "approvals:request","settings:view","sprints:view",
  ]),
};

/**
 * Resolve all effective permissions for a user in a workspace.
 * Returns a Map<permissionKey, { granted: bool, scope: string }>
 */
async function resolvePermissions(userId, workspaceId) {
  try {
    // 1. Role-based permissions (platform-wide OR workspace-scoped roles)
    const rolePerms = await pool.query(
      `SELECT DISTINCT rp.permission_key, rp.data_scope
       FROM user_roles ur
       JOIN role_permissions_map rp ON rp.role_id = ur.role_id
       WHERE ur.user_id = $1
         AND (ur.workspace_id = $2 OR ur.workspace_id IS NULL)
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
      [userId, workspaceId]
    );

    // 2. User-specific overrides
    const overrides = await pool.query(
      `SELECT permission_key, granted, data_scope
       FROM user_permission_overrides
       WHERE user_id = $1
         AND (workspace_id = $2 OR workspace_id IS NULL)
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId, workspaceId]
    );

    const perms = new Map();

    for (const row of rolePerms.rows) {
      perms.set(row.permission_key, { granted: true, scope: row.data_scope });
    }
    for (const row of overrides.rows) {
      if (row.granted) {
        perms.set(row.permission_key, { granted: true, scope: row.data_scope });
      } else {
        perms.delete(row.permission_key);
      }
    }

    return perms;
  } catch {
    return new Map();
  }
}

/**
 * requirePerm(permissionKey, minScope?)
 *
 * minScope (optional): if provided, the user's data_scope for that permission
 * must be at least this level.
 * Scope order: self < team < department < project < org
 */
const SCOPE_RANK = { self: 1, team: 2, department: 3, project: 4, org: 5 };

function requirePerm(permissionKey, minScope = null) {
  return async (req, res, next) => {
    const userId      = req.user?.id;
    const legacyRole  = req.user?.role;
    const workspaceId = req.query.workspace_id || req.body?.workspace_id || req.params?.wsId || null;

    if (!userId) return res.status(401).json({ message: "Unauthenticated" });

    // Try enterprise permission system first
    const perms = await resolvePermissions(userId, workspaceId);

    if (perms.size > 0) {
      const entry = perms.get(permissionKey);
      if (!entry) {
        return res.status(403).json({
          error: "Forbidden",
          required: permissionKey,
          message: `You do not have the '${permissionKey}' permission.`,
        });
      }
      if (minScope && (SCOPE_RANK[entry.scope] || 0) < (SCOPE_RANK[minScope] || 0)) {
        return res.status(403).json({
          error: "Insufficient scope",
          required: permissionKey,
          requiredScope: minScope,
          yourScope: entry.scope,
        });
      }
      // Attach resolved scope to request for data filtering in route handlers
      req.permissionScope = entry.scope;
      return next();
    }

    // Fallback: legacy role check
    const fallback = LEGACY_FALLBACK[legacyRole];
    if (fallback && fallback.has(permissionKey)) {
      req.permissionScope = legacyRole === "super_boss" ? "org"
                          : legacyRole === "manager"    ? "team"
                          : "self";
      return next();
    }

    return res.status(403).json({
      error: "Forbidden",
      required: permissionKey,
      message: `You do not have the '${permissionKey}' permission.`,
    });
  };
}

module.exports = { requirePerm, resolvePermissions };
