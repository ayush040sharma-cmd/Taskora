/**
 * workloadLogger.js
 *
 * Upserts a workload_log row for today when tasks change.
 * Called from tasks, calendar, and capacity routes.
 */

const pool = require("../db");
const wl   = require("./workloadEngine");

/**
 * Recalculate and upsert today's workload_log for a specific user.
 * Non-blocking — errors are logged but not thrown.
 */
async function refreshUserWorkloadLog(userId, workspaceId) {
  try {
    // Get user's capacity
    const capRow = await pool.query(
      "SELECT * FROM user_capacity WHERE user_id = $1",
      [userId]
    );
    const cap = capRow.rows[0] || {
      daily_hours: wl.DEFAULT_DAILY_HOURS,
      on_leave: false,
      travel_mode: false,
      travel_hours: 2,
    };

    const capacityHours = wl.effectiveCapacity(cap);

    // Get user's active tasks (not done)
    const taskRows = await pool.query(
      `SELECT * FROM tasks
       WHERE assigned_user_id = $1
         AND workspace_id = $2
         AND status NOT IN ('done', 'pending_approval')`,
      [userId, workspaceId]
    );

    const scheduledHours = Math.round(
      wl.dailyCommittedLoad(taskRows.rows, cap) * 10
    ) / 10;

    const overloadFlag = scheduledHours > capacityHours;
    const today = new Date().toISOString().split("T")[0];

    await pool.query(
      `INSERT INTO workload_logs
         (user_id, workspace_id, date, scheduled_hours, capacity_hours, overload_flag, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'task')
       ON CONFLICT (user_id, date, source)
       DO UPDATE SET
         scheduled_hours = EXCLUDED.scheduled_hours,
         capacity_hours  = EXCLUDED.capacity_hours,
         overload_flag   = EXCLUDED.overload_flag`,
      [userId, workspaceId, today, scheduledHours, capacityHours, overloadFlag]
    );
  } catch (err) {
    console.error("workloadLogger error:", err.message);
  }
}

module.exports = { refreshUserWorkloadLog };
