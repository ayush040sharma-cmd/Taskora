const { round2, clamp, businessDaysBetween } = require("./_util");

const DEFAULT_VELOCITY_POINTS_PER_DAY = 1;

/**
 * Sprint Confidence — 0..100, per sprint.
 *
 * Net-new metric. There is no existing Monte-Carlo or percentile engine in
 * this codebase to extend — the "What-If Sim" (backend/services/
 * workloadEngine.js: simulateAssignment/predictFutureLoad) is a per-task
 * assignment/load simulator, a different kind of thing. See
 * docs/briefing-engine-plan.md §3.1 for the full correction; this is v1,
 * closed-form (not Monte Carlo):
 *
 *   confidence = 100 · clamp(velocity · days_remaining / max(remaining_points, 1), 0, 1)
 *                     · (1 − blocked_points_ratio)
 *
 * velocity = points completed per business day, averaged over the sprint's
 * workspace's last 3 *completed* sprints (falls back to a conservative
 * 1 pt/day if there's no sprint history yet).
 *
 * Returns { value: 0..100, inputs } normally, or { value: null, inputs }
 * when the sprint has open tasks but none of them have story_points set —
 * that's "not enough data," not "0% confidence," and the caller (snapshot.js)
 * is expected to skip writing a row rather than record a fabricated number.
 */
async function computeSprintConfidence(pool, { sprintId, workspaceId, localDate }) {
  const sprintR = await pool.query(`SELECT * FROM sprints WHERE id = $1`, [sprintId]);
  const sprint = sprintR.rows[0];
  if (!sprint) throw new Error(`Sprint ${sprintId} not found`);

  const taskR = await pool.query(
    `SELECT id, status, story_points, blocked_by_task_id, unblocked_at
     FROM tasks WHERE sprint_id = $1`,
    [sprintId]
  );
  const tasks = taskR.rows;
  const points = t => parseFloat(t.story_points) || 0;

  const openTasks = tasks.filter(t => t.status !== "done");
  const hasPointsData = openTasks.some(t => points(t) > 0);

  if (openTasks.length > 0 && !hasPointsData) {
    return {
      value: null,
      inputs: { reason: "no_story_points_estimated", open_tasks: openTasks.length },
    };
  }

  const remainingPoints = openTasks.reduce((sum, t) => sum + points(t), 0);

  const blockedPoints = openTasks
    .filter(t => t.status === "blocked" || (t.blocked_by_task_id && !t.unblocked_at))
    .reduce((sum, t) => sum + points(t), 0);
  const blockedRatio = remainingPoints ? blockedPoints / remainingPoints : 0;

  const velocity = await computeVelocity(pool, workspaceId, sprintId);
  const daysRemaining = businessDaysBetween(localDate, sprint.end_date);
  const projectedCapacity = velocity * Math.max(0, daysRemaining);

  const rawConfidence = remainingPoints > 0
    ? clamp(projectedCapacity / remainingPoints, 0, 1)
    : 1; // nothing left to do

  const confidence = Math.round(100 * rawConfidence * (1 - blockedRatio));

  return {
    value: clamp(confidence, 0, 100),
    inputs: {
      remaining_points: remainingPoints,
      blocked_points: blockedPoints,
      blocked_ratio: round2(blockedRatio),
      velocity_points_per_day: round2(velocity),
      days_remaining: daysRemaining,
      sprint_end_date: sprint.end_date,
    },
  };
}

async function computeVelocity(pool, workspaceId, excludeSprintId) {
  const r = await pool.query(
    `SELECT s.id, s.start_date, s.end_date,
            COALESCE(SUM(t.story_points), 0) AS completed_points
     FROM sprints s
     LEFT JOIN tasks t ON t.sprint_id = s.id AND t.status = 'done'
     WHERE s.workspace_id = $1 AND s.status = 'completed' AND s.id != $2
     GROUP BY s.id
     ORDER BY s.end_date DESC
     LIMIT 3`,
    [workspaceId, excludeSprintId]
  );
  if (!r.rows.length) return DEFAULT_VELOCITY_POINTS_PER_DAY;

  let totalPoints = 0;
  let totalDays = 0;
  for (const row of r.rows) {
    totalPoints += parseFloat(row.completed_points) || 0;
    totalDays += businessDaysBetween(row.start_date, row.end_date) || 1;
  }
  return totalDays ? totalPoints / totalDays : DEFAULT_VELOCITY_POINTS_PER_DAY;
}

/**
 * Cheap "what if this task's points were done" projection, reusing a stored
 * snapshot's `inputs` instead of re-querying the DB (see metric_snapshots.
 * inputs — this is exactly why the raw components are persisted, not just
 * the final number). Approximation: holds velocity/days_remaining/
 * blocked_ratio fixed and only reduces remaining_points.
 */
function projectConfidenceIfDone(snapshotInputs, pointsCompleted = 0) {
  if (!snapshotInputs) return null;
  const remaining     = Math.max(0, (snapshotInputs.remaining_points || 0) - pointsCompleted);
  const velocity       = snapshotInputs.velocity_points_per_day || 0;
  const daysRemaining  = snapshotInputs.days_remaining || 0;
  const blockedRatio   = snapshotInputs.blocked_ratio || 0;
  const projected      = velocity * Math.max(0, daysRemaining);
  const raw = remaining > 0 ? clamp(projected / remaining, 0, 1) : 1;
  return clamp(Math.round(100 * raw * (1 - blockedRatio)), 0, 100);
}

module.exports = { computeSprintConfidence, projectConfidenceIfDone };
