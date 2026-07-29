import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { hasPermission } from "../utils/canAccess";

const ROLE_LEVELS = { team_member: 1, manager: 2, super_boss: 3 };

/**
 * RoleRoute — wraps a route that requires a minimum role or specific permission.
 *
 * Usage (permission-based, preferred):
 *   <RoleRoute permission="admin:access_panel"><AdminPage /></RoleRoute>
 *
 * Usage (role-based):
 *   <RoleRoute minRole="manager"><ManagerPage /></RoleRoute>
 */
export default function RoleRoute({ children, permission, minRole }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  if (permission && !hasPermission(permission, user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (minRole) {
    const userLevel = ROLE_LEVELS[user.role] || 0;
    const reqLevel  = ROLE_LEVELS[minRole]   || 0;
    if (userLevel < reqLevel) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return children;
}
