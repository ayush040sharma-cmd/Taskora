/**
 * Feature → minimum required plan mapping.
 * 'free' = everyone, 'pro' = pro+enterprise, 'enterprise' = enterprise only
 */
export const FEATURES = {
  board:         "free",
  summary:       "free",
  calendar:      "free",
  activity:      "free",
  gantt:         "pro",
  sprints:       "pro",
  approvals:     "pro",
  manager:       "free",
  "ai-risk":     "enterprise",
  simulation:    "enterprise",
  integrations:  "enterprise",
  workload:      "enterprise",
  nlquery:       "enterprise",
  aiAssistant:   "enterprise",
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
