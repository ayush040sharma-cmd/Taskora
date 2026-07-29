/**
 * GET /api/analytics/:wsId
 * Returns pre-aggregated analytics for a workspace — all computed in SQL,
 * so the frontend never needs to iterate a full task list.
 */
const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");

router.get("/:wsId", auth, async (req, res) => {
  const wsId = parseInt(req.params.wsId);
  if (!wsId) return res.status(400).json({ message: "Invalid workspace ID" });

  try {
    // ── Verify access ────────────────────────────────────────────────────────
    const accessR = await pool.query(
      `SELECT 1 FROM workspaces WHERE id=$1 AND user_id=$2
       UNION SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2`,
      [wsId, req.user.id]
    );
    if (!accessR.rows.length) return res.status(403).json({ message: "Access denied" });

    // ── KPI aggregation ──────────────────────────────────────────────────────
    const kpiR = await pool.query(`
      SELECT
        COUNT(*)                                                          AS total,
        COUNT(*) FILTER (WHERE status = 'done')                          AS done,
        COUNT(*) FILTER (WHERE status IN ('inprogress','in_progress'))   AS in_progress,
        COUNT(*) FILTER (WHERE due_date < NOW() AND status != 'done')    AS overdue,
        COUNT(*) FILTER (WHERE assigned_user_id IS NULL AND status != 'done') AS unassigned,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE status = 'done')
          / NULLIF(COUNT(*), 0)
        )                                                                 AS completion_rate
      FROM tasks WHERE workspace_id = $1
    `, [wsId]);

    // ── Average completion time (days) ───────────────────────────────────────
    const avgR = await pool.query(`
      SELECT ROUND(
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400)
      ) AS avg_days
      FROM tasks
      WHERE workspace_id=$1 AND status='done' AND completed_at IS NOT NULL AND created_at IS NOT NULL
    `, [wsId]);

    // ── Throughput: tasks completed per week, last 8 weeks ──────────────────
    const throughputR = await pool.query(`
      WITH weeks AS (
        SELECT generate_series(0, 7) AS w
      )
      SELECT
        'W' || (8 - w)                                                    AS week,
        TO_CHAR(
          DATE_TRUNC('day', NOW()) - (w * 7 - 1) * INTERVAL '1 day', 'Mon DD'
        )                                                                 AS label,
        COUNT(t.id)                                                       AS count
      FROM weeks
      LEFT JOIN tasks t
        ON t.workspace_id = $1
        AND t.status = 'done'
        AND t.completed_at IS NOT NULL
        AND t.completed_at >= DATE_TRUNC('day', NOW()) - (w * 7 + 6) * INTERVAL '1 day'
        AND t.completed_at <  DATE_TRUNC('day', NOW()) - (w * 7 - 1) * INTERVAL '1 day'
      GROUP BY w
      ORDER BY w DESC
    `, [wsId]);

    // ── Priority distribution ────────────────────────────────────────────────
    const priorityR = await pool.query(`
      SELECT priority, COUNT(*) AS count
      FROM tasks
      WHERE workspace_id=$1 AND status != 'done'
      GROUP BY priority
    `, [wsId]);

    // ── Type distribution ────────────────────────────────────────────────────
    const typeR = await pool.query(`
      SELECT COALESCE(type, 'task') AS type, COUNT(*) AS count
      FROM tasks
      WHERE workspace_id=$1 AND status != 'done'
      GROUP BY type
    `, [wsId]);

    // ── Trend: daily completion rate over last 7 days (correlated subquery avoids
    //   CROSS JOIN empty-set issue when workspace has no tasks yet) ──────────────
    const trendR = await pool.query(`
      SELECT
        s.d,
        (SELECT COUNT(*) FROM tasks t
         WHERE t.workspace_id=$1
           AND t.created_at::date <= (CURRENT_DATE - s.d * INTERVAL '1 day')::date
        ) AS total_by_day,
        (SELECT COUNT(*) FROM tasks t
         WHERE t.workspace_id=$1
           AND t.status='done'
           AND t.completed_at IS NOT NULL
           AND t.completed_at::date <= (CURRENT_DATE - s.d * INTERVAL '1 day')::date
        ) AS done_by_day
      FROM generate_series(0, 6) AS s(d)
      ORDER BY s.d DESC
    `, [wsId]);

    // ── Build trend array (7 values, index 0 = 6 days ago, index 6 = today) ─
    const trendMap = {};
    trendR.rows.forEach(r => {
      const total = parseInt(r.total_by_day) || 0;
      const done  = parseInt(r.done_by_day)  || 0;
      trendMap[r.d] = total > 0 ? Math.round((done / total) * 100) : 0;
    });
    const trend = Array.from({ length: 7 }, (_, i) => trendMap[6 - i] || 0);

    // ── Priority lookup ──────────────────────────────────────────────────────
    const priorityCounts = ["critical", "high", "medium", "low"].map(p => ({
      priority: p,
      count: parseInt(priorityR.rows.find(r => r.priority === p)?.count || 0),
    }));

    const types = {};
    typeR.rows.forEach(r => { types[r.type] = parseInt(r.count); });

    const kpi = kpiR.rows[0];

    res.json({
      total:          parseInt(kpi.total)           || 0,
      done:           parseInt(kpi.done)            || 0,
      inProgress:     parseInt(kpi.in_progress)     || 0,
      overdue:        parseInt(kpi.overdue)         || 0,
      unassigned:     parseInt(kpi.unassigned)      || 0,
      completionRate: parseInt(kpi.completion_rate) || 0,
      avgDays:        avgR.rows[0]?.avg_days != null ? parseInt(avgR.rows[0].avg_days) : null,
      throughput:     throughputR.rows.map(r => ({ week: r.week, label: r.label, count: parseInt(r.count) })),
      priorityCounts,
      types,
      trend,
    });
  } catch (err) {
    console.error("[Analytics]", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
