/**
 * Feature → minimum required plan mapping.
 * All features are open to everyone — no plan gates.
 */
export const FEATURES = {
  board:         "free",
  summary:       "free",
  calendar:      "free",
  activity:      "free",
  gantt:         "free",
  sprints:       "free",
  approvals:     "free",
  manager:       "free",
  "ai-risk":     "free",
  simulation:    "free",
  integrations:  "free",
  workload:      "free",
  nlquery:       "free",
  aiAssistant:   "free",
  members:       "free",
  analytics:     "free",
  capacity:      "free",
  graph:         "free",
  collaboration: "free",
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
