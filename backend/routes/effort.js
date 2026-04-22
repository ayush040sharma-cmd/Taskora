/**
 * Effort Log Routes  (per-day time tracking)
 * GET    /api/effort/:taskId         — logs for a task
 * POST   /api/effort                 — log hours
 * PUT    /api/effort/:id             — update a log entry
 * DELETE /api/effort/:id             — delete a log entry
 * GET    /api/effort/summary/:userId — total hours per task (workspace summary)
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");

// ── GET /api/effort/:taskId ───────────────────────────────────
router.get("/:taskId", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT el.*, u.name AS user_name
       FROM effort_logs el
       LEFT JOIN users u ON u.id = el.user_id
       WHERE el.task_id = $1
       ORDER BY el.log_date DESC, el.created_at DESC`,
      [req.params.taskId]
    );
    // Also return totals
    const totals = rows.reduce(
      (acc, r) => {
        acc.total += Number(r.logged_hours) || 0;
        if (r.user_id === req.user.id) acc.mine += Number(r.logged_hours) || 0;
        return acc;
      },
      { total: 0, mine: 0 }
    );
    res.json({ logs: rows, totals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST /api/effort ─────────────────────────────────────────
router.post("/", auth, async (req, res) => {
  const { task_id, logged_hours, log_date, notes } = req.body;
  if (!task_id || !logged_hours) return res.status(400).json({ message: "task_id and logged_hours required" });
  if (Number(logged_hours) <= 0) return res.status(400).json({ message: "Hours must be > 0" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO effort_logs (task_id, user_id, logged_hours, log_date, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [task_id, req.user.id, logged_hours, log_date || new Date().toISOString().split("T")[0], notes || null]
    );

    // Update actual_hours on the task
    await pool.query(
      `UPDATE tasks
       SET actual_hours = (
         SELECT COALESCE(SUM(logged_hours), 0)
         FROM effort_logs WHERE task_id = $1
       )
       WHERE id = $1`,
      [task_id]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PUT /api/effort/:id ──────────────────────────────────────
router.put("/:id", auth, async (req, res) => {
  const { logged_hours, log_date, notes } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE effort_logs
       SET logged_hours = COALESCE($1, logged_hours),
           log_date     = COALESCE($2, log_date),
           notes        = COALESCE($3, notes)
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [logged_hours, log_date, notes, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Not found or not yours" });

    // Refresh actual_hours
    await pool.query(
      `UPDATE tasks
       SET actual_hours = (SELECT COALESCE(SUM(logged_hours),0) FROM effort_logs WHERE task_id = tasks.id)
       WHERE id = (SELECT task_id FROM effort_logs WHERE id = $1)`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── DELETE /api/effort/:id ───────────────────────────────────
router.delete("/:id", auth, async (req, res) => {
  try {
    const logRow = await pool.query("SELECT task_id FROM effort_logs WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (!logRow.rows.length) return res.status(404).json({ message: "Not found or not yours" });
    const taskId = logRow.rows[0].task_id;

    await pool.query("DELETE FROM effort_logs WHERE id = $1", [req.params.id]);

    // Refresh actual_hours
    await pool.query(
      "UPDATE tasks SET actual_hours = (SELECT COALESCE(SUM(logged_hours),0) FROM effort_logs WHERE task_id=$1) WHERE id=$1",
      [taskId]
    );
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET /api/effort/summary/:userId ─────────────────────────
// Total logged hours per task for a user (workspace scoped via query param)
router.get("/summary/:userId", auth, async (req, res) => {
  const wsId = req.query.workspace_id;
  try {
    const { rows } = await pool.query(
      `SELECT el.task_id, t.title, t.type, t.status,
              SUM(el.logged_hours) AS total_hours,
              COUNT(el.id) AS entry_count
       FROM effort_logs el
       JOIN tasks t ON t.id = el.task_id
       WHERE el.user_id = $1
         ${wsId ? "AND t.workspace_id = $2" : ""}
       GROUP BY el.task_id, t.title, t.type, t.status
       ORDER BY total_hours DESC`,
      wsId ? [req.params.userId, wsId] : [req.params.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
