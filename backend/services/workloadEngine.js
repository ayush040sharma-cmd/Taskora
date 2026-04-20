/**
 * Workload Engine
 * Core logic for capacity tracking, over-allocation detection,
 * next-available-slot calculation, and future load prediction.
 */

// ── Task type → estimated hours ──────────────────────────────────────────────
const TASK_HOURS = {
  rfp:          { min: 80,  max: 120, avg: 100 },  // 2–3 weeks
  upgrade:      { min: 40,  max: 40,  avg: 40  },  // 1 week
  poc:          { min: 160, max: 320, avg: 240 },  // 1–2 months
  proposal:     { min: 16,  max: 24,  avg: 20  },  // 2–3 days
  presentation: { min: 8,   max: 16,  avg: 12  },  // 1–2 days
  feature:      { min: 8,   max: 40,  avg: 20  },
  bug:          { min: 2,   max: 8,   avg: 4   },
  hotfix:       { min: 1,   max: 4,   avg: 2   },
  chore:        { min: 2,   max: 8,   avg: 4   },
  spike:        { min: 4,   max: 16,  avg: 8   },
  documentation:{ min: 4,   max: 16,  avg: 8   },
  default:      { min: 4,   max: 16,  avg: 8   },
};

// Type limit config keys (maps task type → user_capacity column name)
const TYPE_LIMIT_KEYS = {
  rfp:          'max_rfp',
  proposal:     'max_proposals',
  presentation: 'max_presentations',
  upgrade:      'max_upgrades',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Canonical hours for a task type (uses estimate if provided, else avg) */
function getTaskHours(taskType) {
  const t = (taskType || '').toLowerCase().trim();
  return TASK_HOURS[t] || TASK_HOURS.default;
}

/** Remaining hours on a task (accounts for % progress) */
function remainingHours(task) {
  const base = task.estimated_hours > 0
    ? parseFloat(task.estimated_hours)
    : getTaskHours(task.type).avg;
  const progress = Math.min(100, Math.max(0, task.progress || 0));
  return base * (1 - progress / 100);
}

/** Effective daily capacity for a user (honours travel / leave) */
function effectiveCapacity(cap) {
  if (!cap || cap.on_leave)   return 0;
  if (cap.travel_mode)        return parseFloat(cap.travel_hours) || 2;
  return parseFloat(cap.daily_hours) || 8;
}

/** Sum of remaining hours across a list of active tasks */
function totalActiveHours(tasks) {
  return tasks.reduce((sum, t) => sum + remainingHours(t), 0);
}

/** Working days needed to burn down a given hours total at dailyCapacity h/day */
function workingDaysNeeded(hours, dailyCapacity) {
  if (!dailyCapacity) return Infinity;
  return Math.ceil(hours / dailyCapacity);
}

/** Add N working days to a date (skips Sat/Sun) */
function addWorkingDays(date, days) {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d;
}

/** Date from which the user's queue is clear of current tasks */
function nextAvailableDate(tasks, cap) {
  const daily  = effectiveCapacity(cap);
  const total  = totalActiveHours(tasks);
  const days   = workingDaysNeeded(total, daily);
  return addWorkingDays(new Date(), days);
}

// ── Type-limit check ─────────────────────────────────────────────────────────

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
 * Determines whether a new task can be assigned to a user.
 * Returns { allowed, reason?, message?, nextAvailableDate?, canOverride }
 */
function checkAssignment(newTask, activeTasks, cap) {
  // 1. Leave block
  if (cap.on_leave) {
    return {
      allowed: false,
      reason: 'on_leave',
      message: 'User is currently on leave — task assignment blocked.',
      canOverride: false,
    };
  }

  const daily      = effectiveCapacity(cap);
  const newHours   = newTask.estimated_hours > 0
    ? parseFloat(newTask.estimated_hours)
    : getTaskHours(newTask.type).avg;
  const current    = totalActiveHours(activeTasks);
  const HORIZON    = 10; // 2-week planning window (working days)
  const capacity   = daily * HORIZON;

  // 2. Type-limit check
  const typeResult = checkTypeLimit(newTask.type, activeTasks, cap);
  if (!typeResult.ok) {
    const nextDate = nextAvailableDate(activeTasks, cap);
    return {
      allowed: false,
      reason:  'type_limit',
      message: `This task can be picked after ${nextDate.toDateString()} based on current workload ` +
               `(max ${typeResult.limit} active ${typeResult.taskType}(s) — currently at ${typeResult.current}).`,
      nextAvailableDate: nextDate,
      canOverride: true,
    };
  }

  // 3. Capacity check
  if (current + newHours > capacity) {
    const overload  = Math.round(current + newHours - capacity);
    const nextDate  = nextAvailableDate(activeTasks, cap);
    return {
      allowed: false,
      reason:  'over_capacity',
      message: `This task can be picked after ${nextDate.toDateString()} based on current workload ` +
               `(would exceed 2-week capacity by ${overload}h).`,
      overloadHours:    overload,
      nextAvailableDate: nextDate,
      canOverride: true,
    };
  }

  return { allowed: true };
}

// ── What-If simulation ────────────────────────────────────────────────────────

/**
 * Simulates the impact of assigning a task to a user.
 * Returns before/after metrics + recommendation.
 */
function simulateAssignment(newTask, activeTasks, cap, allUsers = []) {
  const daily    = effectiveCapacity(cap);
  const HORIZON  = 10;
  const capacity = daily * HORIZON;

  const newHours     = newTask.estimated_hours > 0
    ? parseFloat(newTask.estimated_hours)
    : getTaskHours(newTask.type).avg;
  const currentHours = totalActiveHours(activeTasks);
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

  const assignable = checkAssignment(newTask, activeTasks, cap);
  const delayRisk  = after.pct >= 90 ? 'high' : after.pct >= 70 ? 'medium' : 'low';

  return {
    feasible:       assignable.allowed,
    reason:         assignable.reason,
    message:        assignable.message,
    canOverride:    assignable.canOverride,
    nextAvailableDate: assignable.nextAvailableDate,
    before,
    after,
    delayRisk,
    newTaskHours: newHours,
  };
}

// ── Load percentage helper ────────────────────────────────────────────────────

function loadPercent(tasks, cap) {
  const daily    = effectiveCapacity(cap);
  if (!daily)    return cap.on_leave ? null : 0;
  const HORIZON  = 10;
  const total    = totalActiveHours(tasks);
  return Math.min(200, Math.round((total / (daily * HORIZON)) * 100));
}

// ── User workload summary (for manager dashboard) ─────────────────────────────

function buildUserSummary(user, tasks, cap) {
  const daily   = effectiveCapacity(cap);
  const pct     = loadPercent(tasks, cap);
  const byType  = {};

  tasks.forEach(t => {
    const type = (t.type || 'normal').toLowerCase();
    if (!byType[type]) byType[type] = { count: 0, hours: 0 };
    byType[type].count++;
    byType[type].hours += remainingHours(t);
  });

  return {
    user_id:              user.id,
    name:                 user.name,
    email:                user.email,
    role:                 user.role,
    daily_capacity:       daily,
    total_remaining_hours: Math.round(totalActiveHours(tasks) * 10) / 10,
    load_percent:         pct,
    status:               pct === null    ? 'on_leave'
                        : pct >= 90       ? 'overloaded'
                        : pct >= 70       ? 'moderate'
                        :                   'available',
    travel_mode:          cap.travel_mode || false,
    on_leave:             cap.on_leave || false,
    task_count:           tasks.length,
    by_type:              byType,
    limits: {
      max_rfp:          cap.max_rfp          || 1,
      max_proposals:    cap.max_proposals    || 2,
      max_presentations:cap.max_presentations|| 2,
      max_upgrades:     cap.max_upgrades     || 2,
    },
  };
}

// ── AI-style future load prediction ──────────────────────────────────────────

/**
 * Deterministic forward simulation of daily load over daysAhead working days.
 * Uses current remaining hours and drains them at daily capacity.
 */
function predictFutureLoad(tasks, cap, daysAhead = 14) {
  const daily = effectiveCapacity(cap);
  if (!daily) return { risk: 'on_leave', peak_load: null, days: [] };

  let remaining = totalActiveHours(tasks);
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

  const peakPct = days.length ? Math.max(...days.map(d => d.load_percent)) : 0;
  const risk    = peakPct >= 90 ? 'high' : peakPct >= 70 ? 'medium' : 'low';

  const burnoutIndicator = days.filter(d => d.load_percent >= 90).length >= 5;

  return { risk, peak_load: peakPct, burnout_risk: burnoutIndicator, days };
}

// ── Estimate accuracy (for effort-vs-actual tracking) ────────────────────────

function estimateAccuracy(estimated, actual) {
  if (!estimated || !actual) return null;
  const diff = Math.abs(estimated - actual);
  return Math.max(0, Math.round((1 - diff / estimated) * 100));
}

module.exports = {
  TASK_HOURS,
  TYPE_LIMIT_KEYS,
  getTaskHours,
  remainingHours,
  effectiveCapacity,
  totalActiveHours,
  workingDaysNeeded,
  addWorkingDays,
  nextAvailableDate,
  checkTypeLimit,
  checkAssignment,
  simulateAssignment,
  loadPercent,
  buildUserSummary,
  predictFutureLoad,
  estimateAccuracy,
};
