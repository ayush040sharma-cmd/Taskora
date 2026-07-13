const pool   = require("../../db");
const logger = require("../../utils/logger");
const { dispatchOne } = require("./dispatch");

const BATCH_CONCURRENCY = 10;

/**
 * One scheduler tick — docs/briefing-engine-plan.md §6.4. Finds every user
 * whose local time currently matches their configured send hour and
 * dispatches. One global hourly cron handles every timezone (no per-user
 * timers, no drift); restart-safe because findDueUsers() excludes anything
 * briefing_runs already has as 'sent' or 'suppressed' for that exact
 * (user, brief_type, day) — running the tick twice in the same hour, or
 * restarting mid-tick, never double-sends.
 */
async function runSchedulerTick() {
  if (process.env.BRIEFINGS_ENABLED === "false") {
    logger.info("Briefing scheduler tick skipped — BRIEFINGS_ENABLED=false");
    return { skipped: true, reason: "kill_switch" };
  }

  const due = await findDueUsers();
  const results = { sent: 0, suppressed: 0, skipped: 0, failed: 0 };

  for (let i = 0; i < due.rows.length; i += BATCH_CONCURRENCY) {
    const batch = due.rows.slice(i, i + BATCH_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(row => dispatchOne(row.user_id, row.brief_type, row.local_date))
    );
    for (const s of settled) {
      if (s.status !== "fulfilled") { results.failed++; continue; }
      const v = s.value;
      if (v.sent) results.sent++;
      else if (v.failed) results.failed++;
      else if (v.skipped && v.reason?.startsWith("already_")) results.skipped++;
      else if (v.skipped) results.suppressed++;
    }
  }

  logger.info("Briefing scheduler tick complete", { dueCount: due.rows.length, ...results });
  return { dueCount: due.rows.length, ...results };
}

/**
 * Two UNION'd halves (morning / evening) rather than one query with a CASE
 * picking the label — a single CASE re-deriving "which one matched" after
 * an OR in the WHERE clause is a classic source of mislabeled rows once the
 * two conditions can both be plausible. NOT EXISTS checks brief_type too,
 * not just user+date, so a user already sent their morning brief today is
 * still correctly picked up for their evening brief.
 */
async function findDueUsers() {
  return pool.query(`
    SELECT due.user_id, due.brief_type, due.local_date FROM (
      SELECT u.id AS user_id,
             'morning_' || (CASE WHEN u.role IN ('manager','super_boss') THEN 'mgr' ELSE 'ic' END) AS brief_type,
             (NOW() AT TIME ZONE u.timezone)::date AS local_date
      FROM users u
      JOIN briefing_preferences p ON p.user_id = u.id
      WHERE p.morning_enabled
        AND EXTRACT(HOUR FROM NOW() AT TIME ZONE u.timezone)::int = p.send_hour_morning
        AND EXTRACT(DOW FROM NOW() AT TIME ZONE u.timezone)::int = ANY(p.weekdays)

      UNION ALL

      SELECT u.id,
             'evening_' || (CASE WHEN u.role IN ('manager','super_boss') THEN 'mgr' ELSE 'ic' END),
             (NOW() AT TIME ZONE u.timezone)::date
      FROM users u
      JOIN briefing_preferences p ON p.user_id = u.id
      WHERE p.evening_enabled
        AND EXTRACT(HOUR FROM NOW() AT TIME ZONE u.timezone)::int = p.send_hour_evening
        AND EXTRACT(DOW FROM NOW() AT TIME ZONE u.timezone)::int = ANY(p.weekdays)
    ) due
    WHERE NOT EXISTS (
      SELECT 1 FROM briefing_runs br
      WHERE br.user_id = due.user_id
        AND br.brief_type = due.brief_type
        AND br.local_date = due.local_date
        AND br.status IN ('sent', 'suppressed')
    )
  `);
}

module.exports = { runSchedulerTick, findDueUsers };
