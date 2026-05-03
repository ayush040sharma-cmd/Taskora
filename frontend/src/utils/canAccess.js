import { FEATURES, PLAN_RANK } from "../config/features";
import { ROLE_PERMISSIONS } from "../config/permissions";

/**
 * Check if a user's plan meets the feature requirement.
 * @param {string} feature  — key from FEATURES config
 * @param {string} plan     — user's plan: 'free' | 'pro' | 'enterprise'
 */
export function canAccess(feature, plan = "free") {
  const required = FEATURES[feature];
  if (!required) return true; // unknown feature = no gate
  return PLAN_RANK[plan] >= PLAN_RANK[required];
}

/**
 * Check if a role has a specific permission.
 * @param {string} permission — key from ROLE_PERMISSIONS[role]
 * @param {string} role       — user's onboarding_role
 */
export function hasPermission(permission, role = "member") {
  const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.member;
  return !!perms[permission];
}

/**
 * Check if a sidebar view should be visible for this role.
 */
export function canViewSidebar(viewId, role = "member") {
  const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.member;
  return perms.sidebarViews?.includes(viewId) ?? true;
}

/**
 * Required plan label for a feature.
 */
export function requiredPlan(feature) {
  return FEATURES[feature] || "free";
}
