const pool   = require("../../db");
const logger = require("../../utils/logger");
const { computeExecutionScore }   = require("./executionScore");
const { computeSprintConfidence } = require("./sprintConfidence");
const { computeFocusTime }        = require("./focusTime");
const { todayISODate }            = require("./_util");

/**
 * Upsert one metric_snapshots row. The ON CONFLICT target is picked to match
 * whichever of the three partial unique indexes (schema-v13.sql) applies —
 * user-scoped, sprint-scoped, or workspace-scoped — since a single UNIQUE
 * constraint across nullable columns wouldn't dedupe correctly (Postgres
 * treats each NULL as distinct).
 */
async function writeSnapshot({ workspaceId, userId = null, sprintId = null, metric, value, inputs, localDate }) {
  if (value === null || value === undefined) return; // "not enough data" — don't fabricate a row

  let conflictTarget;
  if (userId != null) {
    conflictTarget = "(workspace_id, user_id, metric, local_date) WHERE user_id IS NOT NULL AND sprint_id IS NULL";
  } else if (sprintId != null) {
    conflictTarget = "(workspace_id, sprint_id, metric, local_date) WHERE sprint_id IS NOT NULL";
  } else {
    conflictTarget = "(workspace_id, metric, local_date) WHERE user_id IS NULL AND sprint_id IS NULL";
  }

  await pool.query(
    `INSERT INTO metric_snapshots (workspace_id, user_id, sprint_id, metric, value, inputs, local_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT ${conflictTarget}
     DO UPDATE SET value = EXCLUDED.value, inputs = EXCLUDED.inputs`,
    [workspaceId, userId, sprintId, metric, value, JSON.stringify(inputs || {}), localDate]
  );
}

/**
 * Compute and persist every metric this phase defines, for every active
 * user and every active sprint, for one day. Idempotent — safe to re-run
 * for the same localDate (upserts, doesn't accumulate duplicates).
 *
 * This must run daily well before the briefing engine's first send (Phase 4)
 * — "Yesterday: 74% ↑ +7%" in the email is unrecoverable if yesterday's
 * snapshot was never taken. See docs/briefing-engine-plan.md §3.2.
 */
async function runDailySnapshot(localDate = todayISODate()) {
  let usersSnapshotted = 0;
  let sprintsSnapshotted = 0;
  let skipped = 0;
  let errors = 0;

  const usersR = await pool.query(
    `SELECT DISTINCT assigned_user_id AS user_id, workspace_id
     FROM tasks WHERE assigned_user_id IS NOT NULL`
  );

  for (const { user_id, workspace_id } of usersR.rows) {
    try {
      const exec = await computeExecutionScore(pool, { userId: user_id, workspaceId: workspace_id, localDate });
      await writeSnapshot({
        workspaceId: workspace_id, userId: user_id, metric: "execution_score",
        value: exec.value, inputs: exec.inputs, localDate,
      });

      const focus = await computeFocusTime(pool, { userId: user_id, workspaceId: workspace_id, localDate });
      await writeSnapshot({
        workspaceId: workspace_id, userId: user_id, metric: "focus_time_minutes",
        value: focus.value, inputs: focus.inputs, localDate,
      });

      usersSnapshotted++;
    } catch (e) {
      errors++;
      logger.error("Metrics snapshot failed for user", { user_id, workspace_id, error: e.message });
    }
  }

  const sprintsR = await pool.query(`SELECT id, workspace_id FROM sprints WHERE status = 'active'`);
  for (const sprint of sprintsR.rows) {
    try {
      const conf = await computeSprintConfidence(pool, {
        sprintId: sprint.id, workspaceId: sprint.workspace_id, localDate,
      });
      if (conf.value === null) {
        skipped++;
      } else {
        await writeSnapshot({
          workspaceId: sprint.workspace_id, sprintId: sprint.id, metric: "sprint_confidence",
          value: conf.value, inputs: conf.inputs, localDate,
        });
        sprintsSnapshotted++;
      }
    } catch (e) {
      errors++;
      logger.error("Metrics snapshot failed for sprint", { sprint_id: sprint.id, error: e.message });
    }
  }

  const summary = { localDate, usersSnapshotted, sprintsSnapshotted, skipped, errors };
  logger.info("Daily metrics snapshot complete", summary);
  return summary;
}

module.exports = { runDailySnapshot, writeSnapshot };
