/**
 * Feature → minimum required plan mapping.
 * Enforced in canAccess() — keep in sync with backend plan checks.
 */
export const FEATURES = {
  // Free
  board:         "free",
  summary:       "free",
  calendar:      "free",
  activity:      "free",
  members:       "free",
  workload:      "free",
  manager:       "free",
  analytics:     "free",
  approvals:     "free",
  // Pro
  gantt:         "pro",
  sprints:       "pro",
  capacity:      "pro",
  nlquery:       "pro",
  aiAssistant:   "pro",
  collaboration: "pro",
  // Enterprise
  "ai-risk":     "enterprise",
  simulation:    "enterprise",
  integrations:  "enterprise",
  graph:         "enterprise",
};

export const PLAN_RANK = { free: 0, pro: 1, enterprise: 2 };

export const PLAN_LABELS = {
  free:       "Free",
  pro:        "Pro",
  enterprise: "Enterprise",
};

export const PLAN_COLORS = {
  free:       "text-slate-400",
  pro:        "text-indigo-400",
  enterprise: "text-violet-400",
};
