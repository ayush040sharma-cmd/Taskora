const { round2, clamp, sameDay } = require("./_util");

const DEFAULT_DAILY_HOURS = 8;

/**
 * Execution Score — 0..100, per user per day.
 *
 * Net-new metric (docs/briefing-engine-plan.md §3.1) — Taskora has no prior
 * "score" like this to extend. Formula is v1, meant to be tuned, but frozen
 * here as the single canonical implementation so the briefing email, the
 * in-app Command Center, and Analytics never disagree with each other:
 *
 *   0.35 · completion_ratio      — tasks completed today / tasks that were
 *                                  either completed today or still open for
 *                                  this user at the time of computation
 *   0.25 · on_time_ratio         — of today's completions, done on/before
 *                                  their due_date (undated tasks count as
 *                                  on-time — no due date, no deadline missed)
 *   0.20 · (1 − blocked_ratio)   — blocked tasks / all open assigned tasks
 *   0.20 · (1 − overload_penalty)— from workload_logs, clamp(load% − 100, 0, 100) / 100
 *
 * Returns { value: 0..100, inputs: {...} } — inputs is stored alongside the
 * snapshot so "why 82?" is always answerable without recomputing.
 */
async function computeExecutionScore(pool, { userId, workspaceId, localDate }) {
  const taskR = await pool.query(
    `SELECT id, status, due_date, completed_at, blocked_by_task_id, unblocked_at
     FROM tasks
     WHERE workspace_id = $1 AND assigned_user_id = $2
       AND (status != 'done' OR completed_at::date = $3::date)`,
    [workspaceId, userId, localDate]
  );
  const tasks = taskR.rows;

  const completedToday = tasks.filter(t => t.completed_at && sameDay(t.completed_at, localDate));
  const stillOpen       = tasks.filter(t => t.status !== "done");
  const considered       = completedToday.length + stillOpen.length;

  const completionRatio = considered ? completedToday.length / considered : 0;

  const onTime = completedToday.filter(
    t => !t.due_date || new Date(t.completed_at) <= new Date(t.due_date)
  );
  const onTimeRatio = completedToday.length ? onTime.length / completedToday.length : 1;

  const blocked = stillOpen.filter(
    t => t.status === "blocked" || (t.blocked_by_task_id && !t.unblocked_at)
  );
  const blockedRatio = stillOpen.length ? blocked.length / stillOpen.length : 0;

  const wlR = await pool.query(
    `SELECT scheduled_hours, capacity_hours FROM workload_logs
     WHERE user_id = $1 AND workspace_id = $2 AND date = $3::date AND source = 'task'
     ORDER BY id DESC LIMIT 1`,
    [userId, workspaceId, localDate]
  );
  const wl             = wlR.rows[0];
  const capacityHours  = parseFloat(wl?.capacity_hours) || DEFAULT_DAILY_HOURS;
  const scheduledHours = parseFloat(wl?.scheduled_hours) || 0;
  const workloadPct    = capacityHours ? (scheduledHours / capacityHours) * 100 : 0;
  const overloadPenalty = clamp(workloadPct - 100, 0, 100) / 100;

  const raw = 100 * (
    0.35 * completionRatio +
    0.25 * onTimeRatio +
    0.20 * (1 - blockedRatio) +
    0.20 * (1 - overloadPenalty)
  );

  return {
    value: Math.round(clamp(raw, 0, 100)),
    inputs: {
      completion_ratio: round2(completionRatio),
      on_time_ratio: round2(onTimeRatio),
      blocked_ratio: round2(blockedRatio),
      overload_penalty: round2(overloadPenalty),
      considered_tasks: considered,
      completed_today: completedToday.length,
      blocked_today: blocked.length,
      workload_pct: Math.round(workloadPct),
      has_workload_log: Boolean(wl),
    },
  };
}

module.exports = { computeExecutionScore };
