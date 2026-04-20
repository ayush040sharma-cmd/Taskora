/**
 * Role-Based Access Control middleware
 * Usage: router.post("/route", auth, rbac("manager"), handler)
 */

const ROLE_HIERARCHY = { team_member: 1, manager: 2, super_boss: 3 };

/**
 * requireRole(minRole) — user must have >= minRole in hierarchy
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const userRole = req.user?.role || "team_member";
    if (allowedRoles.includes(userRole)) return next();
    return res.status(403).json({
      message: `Access denied. Required role: ${allowedRoles.join(" or ")}. Your role: ${userRole}`,
    });
  };
}

/**
 * requireMinRole(minRole) — user must have at least this level
 */
function requireMinRole(minRole) {
  return (req, res, next) => {
    const userLevel = ROLE_HIERARCHY[req.user?.role] || 0;
    const minLevel  = ROLE_HIERARCHY[minRole]        || 0;
    if (userLevel >= minLevel) return next();
    return res.status(403).json({
      message: `Insufficient permissions. Required: ${minRole}+. Your role: ${req.user?.role}`,
    });
  };
}

module.exports = { requireRole, requireMinRole };
