/**
 * Role-based UI permissions.
 * onboarding_role: 'solo' | 'member' | 'manager'
 */
export const ROLE_PERMISSIONS = {
  solo: {
    canViewManager:  false,
    canViewSprints:  false,
    canInviteUsers:  false,
    managerTabs:     [],
    sidebarViews:    ["board", "summary", "calendar", "gantt", "ai-risk", "activity"],
  },
  member: {
    canViewManager:  true,
    canViewSprints:  true,
    canInviteUsers:  false,
    managerTabs:     ["overview", "members"],
    sidebarViews:    ["board", "summary", "calendar", "sprints", "manager", "gantt", "ai-risk", "activity"],
  },
  manager: {
    canViewManager:  true,
    canViewSprints:  true,
    canInviteUsers:  true,
    managerTabs:     ["overview", "workload", "capacity", "members", "approvals", "analytics"],
    sidebarViews:    ["board", "summary", "calendar", "sprints", "manager", "gantt", "ai-risk", "integrations", "activity", "simulation"],
  },
};

export function getRolePermissions(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.member;
}
