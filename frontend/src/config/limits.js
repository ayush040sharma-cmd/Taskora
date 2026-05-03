/**
 * Plan usage limits.
 * Infinity = unlimited.
 */
export const LIMITS = {
  free: {
    projects:        3,
    tasksPerProject: 10,
    members:         3,
    aiRequests:      0,
  },
  pro: {
    projects:        Infinity,
    tasksPerProject: Infinity,
    members:         25,
    aiRequests:      500,
  },
  enterprise: {
    projects:        Infinity,
    tasksPerProject: Infinity,
    members:         Infinity,
    aiRequests:      Infinity,
  },
};

export function getLimit(plan, key) {
  return LIMITS[plan]?.[key] ?? LIMITS.free[key];
}

export function isAtLimit(plan, key, currentCount) {
  const limit = getLimit(plan, key);
  return limit !== Infinity && currentCount >= limit;
}
