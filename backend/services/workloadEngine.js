/**
 * Workload Engine v4 — Hours-based capacity intelligence
 *
 * Key responsibilities:
 *   • Convert task durations (days) → hours
 *   • Compute daily committed load per user
 *   • Calculate future availability windows
 *   • Emit "next available slot" human-readable messages
 *   • What-if simulation for new task assignment
 *   • 14-day forward load prediction
 */

// ── Task type → estimated hours ──────────────────────────────────────────────
const TASK_HOURS = {
  task:          { min: 4,   max: 16,  avg: 8   },  // ~1 day
  bug:           { min: 2,   max: 8,   avg: 4   },  // ~half-day
  story:         { min: 12,  max: 32,  avg: 20  },  // ~3 days
  rfp:           { min: 80,  max: 120, avg: 100 },  // 2–3 weeks
  proposal:      { min: 16,  max: 24,  avg: 20  },  // 2–3 days
  presentation:  { min: 8,   max: 16,  avg: 12  },  // 1–2 days
  upgrade:       { min: 32,  max: 48,  avg: 40  },  // ~1 week
  poc:           { min: 160, max: 320, avg: 240 },  // 1–2 months
  // legacy fallbacks
  feature:       { min: 8,   max: 40,  avg: 20  },
  hotfix:        { min: 1,   max: 4,   avg: 2   },
  chore:         { min: 2,   max: 8,   avg: 4   },
  spike:         { min: 4,   max: 16,  avg: 8   },
  documentation: { min: 4,   max: 16,  avg: 8   },
  default:       { min: 4,   max: 16,  avg: 8   },
};

// Type limit config keys (maps task type → user_capacity column name)
const TYPE_LIMIT_KEYS = {
  rfp:          'max_rfp',
  proposal:     'max_proposals',
  presentation: 'max_presentations',
  upgrade:      'max_upgrades',
};

const DEFAULT_DAILY_HOURS = 8;
const PLANNING_HORIZON    = 10; // 2-week working-day window

// ── Duration conversion ───────────────────────────────────────────────────────

/**
 * Convert days → hours using the user's daily capacity.
 * `final_duration` (days set by user in modal) → actual hours for this person.
 */
function daysToHours(days, dailyHours = DEFAULT_DAILY_HOURS) {
  return Math.max(0, Number(days || 0)) * Math.max(1, Number(dailyHours));
}

/** Canonical hours profile for a task type */
function getTaskHours(taskType) {
  const t = (taskType || '').toLowerCase().trim();
  return TASK_HOURS[t] || TASK_HOURS.default;
}

// ── Capacity helpers ──────────────────────────────────────────────────────────

/** Effective daily capacity (respects leave / travel mode) */
function effectiveCapacity(cap) {
  if (!cap || cap.on_leave)  return 0;
  if (cap.travel_mode)       return Math.max(1, parseFloat(cap.travel_hours) || 2);
  return Math.max(1, parseFloat(cap.daily_hours) || DEFAULT_DAILY_HOURS);
}

// ── Remaining hours per task ──────────────────────────────────────────────────

/**
 * Remaining hours on a task.
 * Priority: estimated_hours (explicit) → final_duration×dailyHours → type avg
 */
function remainingHours(task, dailyHours = DEFAULT_DAILY_HOURS) {
  let base;

  if (task.estimated_hours && parseFloat(task.estimated_hours) > 0) {
    // Explicit hour estimate stored in DB
    base = parseFloat(task.estimated_hours);
  } else if (task.final_duration && parseFloat(task.final_duration) > 0) {
    // User-confirmed day estimate × their daily hours → hours
    base = daysToHours(task.final_duration, dailyHours);
  } else if (task.estimated_days && parseFloat(task.estimated_days) > 0) {
    base = daysToHours(task.estimated_days, dailyHours);
  } else {
    // Fall back to task-type average
    base = getTaskHours(task.type).avg;
  }

  const progress = Math.min(100, Math.max(0, task.progress || 0));
  return Math.max(0, base * (1 - progress / 100));
}

/** Total remaining hours across all active tasks */
function totalActiveHours(tasks, dailyHours = DEFAULT_DAILY_HOURS) {
  return tasks.reduce((sum, t) => sum + remainingHours(t, dailyHours), 0);
}

// ── Daily load ────────────────────────────────────────────────────────────────

/**
 * How many hours per working day are currently committed.
 * Spreads remaining hours evenly across the planning horizon.
 */
function dailyCommittedLoad(tasks, cap) {
  const daily   = effectiveCapacity(cap);
  if (!daily)   return 0;
  const total   = totalActiveHours(tasks, daily);
  // Daily slice = total / horizon, capped at daily capacity
  return Math.min(daily, Math.round((total / PLANNING_HORIZON) * 10) / 10);
}

/**
 * Breakdown of today's committed hours by task type.
 * Returns { [type]: hours }
 */
function dailyLoadBreakdown(tasks, cap) {
  const daily = effectiveCapacity(cap);
  if (!daily)  return {};

  const totalH = totalActiveHours(tasks, daily) || 1;
  const breakdown = {};

  tasks.forEach(t => {
    const type  = (t.type || 'task').toLowerCase();
    const share = remainingHours(t, daily) / totalH;
    const hrs   = Math.round(Math.min(daily, daily * share) * 10) / 10;
    breakdown[type] = (breakdown[type] || 0) + hrs;
  });

  // Round all values
  Object.keys(breakdown).forEach(k => {
    breakdown[k] = Math.round(breakdown[k] * 10) / 10;
  });

  return breakdown;
}

// ── Working-day utilities ─────────────────────────────────────────────────────

/** Add N working days to a date (skips Sat/Sun) */
function addWorkingDays(date, days) {
  const d = new Date(date);
  let added = 0;
  while (added < Math.ceil(days)) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d;
}

/** Count working days between today and a future date */
function workingDaysBetween(from, to) {
  let count = 0;
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (d < end) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
  }
  return count;
}

/** Format a date as "Mon Apr 27" */
function friendlyDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

// ── Next available slot ───────────────────────────────────────────────────────

/**
 * The earliest date the user's backlog clears enough to start a new task.
 *
 * Algorithm:
 *  1. Calculate total remaining hours in the current queue.
 *  2. Divide by daily capacity to get working days until queue is clear.
 *  3. Add those days to today → next available date.
 *  4. Optionally, if newTaskHours is given, find when THAT task fits.
 *
 * Returns:
 *  {
 *    date: Date,
 *    daysFromNow: number,
 *    message: "Available now" | "Can start in 3 days (Mon Apr 27)"
 *  }
 */
function nextAvailableSlot(tasks, cap, newTaskHours = 0) {
  const daily = effectiveCapacity(cap);

  if (cap && cap.on_leave) {
    return {
      date: null,
      daysFromNow: null,
      message: 'On leave — not available',
    };
  }

  if (!daily) {
    return { date: null, daysFromNow: null, message: 'No capacity configured' };
  }

  const totalH    = totalActiveHours(tasks, daily);
  const HORIZON   = PLANNING_HORIZON;
  const capacity  = daily * HORIZON;

  // Days until existing backlog clears (using daily_capacity)
  const daysToFree = totalH > 0 ? Math.ceil(totalH / daily) : 0;

  // If adding a new task, check if there's room within the horizon
  if (newTaskHours > 0) {
    const freeHours = Math.max(0, capacity - totalH);
    if (freeHours >= newTaskHours) {
      // New task fits within current horizon — starts now (after existing work drains)
      const startDays = Math.ceil((totalH) / daily);
      if (startDays === 0) {
        return { date: new Date(), daysFromNow: 0, message: 'Can start today' };
      }
      const startDate = addWorkingDays(new Date(), startDays);
      return {
        date: startDate,
        daysFromNow: startDays,
        message: `Can start in ${startDays} day${startDays !== 1 ? 's' : ''} (${friendlyDate(startDate)})`,
      };
    } else {
      // Need to wait until backlog clears enough
      const date = addWorkingDays(new Date(), daysToFree);
      return {
        date,
        daysFromNow: daysToFree,
        message: `Can be picked after ${daysToFree} day${daysToFree !== 1 ? 's' : ''} (${friendlyDate(date)})`,
      };
    }
  }

  // No specific task — just report when the queue is clear
  if (daysToFree === 0) {
    return { date: new Date(), daysFromNow: 0, message: 'Available now' };
  }
  const freeDate = addWorkingDays(new Date(), daysToFree);
  return {
    date:       freeDate,
    daysFromNow: daysToFree,
    message:    `Queue clears in ${daysToFree} day${daysToFree !== 1 ? 's' : ''} (${friendlyDate(freeDate)})`,
  };
}

// ── Type-limit check ──────────────────────────────────────────────────────────

function checkTypeLimit(taskType, activeTasks, cap) {
  const limitKey = TYPE_LIMIT_KEYS[(taskType || '').toLowerCase()];
  if (!limitKey) return { ok: true };

  const limit   = cap[limitKey] ?? 1;
  const current = activeTasks.filter(
    t => (t.type || '').toLowerCase() === (taskType || '').toLowerCase()
  ).length;

  if (current >= limit) {
    return { ok: false, current, limit, taskType };
  }
  return { ok: true };
}

// ── Main assignment check ─────────────────────────────────────────────────────

/**
 * Can this new task be assigned to this user right now?
 * Returns { allowed, reason?, message?, nextAvailableDate?, canOverride }
 */
function checkAssignment(newTask, activeTasks, cap) {
  // 1. Leave block
  if (cap && cap.on_leave) {
    return {
      allowed:    false,
      reason:     'on_leave',
      message:    'User is currently on leave — task assignment blocked.',
      canOverride: false,
    };
  }

  const daily     = effectiveCapacity(cap);
  const newHours  = newTask.estimated_hours > 0
    ? parseFloat(newTask.estimated_hours)
    : getTaskHours(newTask.type).avg;
  const current   = totalActiveHours(activeTasks, daily);
  const capacity  = daily * PLANNING_HORIZON;

  // 2. Type-limit check
  const typeResult = checkTypeLimit(newTask.type, activeTasks, cap);
  if (!typeResult.ok) {
    const slot = nextAvailableSlot(activeTasks, cap, newHours);
    return {
      allowed:          false,
      reason:           'type_limit',
      message:          `${slot.message} — at max ${typeResult.limit} active ${typeResult.taskType}(s).`,
      nextAvailableDate: slot.date,
      daysFromNow:      slot.daysFromNow,
      canOverride:      true,
    };
  }

  // 3. Capacity check
  if (current + newHours > capacity) {
    const overload = Math.round(current + newHours - capacity);
    const slot     = nextAvailableSlot(activeTasks, cap, newHours);
    return {
      allowed:          false,
      reason:           'over_capacity',
      message:          `${slot.message} (would exceed 2-week capacity by ${overload}h).`,
      nextAvailableDate: slot.date,
      daysFromNow:      slot.daysFromNow,
      overloadHours:    overload,
      canOverride:      true,
    };
  }

  return { allowed: true };
}

// ── What-If simulation ────────────────────────────────────────────────────────

function simulateAssignment(newTask, activeTasks, cap) {
  const daily    = effectiveCapacity(cap);
  const capacity = daily * PLANNING_HORIZON;

  const newHours     = newTask.estimated_hours > 0
    ? parseFloat(newTask.estimated_hours)
    : getTaskHours(newTask.type).avg;
  const currentHours = totalActiveHours(activeTasks, daily);
  const afterHours   = currentHours + newHours;

  const before = {
    hours:   Math.round(currentHours * 10) / 10,
    pct:     Math.min(200, Math.round((currentHours / (capacity || 1)) * 100)),
    tasks:   activeTasks.length,
  };
  const after = {
    hours:   Math.round(afterHours * 10) / 10,
    pct:     Math.min(200, Math.round((afterHours / (capacity || 1)) * 100)),
    tasks:   activeTasks.length + 1,
    overload: afterHours > capacity ? Math.round(afterHours - capacity) : 0,
  };

  const assignable  = checkAssignment(newTask, activeTasks, cap);
  const delayRisk   = after.pct >= 90 ? 'high' : after.pct >= 70 ? 'medium' : 'low';
  const slot        = nextAvailableSlot(activeTasks, cap, newHours);

  return {
    feasible:          assignable.allowed,
    reason:            assignable.reason,
    message:           assignable.message || slot.message,
    canOverride:       assignable.canOverride,
    nextAvailableDate: assignable.nextAvailableDate || slot.date,
    daysFromNow:       assignable.daysFromNow       ?? slot.daysFromNow,
    before,
    after,
    delayRisk,
    newTaskHours: Math.round(newHours * 10) / 10,
  };
}

// ── Load percent helper ───────────────────────────────────────────────────────

function loadPercent(tasks, cap) {
  const daily = effectiveCapacity(cap);
  if (!daily)  return cap && cap.on_leave ? null : 0;
  const total  = totalActiveHours(tasks, daily);
  return Math.min(200, Math.round((total / (daily * PLANNING_HORIZON)) * 100));
}

// ── User workload summary ─────────────────────────────────────────────────────

function buildUserSummary(user, tasks, cap) {
  const daily  = effectiveCapacity(cap);
  const pct    = loadPercent(tasks, cap);
  const byType = {};

  tasks.forEach(t => {
    const type = (t.type || 'task').toLowerCase();
    if (!byType[type]) byType[type] = { count: 0, hours: 0 };
    byType[type].count++;
    byType[type].hours += remainingHours(t, daily);
  });

  return {
    user_id:               user.id,
    name:                  user.name,
    email:                 user.email,
    role:                  user.role,
    daily_capacity:        daily,
    total_remaining_hours: Math.round(totalActiveHours(tasks, daily) * 10) / 10,
    load_percent:          pct,
    status:
      pct === null  ? 'on_leave'   :
      pct >= 90     ? 'overloaded' :
      pct >= 70     ? 'moderate'   : 'available',
    travel_mode: cap.travel_mode || false,
    on_leave:    cap.on_leave    || false,
    task_count:  tasks.length,
    by_type:     byType,
    limits: {
      max_rfp:           cap.max_rfp          || 1,
      max_proposals:     cap.max_proposals    || 2,
      max_presentations: cap.max_presentations || 2,
      max_upgrades:      cap.max_upgrades     || 2,
    },
  };
}

// ── AI-style future load prediction ──────────────────────────────────────────

/**
 * Deterministic forward simulation: drains remaining hours at daily capacity
 * over the next `daysAhead` working days.
 */
function predictFutureLoad(tasks, cap, daysAhead = 14) {
  const daily = effectiveCapacity(cap);
  if (!daily)  return { risk: 'on_leave', peak_load: null, burnout_risk: false, days: [] };

  let remaining = totalActiveHours(tasks, daily);
  const days    = [];
  let d         = new Date();

  while (days.length < daysAhead) {
    d = new Date(d);
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekends

    const todayLoad = Math.min(remaining, daily);
    remaining       = Math.max(0, remaining - daily);
    const pct       = Math.round((todayLoad / daily) * 100);

    days.push({
      date:         d.toISOString().split('T')[0],
      load_hours:   Math.round(todayLoad * 10) / 10,
      load_percent: pct,
    });
  }

  const peakPct        = days.length ? Math.max(...days.map(x => x.load_percent)) : 0;
  const risk           = peakPct >= 90 ? 'high' : peakPct >= 70 ? 'medium' : 'low';
  const burnoutRisk    = days.filter(x => x.load_percent >= 90).length >= 5;

  return { risk, peak_load: peakPct, burnout_risk: burnoutRisk, days };
}

// ── Estimate accuracy ─────────────────────────────────────────────────────────

function estimateAccuracy(estimated, actual) {
  if (!estimated || !actual) return null;
  const diff = Math.abs(estimated - actual);
  return Math.max(0, Math.round((1 - diff / estimated) * 100));
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  TASK_HOURS,
  TYPE_LIMIT_KEYS,
  DEFAULT_DAILY_HOURS,
  PLANNING_HORIZON,
  // conversion
  daysToHours,
  getTaskHours,
  // capacity
  effectiveCapacity,
  // per-task
  remainingHours,
  totalActiveHours,
  // daily load
  dailyCommittedLoad,
  dailyLoadBreakdown,
  // next-available slot
  nextAvailableSlot,
  addWorkingDays,
  workingDaysBetween,
  friendlyDate,
  // assignment checks
  checkTypeLimit,
  checkAssignment,
  simulateAssignment,
  // summary / prediction
  loadPercent,
  buildUserSummary,
  predictFutureLoad,
  estimateAccuracy,
};
