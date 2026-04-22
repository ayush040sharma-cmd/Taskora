/**
 * AI Execution Brain — REST API
 *
 * POST /api/ai/predict/:taskId        → risk + delay prediction for one task
 * POST /api/ai/analyze/:workspaceId   → batch analysis of all active tasks
 * GET  /api/ai/health                 → workspace health score
 * GET  /api/ai/alerts/:workspaceId    → prescriptive alerts
 * POST /api/ai/refresh/:workspaceId   → refresh AI fields on all tasks (background)
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");
const ai      = require("../services/aiEngine");

// ── POST /api/ai/predict/:taskId ──────────────────────────────────────────────
router.post("/predict/:taskId", auth, async (req, res) => {
  const start = Date.now();
  try {
    // Fetch task with assignee workload data
    const taskRow = await pool.query(
      `SELECT t.*,
              u.name AS assignee_name,
              (SELECT COUNT(*) FROM task_dependencies td
               JOIN tasks dep ON td.depends_on_task_id = dep.id
               WHERE td.task_id = t.id AND dep.status != 'done')::int AS blocking_dep_count
       FROM tasks t
       LEFT JOIN users u ON t.assigned_user_id = u.id
       WHERE t.id = $1`,
      [req.params.taskId]
    );
    if (!taskRow.rows.length) return res.status(404).json({ message: "Task not found" });
    const task = taskRow.rows[0];

    // Get assignee's current workload
    let assigneeLoad = null;
    if (task.assigned_user_id) {
      const loadRow = await pool.query(
        `SELECT wl.scheduled_hours, wl.capacity_hours, wl.overload_flag,
                uc.daily_hours, uc.on_leave, uc.travel_mode
         FROM user_capacity uc
         LEFT JOIN workload_logs wl ON wl.user_id = uc.user_id AND wl.date = CURRENT_DATE AND wl.source = 'task'
         WHERE uc.user_id = $1`,
        [task.assigned_user_id]
      );
      if (loadRow.rows.length) {
        const r = loadRow.rows[0];
        const cap = parseFloat(r.daily_hours) || 8;
        const sch = parseFloat(r.scheduled_hours) || 0;
        assigneeLoad = {
          load_percent:    cap > 0 ? Math.round((sch / cap) * 100) : 0,
          daily_capacity:  cap,
          on_leave:        r.on_leave || false,
          travel_mode:     r.travel_mode || false,
        };
      }
    }

    const prediction = ai.calculateRiskScore(task, assigneeLoad);

    // Persist prediction to tasks table (async, non-blocking)
    pool.query(
      `UPDATE tasks SET
         risk_score           = $1,
         delay_probability    = $2,
         confidence_score     = $3,
         ai_suggestion        = $4,
         ai_last_analyzed_at  = NOW()
       WHERE id = $5`,
      [
        prediction.risk_score,
        prediction.delay_probability,
        prediction.confidence_score,
        prediction.suggestions[0] || null,
        task.id,
      ]
    ).catch(() => {});

    // Save to ai_predictions table
    pool.query(
      `INSERT INTO ai_predictions
         (task_id, prediction_type, predicted_value, predicted_label, confidence,
          model_version, reasoning, suggestions, ai_fallback)
       VALUES ($1,'risk_score',$2,$3,$4,$5,$6,$7,$8)`,
      [
        task.id,
        prediction.risk_score,
        prediction.risk_level,
        prediction.confidence_score,
        prediction.model_version,
        prediction.reasoning,
        JSON.stringify(prediction.suggestions),
        prediction.ai_fallback,
      ]
    ).catch(() => {});

    res.json({
      ...prediction,
      task_id:      task.id,
      processing_ms: Date.now() - start,
    });
  } catch (err) {
    console.error("AI predict error:", err);
    res.status(500).json({ message: "AI prediction failed" });
  }
});

// ── POST /api/ai/analyze/:workspaceId ─────────────────────────────────────────
router.post("/analyze/:workspaceId", auth, async (req, res) => {
  const start = Date.now();
  try {
    // Verify access
    const ws = await pool.query(
      "SELECT id FROM workspaces WHERE id = $1 AND user_id = $2",
      [req.params.workspaceId, req.user.id]
    );
    if (!ws.rows.length) return res.status(403).json({ message: "Access denied" });

    // Get all active tasks
    const tasksRow = await pool.query(
      `SELECT t.*,
              (SELECT COUNT(*) FROM task_dependencies td
               JOIN tasks dep ON td.depends_on_task_id = dep.id
               WHERE td.task_id = t.id AND dep.status != 'done')::int AS blocking_dep_count
       FROM tasks t
       WHERE t.workspace_id = $1 AND t.status != 'done'`,
      [req.params.workspaceId]
    );

    // Get workload data
    const wlRow = await pool.query(
      `SELECT wl.user_id, wl.scheduled_hours, wl.capacity_hours,
              uc.daily_hours, uc.on_leave, uc.travel_mode,
              u.name
       FROM user_capacity uc
       JOIN users u ON u.id = uc.user_id
       LEFT JOIN workload_logs wl ON wl.user_id = uc.user_id AND wl.date = CURRENT_DATE AND wl.source = 'task'
       WHERE u.id IN (
         SELECT DISTINCT assigned_user_id FROM tasks
         WHERE workspace_id = $1 AND assigned_user_id IS NOT NULL
       )`,
      [req.params.workspaceId]
    );

    const workloadData = wlRow.rows.map(r => {
      const cap = parseFloat(r.daily_hours) || 8;
      const sch = parseFloat(r.scheduled_hours) || 0;
      return {
        user_id:       r.user_id,
        name:          r.name,
        load_percent:  cap > 0 ? Math.round((sch / cap) * 100) : 0,
        daily_capacity: cap,
        on_leave:      r.on_leave || false,
        travel_mode:   r.travel_mode || false,
      };
    });

    const predictions = ai.analyzeWorkspaceTasks(tasksRow.rows, workloadData);
    const health      = ai.calculateProjectHealth(tasksRow.rows, workloadData);
    const teamStress  = ai.calculateTeamStress(workloadData);
    const alerts      = ai.generatePrescriptiveAlerts(predictions, workloadData);

    // Bulk update risk_score on tasks (background)
    const updates = predictions.map(p =>
      pool.query(
        `UPDATE tasks SET risk_score=$1, delay_probability=$2, confidence_score=$3,
                          ai_suggestion=$4, ai_last_analyzed_at=NOW() WHERE id=$5`,
        [p.risk_score, p.delay_probability, p.confidence_score, p.suggestions[0] || null, p.task_id]
      ).catch(() => {})
    );
    Promise.all(updates).catch(() => {});

    res.json({
      workspace_id:   req.params.workspaceId,
      analyzed_at:    new Date().toISOString(),
      processing_ms:  Date.now() - start,
      health,
      team_stress:    teamStress,
      predictions:    predictions.slice(0, 20), // top 20 by risk
      alerts,
      total_analyzed: predictions.length,
    });
  } catch (err) {
    console.error("AI analyze error:", err);
    res.status(500).json({ message: "AI analysis failed" });
  }
});

// ── GET /api/ai/health/:workspaceId ──────────────────────────────────────────
router.get("/health/:workspaceId", auth, async (req, res) => {
  try {
    const ws = await pool.query(
      "SELECT id FROM workspaces WHERE id = $1 AND user_id = $2",
      [req.params.workspaceId, req.user.id]
    );
    if (!ws.rows.length) return res.status(403).json({ message: "Access denied" });

    const tasksRow = await pool.query(
      `SELECT t.*,
              (SELECT COUNT(*) FROM task_dependencies td
               JOIN tasks dep ON td.depends_on_task_id = dep.id
               WHERE td.task_id = t.id AND dep.status != 'done')::int AS blocking_dep_count
       FROM tasks t WHERE t.workspace_id = $1 AND t.status != 'done'`,
      [req.params.workspaceId]
    );

    const health = ai.calculateProjectHealth(tasksRow.rows);
    res.json({ workspace_id: req.params.workspaceId, ...health });
  } catch (err) {
    res.status(500).json({ message: "Health check failed" });
  }
});

// ── GET /api/ai/alerts/:workspaceId ──────────────────────────────────────────
router.get("/alerts/:workspaceId", auth, async (req, res) => {
  try {
    const ws = await pool.query(
      "SELECT id FROM workspaces WHERE id = $1 AND user_id = $2",
      [req.params.workspaceId, req.user.id]
    );
    if (!ws.rows.length) return res.status(403).json({ message: "Access denied" });

    const [tasksRow, wlRow] = await Promise.all([
      pool.query(
        `SELECT t.*,
                (SELECT COUNT(*) FROM task_dependencies td
                 JOIN tasks dep ON td.depends_on_task_id = dep.id
                 WHERE td.task_id = t.id AND dep.status != 'done')::int AS blocking_dep_count
         FROM tasks t WHERE t.workspace_id = $1 AND t.status != 'done'`,
        [req.params.workspaceId]
      ),
      pool.query(
        `SELECT wl.user_id, wl.scheduled_hours, uc.daily_hours, uc.on_leave, uc.travel_mode, u.name
         FROM user_capacity uc
         JOIN users u ON u.id = uc.user_id
         LEFT JOIN workload_logs wl ON wl.user_id = uc.user_id AND wl.date = CURRENT_DATE AND wl.source = 'task'
         WHERE u.id IN (
           SELECT DISTINCT assigned_user_id FROM tasks
           WHERE workspace_id = $1 AND assigned_user_id IS NOT NULL
         )`,
        [req.params.workspaceId]
      ),
    ]);

    const workloadData = wlRow.rows.map(r => {
      const cap = parseFloat(r.daily_hours) || 8;
      const sch = parseFloat(r.scheduled_hours) || 0;
      return {
        user_id: r.user_id, name: r.name,
        load_percent: cap > 0 ? Math.round((sch / cap) * 100) : 0,
        daily_capacity: cap, on_leave: r.on_leave, travel_mode: r.travel_mode,
      };
    });

    const predictions = ai.analyzeWorkspaceTasks(tasksRow.rows, workloadData);
    const alerts      = ai.generatePrescriptiveAlerts(predictions, workloadData);
    const health      = ai.calculateProjectHealth(tasksRow.rows, workloadData);
    const teamStress  = ai.calculateTeamStress(workloadData);

    res.json({ alerts, health, team_stress: teamStress, at_risk_count: health.at_risk_count });
  } catch (err) {
    res.status(500).json({ message: "Alerts failed" });
  }
});

module.exports = router;
